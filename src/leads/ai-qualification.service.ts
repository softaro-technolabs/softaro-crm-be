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

const PROMPT_VERSION = 'v1.1';
const MODEL = 'llama-3.3-70b-versatile';
const API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
      modelUsed: MODEL,
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
  ): Promise<{ text: string; imageUrl?: string } | null> {
    if (!this.apiKey) return null;

    const prompt = `
You are a friendly, knowledgeable, and human-like real estate sales assistant in India.
Your goal is to have a natural conversation with the customer on WhatsApp and provide accurate information about our properties.

CORE GUIDELINES:
1. TALK LIKE A HUMAN: Avoid robotic phrases like "How can I assist you?" or "I am here to help." Use casual but professional language (e.g., "Hi! Sure, I can help with that," "That's a great choice," "Actually, we have something that fits perfectly").
2. DATA-DRIVEN ANSWERS: Only provide information based on the "Our Available Properties" section below. If asked about price, BHK, or amenities, look at the units and attributes provided.
3. BE CONCISE: People use WhatsApp for quick chats. Keep your replies short and snappy.
4. DON'T BE PUSHY: Don't ask for a call or site visit in every single message. Focus on answering their question first. Only suggest a call or visit if it feels natural (e.g., after they show strong interest).
5. STAY WITHIN TENANT: Never mention properties or details not listed in the context below.

Context:
- Customer Name: ${leadData.name}
- Their Requirements: ${leadData.requirementType} ${leadData.propertyType || ''}
- Their Budget: ${leadData.budget || 'N/A'}
- Recent Conversation History:
${history.map(h => `- ${h}`).join('\n')}

Our Available Properties & Details:
${leadData.availableProperties?.map(p => `- [${p.name} in ${p.location}]
  Type: ${p.type}
  Details: ${(p as any).unitSummary || 'Contact for details'}
  Amenities: ${(p as any).attributes || 'Standard amenities'}
  Available Images: ${(p as any).imageUrls?.join(', ') || 'No images available'}`).join('\n') || 'N/A'}

The Customer's Message:
"${message}"

Instructions for Output:
YOU MUST RESPOND ONLY WITH A VALID JSON OBJECT. DO NOT INCLUDE ANY TEXT OUTSIDE THE JSON.
{
  "text": "Your human-like response text here",
  "imageUrl": "Choose the most relevant image URL from the 'Available Images' list above IF the customer asked for photos or if you want to showcase a specific property. Leave null if not sending an image."
}

Response:`.trim();

    try {
      const response = await axios.post(
        API_URL,
        {
          model: MODEL,
          messages: [
            { role: 'system', content: 'You are a professional real estate assistant. Reply naturally and helpfully.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 256,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      let content = response.data?.choices?.[0]?.message?.content?.trim();
      if (!content) return null;

      // Clean up markdown code blocks if AI included them
      if (content.startsWith('```')) {
        content = content.replace(/^```json\n?/, '').replace(/```$/, '').trim();
      }

      try {
        const parsed = JSON.parse(content);
        return {
          text: typeof parsed.text === 'string' ? parsed.text : content,
          imageUrl: (typeof parsed.imageUrl === 'string' && parsed.imageUrl.startsWith('http')) ? parsed.imageUrl : undefined
        };
      } catch (e) {
        this.logger.warn('AI Chat Response was not valid JSON, falling back to raw text', content);
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
        model: MODEL,
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
- Notes: ${lead.notes || 'N/A'}

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

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}