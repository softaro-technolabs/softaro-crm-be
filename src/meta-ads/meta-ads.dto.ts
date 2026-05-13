import { IsObject, IsString } from 'class-validator';

export class ConnectPageDto {
  @IsString()
  pageId!: string;

  @IsString()
  pageName!: string;

  @IsString()
  pageAccessToken!: string;
}

/**
 * Meta Ads webhook payload (dynamic structure)
 * Validated as an object, detailed structure varies by webhook event type
 */
export class MetaAdsWebhookDto {
  @IsObject()
  body!: Record<string, any>;
}
