import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, lte } from 'drizzle-orm';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import { DrizzleDatabase } from '../database/database.types';
import { userCalendarConnections, calendarSyncQueue, leadTasks } from '../database/schema';
import { CalendarTokenService } from './calendar-token.service';

@Injectable()
export class CalendarSyncService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CalendarSyncService.name);
    private pollInterval!: NodeJS.Timeout;

    constructor(
        @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
        private readonly calendarTokenService: CalendarTokenService
    ) { }

    onModuleInit() {
        this.pollInterval = setInterval(async () => {
            await this.processSyncQueue();
        }, 5000); // 5 seconds processing window
    }

    onModuleDestroy() {
        if (this.pollInterval) clearInterval(this.pollInterval);
    }

    // Hook for LeadTasksService to queue events
    async queueSync(tenantId: string, userId: string, taskId: string, action: 'create' | 'update' | 'delete', payload: any) {
        // Check if user has an active connection
        const connections = await this.db.select()
            .from(userCalendarConnections)
            .where(
                and(
                    eq(userCalendarConnections.tenantId, tenantId),
                    eq(userCalendarConnections.userId, userId),
                    eq(userCalendarConnections.isActive, true)
                )
            );

        if (connections.length === 0) return; // No active sync configured for this user

        for (const connection of connections) {
            await this.db.insert(calendarSyncQueue).values({
                id: randomUUID(),
                tenantId,
                userId,
                taskId,
                provider: connection.provider,
                action,
                payload,
            });
        }
    }

    private async processSyncQueue() {
        const now = new Date();
        const pendingItems = await this.db
            .select()
            .from(calendarSyncQueue)
            .where(
                and(
                    eq(calendarSyncQueue.isProcessing, false),
                    lte(calendarSyncQueue.nextAttemptAt, now)
                )
            )
            .limit(10); // batch limit

        if (pendingItems.length === 0) return;

        for (const item of pendingItems) {
            // Mark processing lock
            await this.db
                .update(calendarSyncQueue)
                .set({ isProcessing: true, updatedAt: new Date() })
                .where(eq(calendarSyncQueue.id, item.id));

            try {
                const token = await this.calendarTokenService.getActiveToken(item.tenantId, item.userId, item.provider as 'google' | 'microsoft');

                if (!token) {
                    throw new Error('No active token available for provider ' + item.provider);
                }

                const taskDetails = await this.db.select().from(leadTasks).where(eq(leadTasks.id, item.taskId)).limit(1).then(res => res[0]);

                if (item.provider === 'google') {
                    await this.syncWithGoogle(item, token, taskDetails);
                } else if (item.provider === 'microsoft') {
                    await this.syncWithMicrosoft(item, token, taskDetails);
                }

                // Successfully synced, remove from queue
                await this.db.delete(calendarSyncQueue).where(eq(calendarSyncQueue.id, item.id));

            } catch (error: any) {
                this.logger.error(`Calendar sync failed for queue ID ${item.id}`, error?.response?.data || error);

                const currentAttempts = parseInt(item.attempts) || 0;
                if (currentAttempts >= 3) {
                    // Drop message permanently after 3 attempts
                    await this.db.delete(calendarSyncQueue).where(eq(calendarSyncQueue.id, item.id));
                    this.logger.error(`Dropped calendar sync ${item.id} permanently after 3 attempts`);
                } else {
                    // Exponential backoff
                    const nextAttempt = new Date();
                    nextAttempt.setMinutes(nextAttempt.getMinutes() + Math.pow(2, currentAttempts));

                    await this.db
                        .update(calendarSyncQueue)
                        .set({
                            isProcessing: false,
                            attempts: (currentAttempts + 1).toString(),
                            lastAttemptAt: new Date(),
                            nextAttemptAt: nextAttempt,
                            errorLog: JSON.stringify(error?.response?.data || error.message),
                            updatedAt: new Date()
                        })
                        .where(eq(calendarSyncQueue.id, item.id));
                }
            }
        }
    }

    // ----- Google Sync Implementation -----
    private async syncWithGoogle(item: any, token: string, task: any) {
        const googleApi = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

        // We expect tasks without due dates to NOT be synced, or synced as all-day. Let's enforce dueAt.
        if (!task?.dueAt && item.action !== 'delete') {
            throw new Error('Google Calendar requires start and end times, but task has no due date.');
        }

        const payload = item.action !== 'delete' ? {
            summary: task.title,
            description: task.description || '',
            start: { dateTime: new Date(task.dueAt).toISOString() },
            end: { dateTime: new Date(task.dueAt).toISOString() } // simplified duration
        } : null;

        if (item.action === 'create' || (item.action === 'update' && !task.externalEventId)) {
            const response = await axios.post(googleApi, payload, { headers: { Authorization: `Bearer ${token}` } });
            await this.db.update(leadTasks).set({ externalEventId: response.data.id, calendarProvider: 'google' }).where(eq(leadTasks.id, item.taskId));
        } else if (item.action === 'update' && task.externalEventId) {
            await axios.put(`${googleApi}/${task.externalEventId}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        } else if (item.action === 'delete' && task.externalEventId) {
            await axios.delete(`${googleApi}/${task.externalEventId}`, { headers: { Authorization: `Bearer ${token}` } });
        }
    }

    // ----- Microsoft Graph Sync Implementation -----
    private async syncWithMicrosoft(item: any, token: string, task: any) {
        const graphApi = 'https://graph.microsoft.com/v1.0/me/events';

        if (!task?.dueAt && item.action !== 'delete') {
            throw new Error('Microsoft Calendar requires start and end times, but task has no due date.');
        }

        const payload = item.action !== 'delete' ? {
            subject: task.title,
            body: { contentType: "HTML", content: task.description || '' },
            start: { dateTime: new Date(task.dueAt).toISOString(), timeZone: "UTC" },
            end: { dateTime: new Date(task.dueAt).toISOString(), timeZone: "UTC" } // simplified duration
        } : null;

        if (item.action === 'create' || (item.action === 'update' && !task.externalEventId)) {
            const response = await axios.post(graphApi, payload, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
            await this.db.update(leadTasks).set({ externalEventId: response.data.id, calendarProvider: 'microsoft' }).where(eq(leadTasks.id, item.taskId));
        } else if (item.action === 'update' && task.externalEventId) {
            await axios.patch(`${graphApi}/${task.externalEventId}`, payload, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
        } else if (item.action === 'delete' && task.externalEventId) {
            await axios.delete(`${graphApi}/${task.externalEventId}`, { headers: { Authorization: `Bearer ${token}` } });
        }
    }
}
