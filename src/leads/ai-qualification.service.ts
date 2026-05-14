import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { LocationPointDto } from './location-preference.dto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AiQualificationResult = {
  score: number;
  label: 'hot' | 'warm' | 'cold';
  summary: string;
  reasoning: string[];
  ruleScore: number;       // NEW: rule-based anchor score
  finalScore: number;      // NEW: blended final score
  suggestedNextAction: string; // NEW: human work easy
  agentScript: string;         // NEW: human work easy
  propertyMatchScore: number;  // NEW: AI match
  matchedPropertyId?: string;  // NEW: AI match
  matchedPropertyName?: string; // NEW: AI match
  modelUsed: string;       // NEW: audit trail
  promptVersion: string;   // NEW: prompt versioning
  qualifiedAt: string;     // NEW: timestamp
};

export interface LeadQualificationInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  budget?: number | null;
  requirementType: string;
  propertyType?: string | null;
  propertyCategory?: string | null;
  bhkType?: string | null;
  locationPreference?: string | string[] | LocationPointDto | null;
  notes?: string | null;
  leadSource?: string | null;
  // Richer signals (add to your DTO/entity over time)
  siteVisitCount?: number;
  followUpCount?: number;
  loanPreApproved?: boolean;
  timeline?: 'immediate' | '1-3months' | '3-6months' | '6months+' | 'exploring';
  availableProperties?: Array<{ id: string; name: string; type: string; category?: string; location?: string; budget_min?: number }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROMPT_VERSION = 'v1.2';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Model routing — each task uses the Groq model best suited for it:
 *
 *  QUALIFICATION  llama-3.3-70b-versatile
 *    Complex reasoning + structured JSON output; supports response_format:json_object.
 *    Best accuracy for scoring, property matching, agent-script generation.
 *
 *  CHAT_REALTIME  llama-3.1-8b-instant
 *    Sub-second WhatsApp responses. 8B is fast enough for fact-based replies
 *    from a structured DB context; no need for 70B at real-time latency.
 *
 *  EMAIL_DRAFT    llama-3.3-70b-versatile
 *    Nuanced, persuasive long-form writing needs the full 70B language quality.
 *
 *  AI_WHATSAPP    llama-3.1-8b-instant
 *    High-volume automation personalization; speed + cost trump quality here.
 *    Short message generation, 200-token max.
 *
 *  ANALYTICS      mixtral-8x7b-32768
 *    32k context window handles large batches of lead/deal stats efficiently.
 *    MoE architecture excels at summarisation and pattern extraction.
 */
const MODELS = {
  QUALIFICATION: 'llama-3.3-70b-versatile',
  CHAT_REALTIME: 'llama-3.1-8b-instant',
  EMAIL_DRAFT:   'llama-3.3-70b-versatile',
  AI_WHATSAPP:   'llama-3.1-8b-instant',
  ANALYTICS:     'mixtral-8x7b-32768',
} as const;

