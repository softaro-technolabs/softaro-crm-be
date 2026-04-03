import { Controller, Post, Body, Query, Logger, Res, Param, Get } from '@nestjs/common';
import { Response } from 'express';
import { GoogleAdsService } from './google-ads.service';
import { LeadsService } from '../leads/leads.service';
import { LeadAssignmentService } from '../leads/lead-assignment.service';

@Controller('tenants/:tenantId/google-ads')
export class GoogleAdsController {
    private readonly logger = new Logger(GoogleAdsController.name);

    constructor(
        private readonly googleAdsService: GoogleAdsService,
        private readonly leadAssignmentService: LeadAssignmentService
    ) { }

    @Get('settings')
    async getSettings(@Param('tenantId') tenantId: string) {
        const settings = await this.leadAssignmentService.getSettings(tenantId);
        
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const webhookUrl = `${baseUrl.replace('5173', '3001')}/public/google-ads/webhook/${tenantId}?key=${settings.webhookSecret}`;

        return {
            webhookUrl,
            webhookSecret: settings.webhookSecret,
            instructions: "Copy this Webhook URL and paste it into project's Google Ads Lead Form extension settings."
        };
    }
}

@Controller('public/google-ads')
export class GoogleAdsWebhookController {
    private readonly logger = new Logger(GoogleAdsWebhookController.name);

    constructor(
        private readonly googleAdsService: GoogleAdsService,
        private readonly leadsService: LeadsService,
        private readonly leadAssignmentService: LeadAssignmentService
    ) { }

    @Post('webhook/:tenantId')
    async handleWebhook(
        @Param('tenantId') tenantId: string,
        @Body() data: any,
        @Query('key') key: string,
        @Res() res: Response
    ) {
        this.logger.log(`Incoming Google Ads webhook for tenant: ${tenantId}`);

        // 1. Verify the Secret Key
        try {
            const settings = await this.leadAssignmentService.getSettings(tenantId);
            if (key !== settings.webhookSecret) {
                this.logger.warn(`Invalid webhook key for tenant ${tenantId}`);
                return res.status(403).send('Forbidden');
            }

            // Google Ads expects a 200 response
            res.status(200).send('OK');

            const mappedLead = await this.googleAdsService.processIncomingLead(tenantId, data);
            
            // Create the lead in the CRM
            await this.leadsService.createLead(tenantId, {
                name: mappedLead.name,
                email: mappedLead.email,
                phone: mappedLead.phone,
                leadSource: 'google',
                captureChannel: 'google_ads',
                notes: mappedLead.notes,
                autoAssign: true,
                requirementType: 'buy'
            });

            this.logger.log(`Google Ads lead processed successfully for tenant ${tenantId}`);
        } catch (error: any) {
            this.logger.error(`Failed to process Google Ads webhook: ${error.message}`);
            if (!res.headersSent) {
                res.status(500).send('Internal Server Error');
            }
        }
    }
}
