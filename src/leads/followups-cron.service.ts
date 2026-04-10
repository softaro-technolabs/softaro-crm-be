import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, gte, isNotNull, lte, or, sql, lt } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { leads, users, tenants } from '../database/schema';
import { MailService } from '../common/services/mail.service';
import { NotificationGateway } from '../notifications/notification.gateway';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FollowupsCronService {
  private readonly logger = new Logger(FollowupsCronService.serviceName);
  private static readonly serviceName = 'FollowupsCronService';

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly mailService: MailService,
    private readonly notificationGateway: NotificationGateway,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Run every 15 minutes to check for due follow-ups
   */
  @Cron('0 */15 * * * *')
  async handleFollowupReminders() {
    this.logger.log('Checking for due follow-ups...');

    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);

    try {
      // Find leads where:
      // 1. nextFollowUpAt is NOT NULL
      // 2. nextFollowUpAt is between (now - 15m) and (now + 15m) -> Current window
      // 3. OR nextFollowUpAt is in the past (overdue) 
      // AND lastFollowupNotifiedAt is NULL or older than nextFollowUpAt (to avoid double notification for same follow-up)
      
      const dueLeads = await this.db
        .select({
          lead: leads,
          agent: {
            id: users.id,
            name: users.name,
            email: users.email
          },
          tenantName: tenants.name
        })
        .from(leads)
        .innerJoin(users, eq(users.id, leads.assignedToUserId))
        .innerJoin(tenants, eq(tenants.id, leads.tenantId))
        .where(
          and(
            isNotNull(leads.nextFollowUpAt),
            isNotNull(leads.assignedToUserId),
            // Window: Due in the next 15 mins or already overdue
            lte(leads.nextFollowUpAt, fifteenMinutesFromNow),
            // Avoid re-notifying if we already notified for THIS specific follow-up date
            or(
              sql`${leads.lastFollowupNotifiedAt} IS NULL`,
              sql`${leads.lastFollowupNotifiedAt} < ${leads.nextFollowUpAt}`
            )
          )
        );

      this.logger.log(`Found ${dueLeads.length} follow-ups to notify.`);

      const frontendUrl = this.configService.get<string>('mail.frontendUrl', 'https://softaro-crm.vercel.app');

      for (const entry of dueLeads) {
        const { lead, agent, tenantName } = entry;
        
        const isOverdue = new Date(lead.nextFollowUpAt!) < now;
        const followupDt = new Date(lead.nextFollowUpAt!);
        
        const followupDateStr = followupDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const followupTimeStr = followupDt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        this.logger.log(`Sending reminder for Lead: ${lead.name} to Agent: ${agent.email}`);

        // 1. Send Email
        await this.mailService.sendFollowupReminder(agent.email, {
          leadName: lead.name,
          leadEmail: lead.email ?? undefined,
          leadPhone: lead.phone ?? undefined,
          followupDate: followupDateStr,
          followupTime: followupTimeStr,
          dashboardUrl: `${frontendUrl}/leads/${lead.id}`,
          recipientName: agent.name,
          notes: lead.notes ?? undefined,
          isOverdue
        });

        // 2. Real-time Notification
        this.notificationGateway.sendNotificationToUser(agent.id, 'followup_due', {
          leadId: lead.id,
          leadName: lead.name,
          isOverdue,
          message: isOverdue 
            ? `Follow-up for ${lead.name} is OVERDUE!` 
            : `Follow-up for ${lead.name} is due at ${followupTimeStr}`
        });

        // 3. Mark as notified
        await this.db
          .update(leads)
          .set({ lastFollowupNotifiedAt: now })
          .where(eq(leads.id, lead.id));
      }

    } catch (error) {
      this.logger.error('Error in handleFollowupReminders:', error);
    }
  }

  /**
   * Daily Morning Summary Cron (Optional but robust)
   * Runs at 9:00 AM every day
   */
  @Cron('0 9 * * *')
  async sendDailyFollowupSummary() {
    this.logger.log('Generating daily follow-up summaries...');
    // Implementation for daily digest could go here...
  }
}
