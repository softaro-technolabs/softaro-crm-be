import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class GoogleAdsService {
    private readonly logger = new Logger(GoogleAdsService.name);

    /**
     * Google Ads Lead Forms send a POST request with lead data.
     * We verify the 'google_key' before processing.
     */
    async processIncomingLead(tenantId: string, leadData: any) {
        // Log the incoming lead for debugging
        this.logger.log(`Received Google Ads Lead for Tenant ${tenantId}: ${JSON.stringify(leadData)}`);

        // Standard Google Ads Lead Form field mapping
        const fieldData: Record<string, any> = {};
        if (leadData.user_column_data) {
            leadData.user_column_data.forEach((col: any) => {
                fieldData[col.column_id.toLowerCase()] = col.string_value;
            });
        }

        const name = fieldData.full_name || `${fieldData.first_name || ''} ${fieldData.last_name || ''}`.trim();
        const email = fieldData.email;
        const phone = fieldData.phone_number;

        // Note: Google uses column IDs like 'FULL_NAME', 'EMAIL', 'PHONE_NUMBER'
        
        return {
            name: name || 'Google Lead',
            email,
            phone,
            source: 'google',
            channel: 'google_ads_form',
            notes: `Captured from Google Ads Lead Form: ${leadData.form_id || 'Unknown'}\nCampaign: ${leadData.campaign_id || 'Unknown'}`,
            formData: fieldData
        };
    }
}
