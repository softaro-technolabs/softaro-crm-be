import { Injectable } from '@nestjs/common';
import { LeadSource } from './leads.dto';

export type ScoringPayload = {
  source: LeadSource;
  budget: number | null;
  timeOfDay: number;
};

@Injectable()
export class LeadScoringService {
  calculateScore(payload: ScoringPayload): number {
    let score = 0;

    // 1. Source Scoring
    const sourceWeights: Record<LeadSource, number> = {
      website: 30,
      referral: 40,
      facebook: 20,
      google: 20,
      walk_in: 35,
      other: 10
    };
    score += sourceWeights[payload.source] || 10;

    // 2. Budget Scoring (assuming numeric values are in INR/Units)
    // 1 Crore = 10,000,000
    const budget = payload.budget || 0;
    if (budget >= 10000000) {
      score += 40;
    } else if (budget >= 5000000) {
      score += 25;
    } else if (budget > 0) {
      score += 10;
    }

    // 3. Time of Day Scoring (Engagement likelihood)
    if (payload.timeOfDay >= 9 && payload.timeOfDay <= 20) {
      score += 20;
    } else {
      score += 10;
    }

    return Math.min(score, 100);
  }

  getLeadLabel(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= 70) return 'hot';
    if (score >= 40) return 'warm';
    return 'cold';
  }
}
