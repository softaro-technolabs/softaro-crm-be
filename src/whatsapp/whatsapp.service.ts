import { randomUUID } from 'crypto';

import { Injectable, Inject, NotFoundException, BadRequestException, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { eq, and, lte, sql } from 'drizzle-orm';

import { EncryptionService } from '../common/services/encryption.service';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import { whatsappAccounts, whatsappMessages, whatsappSessions, whatsappMessageQueue, leads, whatsappScheduledMessages } from '../database/schema';
import { PhoneUtil } from '../common/utils/phone.util';
import { WhatsappGateway } from './whatsapp.gateway';

@Injectable()
export class WhatsappService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(WhatsappService.name);
    private readonly graphApiVersion = 'v18.0';
    private readonly baseUrl = `https://graph.facebook.com/${this.graphApiVersion}`;
    private pollInterval!: NodeJS.Timeout;
    private scheduleInterval!: NodeJS.Timeout;

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
        private readonly configService: ConfigService,
        private readonly encryptionService: EncryptionService,
        private readonly whatsappGateway: WhatsappGateway
    ) { }

    onApplicationBootstrap() {
        // Wait a slight bit to ensure MigrationService has finished (which also runs onApplicationBootstrap)
        // A better way would be an Event, but this is a quick fix for the lifecycle race.
        setTimeout(() => {
            this.logger.log('Starting WhatsApp polling intervals...');
            this.pollInterval = setInterval(async () => {
                try {
                    await this.processMessageQueue();
                } catch (e) {
                    this.logger.error('Error in message queue polling', e);
                }
            }, 5000); // 5 seconds

            this.scheduleInterval = setInterval(async () => {
                try {
                    await this.processScheduledMessages();
                } catch (e) {
                    this.logger.error('Error in scheduled message polling', e);
                }
            }, 30000); // 30 seconds
        }, 5000);
    }

    onModuleDestroy() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        if (this.scheduleInterval) clearInterval(this.scheduleInterval);
    }

    private async processMessageQueue() {
        const now = new Date();
        const pendingMessages = await this.db
            .select()
            .from(whatsappMessageQueue)
            .where(
                and(
                    eq(whatsappMessageQueue.isProcessing, false),
                    lte(whatsappMessageQueue.nextAttemptAt, now)
                )
            )
            .limit(10); // Batch size

        if (pendingMessages.length === 0) return;

        for (const msg of pendingMessages) {
            await this.db
                .update(whatsappMessageQueue)
                .set({ isProcessing: true, updatedAt: new Date() })
                .where(eq(whatsappMessageQueue.id, msg.id));

            try {
                const payload = msg.payload as any;
                const token = payload.token;
                const phoneNumberId = payload.phone_number_id;

                // Clean the payload
                const cleanPayload = { ...payload };
                delete cleanPayload.token;
                delete cleanPayload.phone_number_id;

                const response = await axios.post(
                    `${this.baseUrl}/${phoneNumberId}/messages`,
                    cleanPayload,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                const metaMessageId = response.data?.messages?.[0]?.id;
                const messageId = randomUUID();

                const newMessage = {
                    id: messageId,
                    tenantId: msg.tenantId,
                    leadId: msg.leadId,
                    contactPhone: msg.contactPhone,
                    direction: 'outbound' as const,
                    messageId: metaMessageId || `mock-id-${Date.now()}`,
                    status: 'sent' as const,
                    content: cleanPayload,
                    isTemplate: cleanPayload.type === 'template',
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                // Log as sent
                await this.db.insert(whatsappMessages).values(newMessage);

                // Broadcast real-time update
                this.whatsappGateway.broadcastNewMessage(msg.tenantId, msg.leadId, newMessage);

                // Remove from queue
                await this.db.delete(whatsappMessageQueue).where(eq(whatsappMessageQueue.id, msg.id));
            } catch (error: any) {
                this.logger.error(`Error sending message queue id ${msg.id}`, error?.response?.data || error.message);

                const currentAttempts = parseInt(msg.attempts) || 0;
                if (currentAttempts >= 3) {
                    await this.db.delete(whatsappMessageQueue).where(eq(whatsappMessageQueue.id, msg.id));
                    this.logger.error(`Dropped message ${msg.id} after 3 attempts`);
                } else {
                    const nextAttempt = new Date();
                    nextAttempt.setMinutes(nextAttempt.getMinutes() + 1); // retry in 1 minute

                    await this.db
                        .update(whatsappMessageQueue)
                        .set({
                            isProcessing: false,
                            attempts: (currentAttempts + 1).toString(),
                            lastAttemptAt: new Date(),
                            nextAttemptAt: nextAttempt,
                            errorLog: JSON.stringify(error?.response?.data || error.message),
                            updatedAt: new Date()
                        })
                        .where(eq(whatsappMessageQueue.id, msg.id));
                }
            }
        }
    }

    async onboardTenantAccount(tenantId: string, code: string) {
        const clientId = this.configService.get<string>('META_APP_ID');
        const clientSecret = this.configService.get<string>('META_APP_SECRET');

        if (!clientId || !clientSecret) {
            throw new BadRequestException('Meta App credentials are not configured.');
        }

        try {
            // 1. Exchange code for access token
            const tokenResponse = await axios.get(`${this.baseUrl}/oauth/access_token`, {
                params: {
                    client_id: clientId,
                    client_secret: clientSecret,
                    code: code
                }
            });
            const accessToken = tokenResponse.data.access_token;

            // 2. We need a System User permanent token ideally, or we exchange this user token.
            // Assuming Embedded Signup gives us a long-lived generic token to call /debug_token 
            // or directly use it as a permanent token for the WABA if configured properly.
            // Usually, we register the client, get WABA ID and Phone ID using standard graph API:

            // Getting Phone Numbers associated with the WABA
            // For embedded signup flow, clients typically pick a specific WABA and Phone during the UI flow.
            // We will need WABA ID and Phone Number ID to be provided, or fetched from shared WABA endpoint.
            // However, we only got the access token here. 
            // To simplify, we will just return the accessToken to the frontend and frontend should query what phones are available and then call another endpoint, OR we take wabaId and phoneNumberId in the payload.

            return { accessToken };
        } catch (error: any) {
            this.logger.error('Failed to exchange code for Meta access token', error?.response?.data || error.message);
            throw new BadRequestException('Failed to exchange code with Meta');
        }
    }

    async saveTenantAccount(
        tenantId: string,
        businessAccountId: string,
        phoneNumberId: string,
        phoneNumber: string,
        wabaId: string | null,
        permanentToken: string
    ) {
        const encryptedToken = this.encryptionService.encrypt(permanentToken);

        const [existing] = await this.db
            .select()
            .from(whatsappAccounts)
            .where(eq(whatsappAccounts.tenantId, tenantId))
            .limit(1);

        if (existing) {
            await this.db
                .update(whatsappAccounts)
                .set({
                    businessAccountId,
                    phoneNumberId,
                    phoneNumber,
                    wabaId: wabaId ?? null,
                    encryptedPermanentToken: encryptedToken,
                    isActive: true,
                    updatedAt: new Date()
                })
                .where(eq(whatsappAccounts.id, existing.id));

            return { id: existing.id, status: 'updated' };
        }

        const id = randomUUID();
        await this.db.insert(whatsappAccounts).values({
            id,
            tenantId,
            businessAccountId,
            phoneNumberId,
            phoneNumber,
            wabaId: wabaId ?? null,
            encryptedPermanentToken: encryptedToken,
            isActive: true
        });

        return { id, status: 'created' };
    }

    async processWebhookPayload(value: any) {
        const phoneNumberId = value?.metadata?.phone_number_id;

        if (!phoneNumberId) return;

        // Resolve tenant based on phone_number_id mapped to whatsapp_accounts
        const [account] = await this.db
            .select({ tenantId: whatsappAccounts.tenantId })
            .from(whatsappAccounts)
            .where(eq(whatsappAccounts.phoneNumberId, phoneNumberId))
            .limit(1);

        if (!account) {
            this.logger.warn(`No tenant account found for phone_number_id: ${phoneNumberId}`);
            return;
        }

        const tenantId = account.tenantId;

        // Process incoming messages
        if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
                const contactPhone = msg.from; // Sender's phone
                const messageId = msg.id;

                await this.handleIncomingMessage(tenantId, contactPhone, messageId, msg);
            }
        }

        // Process status updates (sent, delivered, read, failed)
        if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
                await this.db
                    .update(whatsappMessages)
                    .set({ status: status.status, updatedAt: new Date() })
                    .where(eq(whatsappMessages.messageId, status.id));
            }
        }
    }

    private async handleIncomingMessage(tenantId: string, contactPhone: string, messageId: string, rawMessage: any) {
        const normalizedPhone = PhoneUtil.normalize(contactPhone);

        // Attempt to map to a lead
        const [lead] = await this.db
            .select({ id: leads.id })
            .from(leads)
            .where(
                and(
                    eq(leads.tenantId, tenantId),
                    sql`regexp_replace(${leads.phone}, '\D', '', 'g') = ${normalizedPhone}`
                )
            )
            .limit(1);

        const leadId = lead ? lead.id : null;

        // Upsert session (24 hour window active)
        const [existingSession] = await this.db
            .select({ id: whatsappSessions.id })
            .from(whatsappSessions)
            .where(and(eq(whatsappSessions.tenantId, tenantId), eq(whatsappSessions.contactPhone, contactPhone)))
            .limit(1);

        const now = new Date();
        if (existingSession) {
            await this.db
                .update(whatsappSessions)
                .set({ lastCustomerMessageAt: now, updatedAt: now })
                .where(eq(whatsappSessions.id, existingSession.id));
        } else {
            await this.db.insert(whatsappSessions).values({
                id: randomUUID(),
                tenantId,
                contactPhone,
                lastCustomerMessageAt: now
            });
        }

        const newMessage = {
            id: randomUUID(),
            tenantId,
            leadId,
            contactPhone,
            direction: 'inbound' as const,
            messageId,
            status: 'received' as const,
            content: rawMessage,
            isTemplate: false,
            createdAt: now,
            updatedAt: now
        };

        // Save message
        await this.db.insert(whatsappMessages).values(newMessage);

        // Broadcast real-time update
        this.whatsappGateway.broadcastNewMessage(tenantId, leadId, newMessage);

        // Trigger Automation Engine (Conceptual)
        this.logger.log(`Received incoming meta message ${messageId} mapped to lead: ${leadId}`);
    }

    async sendMessage(tenantId: string, leadId: string | null, contactPhone: string, payload: any, isTemplate: boolean) {
        // 1. Fetch Tenant WhatsApp Credentials
        const [account] = await this.db
            .select()
            .from(whatsappAccounts)
            .where(and(eq(whatsappAccounts.tenantId, tenantId), eq(whatsappAccounts.isActive, true)))
            .limit(1);

        if (!account) {
            throw new BadRequestException('WhatsApp is not configured or disabled for this tenant');
        }

        // 2. Determine 24-hour limit for free-form texting
        if (!isTemplate) {
            const [session] = await this.db
                .select()
                .from(whatsappSessions)
                .where(and(eq(whatsappSessions.tenantId, tenantId), eq(whatsappSessions.contactPhone, contactPhone)))
                .limit(1);

            if (!session) {
                throw new BadRequestException('Cannot send free-form message: No active session (24h) found.');
            }

            const diffInHours = Math.abs(new Date().getTime() - session.lastCustomerMessageAt.getTime()) / 36e5;
            if (diffInHours > 24) {
                throw new BadRequestException('Cannot send free-form message: Active session expired.');
            }
        }

        const decryptedToken = this.encryptionService.decrypt(account.encryptedPermanentToken);

        // 3. Queue the message to avoid blocking the caller
        const queueId = randomUUID();
        await this.db.insert(whatsappMessageQueue).values({
            id: queueId,
            tenantId,
            leadId,
            contactPhone,
            payload: { ...payload, phone_number_id: account.phoneNumberId, token: decryptedToken },
            isProcessing: false
        });

        return { success: true, queueId, status: 'queued' };
    }

    private async processScheduledMessages() {
        const now = new Date();
        const pendingScheduled = await this.db
            .select()
            .from(whatsappScheduledMessages)
            .where(
                and(
                    eq(whatsappScheduledMessages.status, 'pending'),
                    lte(whatsappScheduledMessages.scheduledAt, now)
                )
            )
            .limit(20);

        if (pendingScheduled.length === 0) return;

        for (const scheduled of pendingScheduled) {
            try {
                // Move to message queue
                const queueId = randomUUID();

                // Get account for token/phoneId
                const [account] = await this.db
                    .select()
                    .from(whatsappAccounts)
                    .where(and(eq(whatsappAccounts.tenantId, scheduled.tenantId), eq(whatsappAccounts.isActive, true)))
                    .limit(1);

                if (!account) {
                    throw new Error('WhatsApp account not active or not found');
                }

                const decryptedToken = this.encryptionService.decrypt(account.encryptedPermanentToken);
                const payload = scheduled.payload as any;

                await this.db.insert(whatsappMessageQueue).values({
                    id: queueId,
                    tenantId: scheduled.tenantId,
                    leadId: scheduled.leadId,
                    contactPhone: scheduled.contactPhone,
                    payload: { ...payload, phone_number_id: account.phoneNumberId, token: decryptedToken },
                    isProcessing: false
                });

                // Update scheduled message status
                await this.db
                    .update(whatsappScheduledMessages)
                    .set({ status: 'sent', updatedAt: new Date() })
                    .where(eq(whatsappScheduledMessages.id, scheduled.id));

            } catch (error: any) {
                this.logger.error(`Error processing scheduled message ${scheduled.id}`, error.message);
                await this.db
                    .update(whatsappScheduledMessages)
                    .set({ status: 'failed', updatedAt: new Date() })
                    .where(eq(whatsappScheduledMessages.id, scheduled.id));
            }
        }
    }

    async scheduleMessage(tenantId: string, leadId: string | null, contactPhone: string, payload: any, scheduledAt: Date, isAutomated = false) {
        const id = randomUUID();
        await this.db.insert(whatsappScheduledMessages).values({
            id,
            tenantId,
            leadId,
            contactPhone,
            payload,
            scheduledAt,
            status: 'pending',
            isAutomated
        });
        return { id, status: 'scheduled' };
    }

    async getLeadMessageHistory(tenantId: string, leadId: string) {
        return this.db
            .select()
            .from(whatsappMessages)
            .where(and(eq(whatsappMessages.tenantId, tenantId), eq(whatsappMessages.leadId, leadId)))
            .orderBy(whatsappMessages.createdAt);
    }

    async getScheduledMessages(tenantId: string, leadId: string) {
        return this.db
            .select()
            .from(whatsappScheduledMessages)
            .where(
                and(
                    eq(whatsappScheduledMessages.tenantId, tenantId),
                    eq(whatsappScheduledMessages.leadId, leadId),
                    eq(whatsappScheduledMessages.status, 'pending')
                )
            )
            .orderBy(whatsappScheduledMessages.scheduledAt);
    }

    async cancelScheduledMessage(tenantId: string, id: string) {
        const [msg] = await this.db
            .select()
            .from(whatsappScheduledMessages)
            .where(and(eq(whatsappScheduledMessages.tenantId, tenantId), eq(whatsappScheduledMessages.id, id)))
            .limit(1);

        if (!msg) throw new NotFoundException('Scheduled message not found');

        await this.db
            .update(whatsappScheduledMessages)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(whatsappScheduledMessages.id, id));

        return { success: true };
    }
}
