import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { notifications } from '../database/schema';
import { NotificationListQueryDto } from './notifications.dto';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class NotificationsService {
    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
        private readonly chatGateway: ChatGateway
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
            this.chatGateway.server.to(userId).emit('notification_received', created);
            // Wait, ChatGateway currently joins the tenant and conversation rooms but not individual personal ones.
            // We will need to update ChatGateway slightly to join a personal room `user:${userId}`.
            // E.g. this.chatGateway.server.to(`user:${userId}`).emit('notification_received', created);
            this.chatGateway.server.to(`user:${userId}`).emit('notification_received', created);
        }

        return created;
    }
}
