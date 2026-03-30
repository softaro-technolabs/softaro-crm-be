import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

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
  async sendEmail(to: string | string[], subject: string, html: string) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
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
    
    // Premium HTML Template
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${organization}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f9f9f9;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          }
          .header {
            background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
            padding: 40px 20px;
            text-align: center;
            color: white;
          }
          .content {
            padding: 40px 30px;
          }
          .footer {
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
            background-color: #f1f1f1;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4f46e5;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin-top: 20px;
          }
          .credentials {
            background-color: #f3f4f6;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #4f46e5;
          }
          .credential-item {
            margin-bottom: 10px;
          }
          .label {
            font-weight: 600;
            color: #4b5563;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0; font-size: 24px;">Welcome to ${organization}</h1>
          </div>
          <div class="content">
            <p>Hello <strong>${name}</strong>,</p>
            <p>You have been added to the <strong>${organization}</strong> organization on Softaro CRM. You can now access your dashboard and start managing your workflow.</p>
            
            <div class="credentials">
              <div class="credential-item">
                <span class="label">Login ID:</span> ${email}
              </div>
              ${password ? `
              <div class="credential-item">
                <span class="label">Temporary Password:</span> <code>${password}</code>
              </div>
              ` : ''}
            </div>
            
            <p>Please log in and update your password if needed.</p>
            
            <a href="${loginUrl}" class="button">Log In to Dashboard</a>
            
            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              If you have any questions, feel free to reply to this email.
            </p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} Softaro CRM. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(email, subject, html);
  }
}
