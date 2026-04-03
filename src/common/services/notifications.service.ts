import { Injectable, Logger } from '@nestjs/common';
import { MailService } from './mail.service';
// import { WhatsappGateway } from '../../whatsapp/whatsapp.gateway'; // If we have one

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        private readonly mailService: MailService,
        // private readonly whatsappGateway: WhatsappGateway 
    ) { }

    /**
     * Send an alert to an agent (Email, Push, or In-app)
     */
    async notifyAgent(email: string, name: string, title: string, message: string) {
        this.logger.log(`Notifying agent ${email}: ${title}`);
        
        try {
            // 1. Send Email alert
            const html = `
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                    <h2 style="color: #4a90e2;">${title}</h2>
                    <p>Hello <strong>${name}</strong>,</p>
                    <p>${message}</p>
                    <hr />
                    <p style="font-size: 12px; color: #888;">This is an automated system notification from Softaro CRM.</p>
                </div>
            `;
            await this.mailService.sendEmail(email, title, html);
            
            // 2. TODO: In-app notification via Socket.io
        } catch (error: any) {
            this.logger.error(`Failed to notify agent ${email}`, error.message);
        }
    }
}
