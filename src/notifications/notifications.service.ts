import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { notifications, pushSubscriptions } from '../database/schema';
import { NotificationListQueryDto, CreatePushSubscriptionDto } from './notifications.dto';
import { ChatGateway } from '../chat/chat.gateway';
import { WebPushService } from './web-push.service';

@Injectable()
export class NotificationsService {
    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
        private readonly chatGateway: ChatGateway,
        private readonly webPushService: WebPushService
    ) { }

    async listNotifications(tenantId: string, userId: string, query: NotificationListQueryDto) {
        const limit = query.limit ?? 50;
        const page = query.page ?? 1;
        const offset = (page - 1) * limit;

        const filters: SQL[] = [
            eq(notifications.tenantId, tenantId),
            eq(notifications.userId, userId)
        ];

        if (query.isRead !== undefined) {
            filters.push(eq(notifications.isRead, query.isRead));
        }

        let whereClause: SQL = filters[0];
        for (let i = 1; i < filters.length; i += 1) {
            whereClause = and(whereClause, filters[i]) as SQL;
        }

        const [rows, totalRows] = await Promise.all([
            this.db
                .select()
                .from(notifications)
                .where(whereClause)
                .orderBy(desc(notifications.createdAt))
                .limit(limit)
                .offset(offset),
            this.db.select({ count: sql<number>`count(*)` }).from(notifications).where(whereClause)
        ]);

        const total = totalRows.length ? Number(totalRows[0].count) : 0;

        return {
            data: rows,
            meta: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit) || 1
            }
        };
    }

    async markAsRead(tenantId: string, userId: string, notificationId: string) {
        const [existing] = await this.db
            .update(notifications)
            .set({ isRead: true })
            .where(
                and(
                    eq(notifications.id, notificationId),
                    eq(notifications.tenantId, tenantId),
                    eq(notifications.userId, userId)
                )
            )
            .returning();

        if (!existing) {
            throw new NotFoundException('Notification not found');
        }
        return existing;
    }

    async markAllAsRead(tenantId: string, userId: string) {
        await this.db
            .update(notifications)
            .set({ isRead: true })
            .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.isRead, false)));

        return { success: true };
    }

    async createNotification(
        tenantId: string,
        userId: string,
        type: string,
        title: string,
        message: string | null,
        metadata: any = null
    ) {
        const now = new Date();
        const id = randomUUID();

        const [created] = await this.db
            .insert(notifications)
            .values({
                id,
                tenantId,
                userId,
                type,
                title,
                message,
                metadata,
                isRead: false,
                createdAt: now
            })
            .returning();

        // Push via WebSocket if user is online
        if (this.chatGateway.isUserOnline(userId)) {
            this.chatGateway.server.to(`user:${userId}`).emit('notification_received', created);
        }

        // Push via WebPush
        this.sendWebPush(tenantId, userId, created).catch((err) => {
            console.error('Failed to send web push notification', err);
        });

        return created;
    }

    async addPushSubscription(tenantId: string, userId: string, dto: CreatePushSubscriptionDto) {
        const id = randomUUID();
        const now = new Date();

        // Check if subscription already exists for this endpoint to avoid duplicates
        const allUserSubscriptions = await this.db
            .select()
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.userId, userId));

        const existing = allUserSubscriptions.find(
            (sub: any) => sub.subscription.endpoint === dto.endpoint
        );

        if (existing) {
            await this.db
                .update(pushSubscriptions)
                .set({
                    subscription: dto,
                    updatedAt: now
                })
                .where(eq(pushSubscriptions.id, existing.id));
            return { success: true, status: 'updated' };
        }

        await this.db.insert(pushSubscriptions).values({
            id,
            tenantId,
            userId,
            subscription: dto,
            createdAt: now,
            updatedAt: now
        });

        return { success: true, status: 'created' };
    }

    private async sendWebPush(tenantId: string, userId: string, notification: typeof notifications.$inferSelect) {
        const subscriptions = await this.db
            .select()
            .from(pushSubscriptions)
            .where(and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.userId, userId)));

        if (subscriptions.length === 0) return;

        const payload = JSON.stringify({
            title: notification.title,
            body: notification.message,
            icon: '/logo192.png', // Default icon path
            data: {
                url: '/notifications',
                id: notification.id
            }
        });

        for (const sub of subscriptions) {
            const success = await this.webPushService.sendNotification(sub.subscription, payload);
            if (!success) {
                // Remove expired subscription
                await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
            }
        }
    }
}
