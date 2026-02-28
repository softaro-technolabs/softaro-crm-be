import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import { userCalendarConnections } from '../database/schema';
import { EncryptionService } from '../common/services/encryption.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CalendarTokenService {
    private readonly logger = new Logger(CalendarTokenService.name);

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
        private readonly encryptionService: EncryptionService,
        private readonly configService: ConfigService
    ) { }

    async saveToken(
        tenantId: string,
        userId: string,
        provider: 'google' | 'microsoft',
        accountId: string,
        accessToken: string,
        refreshToken?: string,
        expiresIn?: number
    ) {
        const encryptedAccessToken = this.encryptionService.encrypt(accessToken);
        const encryptedRefreshToken = refreshToken
            ? this.encryptionService.encrypt(refreshToken)
            : null;

        let expiresAt: Date | undefined;
        if (expiresIn) {
            expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
        }

        const [existing] = await this.db
            .select()
            .from(userCalendarConnections)
            .where(
                and(
                    eq(userCalendarConnections.tenantId, tenantId),
                    eq(userCalendarConnections.userId, userId),
                    eq(userCalendarConnections.provider, provider)
                )
            )
            .limit(1);

        if (existing) {
            // Update existing connection
            await this.db
                .update(userCalendarConnections)
                .set({
                    accountId,
                    encryptedAccessToken,
                    ...(encryptedRefreshToken && { encryptedRefreshToken }),
                    ...(expiresAt && { expiresAt }),
                    isActive: true,
                    updatedAt: new Date()
                })
                .where(eq(userCalendarConnections.id, existing.id));

            return existing.id;
        } else {
            // Create new connection
            const id = randomUUID();
            await this.db.insert(userCalendarConnections).values({
                id,
                tenantId,
                userId,
                provider,
                accountId,
                encryptedAccessToken,
                encryptedRefreshToken,
                expiresAt,
                isActive: true
            });
            return id;
        }
    }

    async getActiveToken(tenantId: string, userId: string, provider: 'google' | 'microsoft') {
        const [connection] = await this.db
            .select()
            .from(userCalendarConnections)
            .where(
                and(
                    eq(userCalendarConnections.tenantId, tenantId),
                    eq(userCalendarConnections.userId, userId),
                    eq(userCalendarConnections.provider, provider),
                    eq(userCalendarConnections.isActive, true)
                )
            )
            .limit(1);

        if (!connection) {
            return null;
        }

        // Check if token needs refresh (less than 5 minutes remaining)
        const now = new Date();
        const needsRefresh = connection.expiresAt && connection.expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

        if (needsRefresh && connection.encryptedRefreshToken) {
            try {
                const refreshToken = this.encryptionService.decrypt(connection.encryptedRefreshToken);
                return await this.refreshAccessToken(connection, refreshToken);
            } catch (e) {
                this.logger.error(`Failed to refresh ${provider} token for user ${userId}:`, e);
                // Mark as inactive if refresh fails permanently (like revoked consent)
                if (axios.isAxiosError(e) && e.response?.status === 400) {
                    await this.db.update(userCalendarConnections).set({ isActive: false }).where(eq(userCalendarConnections.id, connection.id));
                }
                return null; // Return null if refresh failed
            }
        }

        return this.encryptionService.decrypt(connection.encryptedAccessToken);
    }

    private async refreshAccessToken(connection: typeof userCalendarConnections.$inferSelect, refreshToken: string): Promise<string> {
        const provider = connection.provider;

        if (provider === 'google') {
            const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
            const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

            if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');

            const response = await axios.post('https://oauth2.googleapis.com/token', {
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });

            const { access_token, expires_in } = response.data;
            await this.saveToken(connection.tenantId, connection.userId, provider, connection.accountId, access_token, undefined, expires_in);
            return access_token;
        } else if (provider === 'microsoft') {
            const clientId = this.configService.get<string>('MS_CLIENT_ID');
            const clientSecret = this.configService.get<string>('MS_CLIENT_SECRET');
            const tenant = 'common'; // Or specific tenant id if single-tenant Azure app

            if (!clientId || !clientSecret) throw new Error('Microsoft OAuth credentials not configured');

            const data = new URLSearchParams();
            data.append('client_id', clientId);
            data.append('scope', 'offline_access Calendars.ReadWrite');
            data.append('refresh_token', refreshToken);
            data.append('grant_type', 'refresh_token');
            data.append('client_secret', clientSecret);

            const response = await axios.post(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, data, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const { access_token, refresh_token: new_refresh, expires_in } = response.data;
            await this.saveToken(connection.tenantId, connection.userId, provider, connection.accountId, access_token, new_refresh, expires_in);
            return access_token;
        }

        throw new Error('Unsupported provider refresh');
    }

    async disconnect(tenantId: string, userId: string, provider: 'google' | 'microsoft') {
        await this.db
            .delete(userCalendarConnections)
            .where(
                and(
                    eq(userCalendarConnections.tenantId, tenantId),
                    eq(userCalendarConnections.userId, userId),
                    eq(userCalendarConnections.provider, provider)
                )
            );
    }
}