const LABEL_THRESHOLDS = {
  hot: 70,
  warm: 40,
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiQualificationService {
  private readonly logger = new Logger(AiQualificationService.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('groq.apiKey') || '';
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async qualifyLead(leadData: LeadQualificationInput): Promise<AiQualificationResult | null> {
    if (!this.apiKey) {
      this.logger.warn('GROQ_API_KEY is not set — skipping AI qualification');
      return null;
    }

    // 1. Rule-based score (fast, deterministic, always runs)
    const ruleScore = this.computeRuleScore(leadData);

    // 2. AI score with retry + output validation
    const aiResult = await this.callGroqWithRetry(leadData);
    if (!aiResult) {
      // Fallback: use rule score only
      return this.buildFallbackResult(ruleScore, leadData);
    }

    // 3. Blend scores: 40% rule, 60% AI
    const finalScore = Math.round(ruleScore * 0.4 + aiResult.score * 0.6);
    const label = this.scoreToLabel(finalScore);

    return {
      score: aiResult.score,
      label,
      summary: aiResult.summary,
      reasoning: aiResult.reasoning,
      suggestedNextAction: aiResult.suggestedNextAction,
      agentScript: aiResult.agentScript,
      propertyMatchScore: aiResult.propertyMatchScore,
      matchedPropertyId: aiResult.matchedPropertyId,
      matchedPropertyName: aiResult.matchedPropertyName,
      ruleScore,
      finalScore,
      modelUsed: MODELS.QUALIFICATION,
      promptVersion: PROMPT_VERSION,
      qualifiedAt: new Date().toISOString(),
    };
  }

  // ── AI WhatsApp Chatbot ───────────────────────────────────────────────────

  async generateChatResponse(
    tenantId: string,
    message: string,
    leadData: LeadQualificationInput,
    history: string[]
  ): Promise<{ text: string; imageUrls?: string[] } | null> {
    if (!this.apiKey) return null;

    // Build a compact property summary — only what's needed, no bloat
    const propertySummary = leadData.availableProperties?.length
      ? leadData.availableProperties.map(p =>
          `${p.name} | ${p.type} | ${p.location || 'N/A'} | Budget: ₹${p.budget_min?.toLocaleString('en-IN') || 'check with us'}` +
          ((p as any).unitSummary ? ` | ${(p as any).unitSummary}` : '')
        ).join('\n')
      : 'No properties listed yet';

    const recentHistory = history.slice(-6).join('\n'); // last 6 turns only — keep context tight

    const systemPrompt = `You are Priya, a real estate sales executive at our company in India. You talk on WhatsApp.

PERSONALITY:
- You text like a real person — casual, warm, Indian English
- Short replies. 1–3 sentences MAX. Never write paragraphs.
- Never use bullet points, numbered lists, or headers in chat
- Never start with "Certainly!", "Of course!", "Great question!", "I hope you're doing well"
- Never repeat what you said before. Read the history and move the conversation forward.
- If you don't know something exact, say "let me check and get back to you" — never guess prices

WHAT YOU KNOW (from our database):
${propertySummary}

RULES:
- Share images ONLY if customer explicitly asks ("send photos", "brochure", "how it looks") OR first message introducing a project
- Never send same image twice (check history)
- Max 2 images at a time
- Prices: only quote exact figures from the database above, never estimate`;

    const userPrompt = `Customer name: ${leadData.name}
Budget: ${leadData.budget ? `₹${Number(leadData.budget).toLocaleString('en-IN')}` : 'not shared'}
Looking for: ${leadData.requirementType || ''} ${leadData.propertyType || ''} ${leadData.bhkType || ''}

Recent chat (last few messages):
${recentHistory || 'No history yet — this is the first message'}

Customer just sent:
"${message}"

Reply as Priya. Short. Human. WhatsApp style. If images are relevant, include their URLs.

Respond ONLY as JSON:
{"text": "your reply here", "imageUrls": []}`;

    try {
      const response = await axios.post(
        API_URL,
        {
          model: MODELS.CHAT_REALTIME,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.55,  // natural variation — avoids repetitive robotic phrasing
          max_tokens: 160,    // hard cap — forces short WhatsApp-length replies
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content?.trim();
      if (!content) return null;

      try {
        const parsed = JSON.parse(content);
        let imageUrls: string[] | undefined = undefined;
        if (Array.isArray(parsed.imageUrls) && parsed.imageUrls.length > 0) {
          imageUrls = (parsed.imageUrls as unknown[])
            .filter((url): url is string => typeof url === 'string' && url.startsWith('http'))
            .slice(0, 2); // max 2 images
        }

        const text = typeof parsed.text === 'string' ? parsed.text.trim() : content;
        return { text, imageUrls: imageUrls?.length ? imageUrls : undefined };
      } catch (e) {
        this.logger.warn('[AI Chat] Response not valid JSON, using raw text');
        return { text: content };
      }
    } catch (error) {
      this.logger.error('Failed to generate AI chat response', error);
      return null;
    }
  }

  // ── Rule-Based Scoring ──────────────────────────────────────────────────────

  private computeRuleScore(lead: LeadQualificationInput): number {
    let score = 0;

    // Budget clarity (20 pts)
    if (lead.budget && lead.budget > 0) score += 20;

    // Timeline urgency (25 pts)
    if (lead.timeline === 'immediate') score += 25;
    else if (lead.timeline === '1-3months') score += 15;
    else if (lead.timeline === '3-6months') score += 8;

    // Site visit history — strongest buying signal (20 pts)
    if ((lead.siteVisitCount ?? 0) >= 2) score += 20;
    else if ((lead.siteVisitCount ?? 0) === 1) score += 12;

    // Contact completeness (10 pts)
    if (lead.phone && lead.email) score += 10;
    else if (lead.phone || lead.email) score += 5;

    // Financial readiness (15 pts)
    if (lead.loanPreApproved) score += 15;

    // Source quality (10 pts)
    if (lead.leadSource === 'referral') score += 10;
    else if (['google', 'facebook'].includes(lead.leadSource ?? '')) score += 5;

    // Requirement specificity (bonus up to 10 pts)
    if (lead.propertyType) score += 3;
    if (lead.bhkType) score += 3;
    if (lead.locationPreference) score += 4;

    return Math.min(score, 100);
  }

  // ── Groq API Call with Retry ────────────────────────────────────────────────

  private async callGroqWithRetry(
    leadData: LeadQualificationInput,
    retries = 3,
  ): Promise<Pick<AiQualificationResult, 'score' | 'summary' | 'reasoning' | 'suggestedNextAction' | 'agentScript' | 'propertyMatchScore' | 'matchedPropertyId' | 'matchedPropertyName'> | null> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.callGroq(leadData);
      } catch (error) {
        const isLast = attempt === retries;
        const isRateLimit = (error as AxiosError)?.response?.status === 429;

        this.logger.warn(
          `Groq call failed (attempt ${attempt}/${retries})${isRateLimit ? ' [rate limited]' : ''}`,
        );

        if (isLast) {
          this.logger.error('All Groq retries exhausted — falling back to rule score');
          return null;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delay = isRateLimit ? 5000 : 2 ** (attempt - 1) * 1000;
        await this.sleep(delay);
      }
    }
    return null;
  }

  private async callGroq(
    leadData: LeadQualificationInput,
  ): Promise<Pick<AiQualificationResult, 'score' | 'summary' | 'reasoning' | 'suggestedNextAction' | 'agentScript' | 'propertyMatchScore' | 'matchedPropertyId' | 'matchedPropertyName'> | null> {
    const prompt = this.buildPrompt(leadData);

    const response = await axios.post(
      API_URL,
      {
        model: MODELS.QUALIFICATION,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that outputs valid JSON only. No markdown, no explanation.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 512,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000, // 15s hard timeout
      },
    );

    const raw = response.data?.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return this.validateAiOutput(parsed);
  }

  // ── Prompt Builder ──────────────────────────────────────────────────────────

  private buildPrompt(lead: LeadQualificationInput): string {
    const location =
      typeof lead.locationPreference === 'string'
        ? lead.locationPreference
        : Array.isArray(lead.locationPreference)
          ? lead.locationPreference.join(', ')
          : lead.locationPreference?.name || 'N/A';

    return `
You are an expert real estate lead qualification assistant in India.
Analyze the lead details and return a JSON qualification.

Lead Details:
- Name: ${lead.name}
- Phone: ${lead.phone || 'N/A'} | Email: ${lead.email || 'N/A'}
- Budget: ${lead.budget ? `₹${lead.budget.toLocaleString('en-IN')}` : 'N/A'}
- Requirement: ${lead.requirementType}
- Property Type: ${lead.propertyType || 'N/A'}
- Category: ${lead.propertyCategory || 'N/A'}
- BHK: ${lead.bhkType || 'N/A'}
- Location Preference: ${location}
- Timeline: ${lead.timeline || 'N/A'}
- Loan Pre-approved: ${lead.loanPreApproved ?? 'N/A'}
- Site Visits Done: ${lead.siteVisitCount ?? 0}
- Lead Source: ${lead.leadSource || 'N/A'}
- Notes: ${this.sanitizeInput(lead.notes) || 'N/A'}

Available Properties to Match:
${lead.availableProperties?.map(p => `- [ID: ${p.id}] Name: ${p.name}, Type: ${p.type}, Category: ${p.category || 'N/A'}, Location: ${p.location || 'N/A'}`).join('\n') || 'No properties available.'}

Scoring Criteria:
- "hot" (70-100): Clear budget, specific requirements, immediate/near-term timeline, or site visits done
- "warm" (40-69): Has some details but early stage or vague requirements
- "cold" (0-39): Very vague, no budget, no contact info, or just browsing

Return ONLY this JSON (no markdown, no extra text):
{
  "score": <number 0-100>,
  "summary": "<1-2 sentence quality summary>",
  "reasoning": ["<point1>", "<point2>", "<point3>"],
  "suggestedNextAction": "<Specific action for the agent to take>",
  "agentScript": "<A short WhatsApp/Call script for the agent>",
  "propertyMatchScore": <number 0-100 matching lead to best available property>,
  "matchedPropertyId": "<ID of the best matching property from the list>",
  "matchedPropertyName": "<Name of the best matching property>"
}
`.trim();
  }

  // ── Output Validation ───────────────────────────────────────────────────────

  private validateAiOutput(
    obj: unknown,
  ): Pick<AiQualificationResult, 'score' | 'summary' | 'reasoning' | 'suggestedNextAction' | 'agentScript' | 'propertyMatchScore' | 'matchedPropertyId' | 'matchedPropertyName'> | null {
    if (!obj || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;

    const score = typeof o['score'] === 'number' ? o['score'] : Number(o['score']);
    if (isNaN(score) || score < 0 || score > 100) {
      this.logger.warn('AI returned invalid score, discarding', { raw: o });
      return null;
    }

    const summary = typeof o['summary'] === 'string' && o['summary'].length > 0
      ? o['summary']
      : 'No summary provided.';

    const reasoning = Array.isArray(o['reasoning'])
      ? (o['reasoning'] as unknown[]).filter((r): r is string => typeof r === 'string').slice(0, 5)
      : [];

    const agentScript = typeof o['agentScript'] === 'string' ? o['agentScript'] : 'No script provided.';
    const suggestedNextAction = typeof o['suggestedNextAction'] === 'string' ? o['suggestedNextAction'] : 'Follow up with lead.';
    const propertyMatchScore = typeof o['propertyMatchScore'] === 'number' ? o['propertyMatchScore'] : 0;
    const matchedPropertyId = typeof o['matchedPropertyId'] === 'string' ? o['matchedPropertyId'] : undefined;
    const matchedPropertyName = typeof o['matchedPropertyName'] === 'string' ? o['matchedPropertyName'] : undefined;

    return { score, summary, reasoning, suggestedNextAction, agentScript, propertyMatchScore, matchedPropertyId, matchedPropertyName };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private buildFallbackResult(ruleScore: number, lead: LeadQualificationInput): AiQualificationResult {
    const label = this.scoreToLabel(ruleScore);
    return {
      score: ruleScore,
      label,
      summary: 'Scored using rule-based engine (AI unavailable).',
      reasoning: ['AI qualification was skipped — rule-based score applied as fallback.'],
      suggestedNextAction: 'Check lead details manually.',
      agentScript: 'Hi, I saw your inquiry about properties. Would you like more details?',
      propertyMatchScore: 0,
      ruleScore,
      finalScore: ruleScore,
      modelUsed: 'rule-engine',
      promptVersion: PROMPT_VERSION,
      qualifiedAt: new Date().toISOString(),
    };
  }

  private scoreToLabel(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= LABEL_THRESHOLDS.hot) return 'hot';
    if (score >= LABEL_THRESHOLDS.warm) return 'warm';
    return 'cold';
  }

  // ── AI Email Drafting ─────────────────────────────────────────────────────
  // Model: llama-3.3-70b-versatile — needs full 70B quality for persuasive writing

  async draftLeadEmail(lead: {
    name: string;
    email?: string | null;
    phone?: string | null;
    budget?: number | null;
    requirementType?: string | null;
    propertyType?: string | null;
    bhkType?: string | null;
    leadSource?: string | null;
    notes?: string | null;
    aiQualification?: {
      label?: string;
      score?: number;
      suggestedNextAction?: string;
      matchedPropertyName?: string;
    } | null;
  }): Promise<{ subject: string; body: string; tone: string } | null> {
    if (!this.apiKey) return null;

    const prompt = `
You are an expert real estate sales executive writing a personalized follow-up email in Indian English.

Lead Profile:
- Name: ${this.sanitizeInput(lead.name)}
- Budget: ${lead.budget ? `₹${Number(lead.budget).toLocaleString('en-IN')}` : 'Not specified'}
- Looking for: ${lead.requirementType || 'Property'} — ${lead.propertyType || ''} ${lead.bhkType || ''}
- Source: ${lead.leadSource || 'Unknown'}
- AI Score: ${lead.aiQualification?.label || 'unknown'} (${lead.aiQualification?.score ?? '—'}/100)
- Matched Property: ${lead.aiQualification?.matchedPropertyName || 'None yet'}
- AI Suggested Action: ${lead.aiQualification?.suggestedNextAction || 'Follow up'}
- Notes: ${this.sanitizeInput(lead.notes) || 'None'}

Write a warm, professional follow-up email. Guidelines:
- Address them by first name
- Reference their specific requirement if known
- Mention the matched property if available
- Include a clear call-to-action (schedule a site visit or call)
- Keep it concise (150-200 words max)
- Tone: professional but friendly, Indian real estate context
- NO generic filler phrases like "I hope this email finds you well"

Return ONLY this JSON:
{
  "subject": "<compelling email subject line>",
  "body": "<full email body with \\n for line breaks>",
  "tone": "<warm|professional|urgent>"
}
`.trim();

    try {
      const response = await axios.post(
        API_URL,
        {
          model: MODELS.EMAIL_DRAFT,
          messages: [
            { role: 'system', content: 'You are a real estate sales expert. Output only valid JSON.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens: 600,
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      );

      const raw = response.data?.choices?.[0]?.message?.content;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        subject: typeof parsed.subject === 'string' ? parsed.subject : 'Following up on your property inquiry',
        body: typeof parsed.body === 'string' ? parsed.body : '',
        tone: typeof parsed.tone === 'string' ? parsed.tone : 'professional',
      };
    } catch (err) {
      this.logger.error('[AI Email Draft] Failed', err);
      return null;
    }
  }

  // ── AI Personalized WhatsApp (for Automation) ─────────────────────────────
  // Model: llama-3.1-8b-instant — high-volume, speed matters, short output

  async generatePersonalizedWhatsApp(lead: {
    name: string;
    phone?: string | null;
    budget?: number | null;
    requirementType?: string | null;
    propertyType?: string | null;
    bhkType?: string | null;
    aiQualification?: { label?: string; matchedPropertyName?: string; suggestedNextAction?: string } | null;
  }, contextPrompt?: string): Promise<string | null> {
    if (!this.apiKey) return null;

    const prompt = `
You are a real estate sales agent in India. Write a short, friendly WhatsApp message to a lead.

Lead:
- Name: ${this.sanitizeInput(lead.name)}
- Looking for: ${lead.requirementType || 'property'} ${lead.bhkType || ''} ${lead.propertyType || ''}
- Budget: ${lead.budget ? `₹${Number(lead.budget).toLocaleString('en-IN')}` : 'not specified'}
- AI Label: ${lead.aiQualification?.label || 'unknown'}
- Matched Property: ${lead.aiQualification?.matchedPropertyName || 'not matched yet'}
${contextPrompt ? `- Agent context: ${this.sanitizeInput(contextPrompt)}` : ''}

Write ONE short WhatsApp message (max 3 sentences).
- Address them by first name
- Be conversational, not salesy
- Include one specific detail about their requirement
- End with a question or soft CTA
- Output plain text only, no JSON, no quotes
`.trim();

    try {
      const response = await axios.post(
        API_URL,
        {
          model: MODELS.AI_WHATSAPP,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 200,
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 8000,
        },
      );
      const text = response.data?.choices?.[0]?.message?.content?.trim();
      return text || null;
    } catch (err) {
      this.logger.error('[AI WhatsApp] Failed', err);
      return null;
    }
  }

  // ── AI Analytics Insights ─────────────────────────────────────────────────
  // Model: mixtral-8x7b-32768 — 32k context handles large stats batches;
  // MoE architecture is efficient for summarisation and pattern extraction

  async generateAnalyticsInsights(stats: {
    totalLeads: number;
    hotLeads: number;
    warmLeads: number;
    coldLeads: number;
    convertedLeads: number;
    avgScore: number;
    topSources: { source: string; count: number }[];
    topDropOffStage: string;
    siteVisitRate: number;
    avgResponseTimeHours: number;
    period: string;
  }): Promise<{ summary: string; insights: string[]; recommendations: string[] } | null> {
    if (!this.apiKey) return null;

    const prompt = `
You are a senior real estate CRM analyst. Analyze these lead pipeline stats and produce actionable insights.

Period: ${stats.period}
Lead Stats:
- Total Leads: ${stats.totalLeads}
- Hot / Warm / Cold: ${stats.hotLeads} / ${stats.warmLeads} / ${stats.coldLeads}
- Converted: ${stats.convertedLeads} (${stats.totalLeads > 0 ? ((stats.convertedLeads / stats.totalLeads) * 100).toFixed(1) : 0}% conversion)
- Avg AI Score: ${stats.avgScore}
- Top Lead Sources: ${stats.topSources.map(s => `${s.source} (${s.count})`).join(', ')}
- Top Drop-off Stage: ${stats.topDropOffStage}
- Site Visit Rate: ${stats.siteVisitRate}%
- Avg Agent Response Time: ${stats.avgResponseTimeHours}h

Return ONLY this JSON:
{
  "summary": "<2-3 sentence executive summary>",
  "insights": ["<key insight 1>", "<key insight 2>", "<key insight 3>", "<key insight 4>"],
  "recommendations": ["<actionable recommendation 1>", "<actionable recommendation 2>", "<actionable recommendation 3>"]
}
`.trim();

    try {
      const response = await axios.post(
        API_URL,
        {
          model: MODELS.ANALYTICS,
          messages: [
            { role: 'system', content: 'You are a CRM data analyst. Output only valid JSON.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 700,
        },
        {
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          timeout: 20000,
        },
      );
      const raw = response.data?.choices?.[0]?.message?.content;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        insights: Array.isArray(parsed.insights) ? parsed.insights.filter((i: unknown) => typeof i === 'string') : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.filter((r: unknown) => typeof r === 'string') : [],
      };
    } catch (err) {
      this.logger.error('[AI Analytics] Failed', err);
      return null;
    }
  }

  /** Strip prompt-injection attempts from free-text fields before interpolation */
  private sanitizeInput(text?: string | null): string {
    if (!text) return '';
    return text
      .replace(/```[\s\S]*?```/g, '[code block removed]')
      .replace(/system:/gi, '[system]')
      .replace(/IGNORE (PREVIOUS|ALL|ABOVE)/gi, '[filtered]')
      .replace(/you are (now|a|an)/gi, '[filtered]')
      .replace(/return ONLY|respond ONLY|output ONLY/gi, '[filtered]')
      .trim()
      .slice(0, 500); // Hard-cap notes at 500 chars
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}