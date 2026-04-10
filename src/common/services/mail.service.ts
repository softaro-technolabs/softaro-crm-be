import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { getUserInvitationTemplate } from '../mail-templates/user-invitation.template';
import { getLeadNotificationTemplate } from '../mail-templates/lead-notification.template';
import { getFollowupReminderTemplate } from '../mail-templates/followup-reminder.template';

@Injectable()
export class MailService {
  private resend: Resend;
  private fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('mail.apiKey', 're_xxxxxxxxx');
    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('mail.from', 'Softaro CRM <onboarding@resend.dev>');
  }

  /**
   * Send a standard email using Resend
   */
  async sendEmail(to: string | string[], subject: string, html: string, attachments?: any[]) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        attachments,
      });

      if (error) {
        console.error('Resend error:', error);
        throw new Error(`Failed to send email: ${error.message}`);
      }

      return data;
    } catch (err) {
      console.error('MailService exception:', err);
      throw err;
    }
  }

  /**
   * Send an invitation email to a new user
   */
  async sendUserInvitation(email: string, name: string, organization: string, password?: string) {
    const loginUrl = this.configService.get<string>('mail.frontendUrl', 'https://softaro-crm.vercel.app');
    
    const subject = `Welcome to ${organization}`;
    
    const html = getUserInvitationTemplate({
      email,
      name,
      organization,
      loginUrl,
      password,
    });

    return this.sendEmail(email, subject, html);
  }

  /**
   * Send a quotation email with PDF attachment
   */
  async sendQuotationEmail(to: string, subject: string, html: string, pdfBuffer: Buffer, fileName: string) {
    return this.sendEmail(to, subject, html, [
      {
        filename: fileName,
        content: pdfBuffer,
      },
    ]);
  }

  /**
   * Send a lead notification email
   */
  async sendLeadNotification(recipientEmail: string, data: Parameters<typeof getLeadNotificationTemplate>[0]) {
    const subject = data.isAssignee ? `[New Lead] Assigned to you: ${data.leadName}` : `[New Lead] Captured: ${data.leadName}`;
    const html = getLeadNotificationTemplate(data);
    return this.sendEmail(recipientEmail, subject, html);
  }

  /**
   * Send a follow-up reminder email
   */
  async sendFollowupReminder(recipientEmail: string, data: Parameters<typeof getFollowupReminderTemplate>[0]) {
    const prefix = data.isOverdue ? '[OVERDUE REMINDER]' : '[FOLLOW-UP DUE]';
    const subject = `${prefix} Lead: ${data.leadName}`;
    const html = getFollowupReminderTemplate(data);
    return this.sendEmail(recipientEmail, subject, html);
  }
}
