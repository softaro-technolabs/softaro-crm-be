import { IsObject } from 'class-validator';

/**
 * Google Ads Lead Form webhook payload (dynamic structure)
 * Validated as an object, detailed structure varies by Google's API version
 */
export class GoogleAdsWebhookDto {
  @IsObject()
  body: Record<string, any>;
}
