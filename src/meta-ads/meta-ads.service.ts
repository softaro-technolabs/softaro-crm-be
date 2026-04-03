import { Injectable, Inject, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { eq, and } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import { metaAdsAccounts, metaAdsLeads } from '../database/schema';
import { EncryptionService } from '../common/services/encryption.service';
import { LeadsService } from '../leads/leads.service';

@Injectable()
export class MetaAdsService {
    private readonly logger = new Logger(MetaAdsService.name);
    private readonly baseUrl = 'https://graph.facebook.com/v18.0';

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
        private readonly encryptionService: EncryptionService,
        private readonly leadsService: LeadsService
    ) { }

    getAuthUrl(tenantId: string) {
        const clientId = '954680540449477';
        const redirectUri = 'http://localhost:5173/settings/meta-ads/callback';
        const scopes = [
            'ads_management',
            'leads_retrieval',
            'pages_show_list',
            'pages_read_engagement',
            'public_profile'
        ].join(',');

        return {
            url: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${tenantId}`
        };
    }

    async exchangeCode(tenantId: string, code: string) {
        const clientId = '954680540449477';
        const clientSecret = 'abfdb9688d296ab87e31a81ea9b540c9';
        const redirectUri = 'http://localhost:5173/settings/meta-ads/callback';

        try {
            // 1. Exchange code for user access token
            const tokenRes = await axios.get(`${this.baseUrl}/oauth/access_token`, {
                params: {
                    client_id: clientId,
                    client_secret: clientSecret,
                    code: code,
                    redirect_uri: redirectUri
                }
            });

            const userToken = tokenRes.data.access_token;

            // 2. Fetch pages the user manages
            const pagesRes = await axios.get(`${this.baseUrl}/me/accounts`, {
                params: { access_token: userToken }
            });

            // Return pages so the user can choose which one to connect
            return {
                pages: pagesRes.data.data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    accessToken: p.access_token // This is a Page Access Token
                }))
            };
        } catch (error: any) {
            this.logger.error('Error exchanging Meta Ads code:', error.response?.data || error.message);
            throw new BadRequestException('Failed to exchange code with Meta');
        }
    }

    async connectPage(tenantId: string, pageId: string, pageName: string, pageAccessToken: string) {
        const existing = await this.db
            .select()
            .from(metaAdsAccounts)
            .where(and(eq(metaAdsAccounts.tenantId, tenantId), eq(metaAdsAccounts.pageId, pageId)))
            .limit(1);

        const encryptedToken = this.encryptionService.encrypt(pageAccessToken);

        if (existing.length > 0) {
            await this.db
                .update(metaAdsAccounts)
                .set({
                    pageName,
                    encryptedPageAccessToken: encryptedToken,
                    isActive: true,
                    updatedAt: new Date()
                })
                .where(eq(metaAdsAccounts.id, existing[0].id));
        } else {
            await this.db.insert(metaAdsAccounts).values({
                id: randomUUID(),
                tenantId,
                pageId,
                pageName,
                encryptedPageAccessToken: encryptedToken,
                isActive: true
            });
        }

        // Subscribe to the LeadGen webhook for this page automatically
        try {
            await this.subscribeToWebhooks(pageId, pageAccessToken);
        } catch (error: any) {
            this.logger.error(`Failed to subscribe to webhooks for page ${pageId}`, error.message);
        }

        return { success: true };
    }

    private async subscribeToWebhooks(pageId: string, pageAccessToken: string) {
        this.logger.log(`Subscribing to webhooks for page ${pageId}`);
        await axios.post(`${this.baseUrl}/${pageId}/subscribed_apps`, {
            subscribed_fields: ['leadgen'],
            access_token: pageAccessToken
        });
    }

    async handleWebhook(data: any) {
        this.logger.debug('Received Meta Webhook:', JSON.stringify(data));
        if (data.object !== 'page') return;

        for (const entry of data.entry) {
            for (const change of entry.changes) {
                if (change.field === 'leadgen') {
                    const leadId = change.value.leadgen_id;
                    const pageId = change.value.page_id;
                    const formId = change.value.form_id;

                    await this.processIncomingLead(pageId, leadId, formId);
                }
            }
        }
    }

    private async processIncomingLead(pageId: string, leadgenId: string, formId: string) {
        // Find the tenant associated with this page
        const [account] = await this.db.select().from(metaAdsAccounts).where(eq(metaAdsAccounts.pageId, pageId)).limit(1);
        if (!account || !account.isActive) {
            this.logger.warn(`No active account found for page ${pageId}. Ignoring lead ${leadgenId}`);
            return;
        }

        // Check if lead already processed
        const [existing] = await this.db.select().from(metaAdsLeads).where(eq(metaAdsLeads.leadgenId, leadgenId)).limit(1);
        if (existing) {
            this.logger.log(`Lead ${leadgenId} already processed.`);
            return;
        }

        const pageAccessToken = this.encryptionService.decrypt(account.encryptedPageAccessToken);

        try {
            // Fetch lead details from Meta
            const leadResponse = await axios.get(`${this.baseUrl}/${leadgenId}`, {
                params: { access_token: pageAccessToken }
            });

            const formDataList = leadResponse.data.field_data;
            const formDataMap: Record<string, any> = {};
            formDataList.forEach((field: any) => {
                formDataMap[field.name] = field.values[0];
            });

            // Map standard fields
            const name = formDataMap.full_name || `${formDataMap.first_name || ''} ${formDataMap.last_name || ''}`.trim();
            const email = formDataMap.email;
            const phone = formDataMap.phone_number;

            // Save lead to meta_ads_leads record
            await this.db.insert(metaAdsLeads).values({
                id: randomUUID(),
                tenantId: account.tenantId,
                leadgenId,
                pageId,
                formId,
                formData: formDataMap
            });

            // Create lead in CRM
            await this.leadsService.createLead(account.tenantId, {
                name: name || 'Facebook Lead',
                email: email,
                phone: phone,
                leadSource: 'facebook',
                captureChannel: 'meta_ads',
                notes: `System: Meta Lead Ads captured from formId ${formId}.`,
                autoAssign: true,
                requirementType: 'buy' // Default
            });

            this.logger.log(`Created CRM lead for Meta lead ${leadgenId} (Tenant: ${account.tenantId})`);
        } catch (error: any) {
            this.logger.error(`Error processing Meta lead ${leadgenId}:`, error.response?.data || error.message);
        }
    }

    async getConnectedPages(tenantId: string) {
        return this.db.select().from(metaAdsAccounts).where(and(eq(metaAdsAccounts.tenantId, tenantId), eq(metaAdsAccounts.isActive, true)));
    }

    async disconnectPage(tenantId: string, pageId: string) {
        await this.db
            .update(metaAdsAccounts)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(eq(metaAdsAccounts.tenantId, tenantId), eq(metaAdsAccounts.pageId, pageId)));
        return { success: true };
    }
}
