import { IsObject } from 'class-validator';

/**
 * Meta Ads webhook payload (dynamic structure)
 * Validated as an object, detailed structure varies by webhook event type
 */
export class MetaAdsWebhookDto {
  @IsObject()
  body: Record<string, any>;
}
