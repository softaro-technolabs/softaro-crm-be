import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type AiQualificationResult = {
  score: number;
  label: 'hot' | 'warm' | 'cold';
  summary: string;
  reasoning: string[];
};

@Injectable()
export class AiQualificationService {
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('groq.apiKey') || '';
  }

  async qualifyLead(leadData: any): Promise<AiQualificationResult | null> {
    if (!this.apiKey) {
      console.warn('[AiQualificationService] GROQ_API_KEY is not set. Skipping AI qualification.');
      return null;
    }

    const prompt = `
      You are an expert real estate lead qualification assistant. 
      Analyze the following lead details and provide a qualification summary, a score (0-100), and a label (hot, warm, cold).
      
      Lead Details:
      - Name: ${leadData.name}
      - Email: ${leadData.email || 'N/A'}
      - Phone: ${leadData.phone || 'N/A'}
      - Budget: ${leadData.budget || 'N/A'}
      - Requirement Type: ${leadData.requirementType}
      - Property Type: ${leadData.propertyType || 'N/A'}
      - Property Category: ${leadData.propertyCategory || 'N/A'}
      - BHK Type: ${leadData.bhkType || 'N/A'}
      - Location Preference: ${typeof leadData.locationPreference === 'string' ? leadData.locationPreference : JSON.stringify(leadData.locationPreference || 'N/A')}
      - Notes: ${leadData.notes || 'N/A'}
      
      A "hot" lead typically has a clear budget, specific requirements, and is looking for immediate or near-term options.
      A "warm" lead has some interest but may be early in their journey or have less specific requirements.
      A "cold" lead has very vague requirements or low engagement signals.

      Return the result strictly in JSON format with the following structure:
      {
        "score": number,
        "label": "hot" | "warm" | "cold",
        "summary": "Short 1-2 sentence summary of the lead's quality",
        "reasoning": ["point1", "point2", "point3"]
      }
    `;

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { 
              role: 'system', 
              content: 'You are a helpful assistant that outputs JSON.' 
            },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0].message.content;
      return JSON.parse(content) as AiQualificationResult;
    } catch (error: any) {
      console.error('[AiQualificationService] Error during AI qualification:', error.response?.data || error.message);
      return null;
    }
  }
}
