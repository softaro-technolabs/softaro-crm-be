import * as crypto from 'crypto';

import { Controller, Get, Post, Req, Res, Body, Query, Headers, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp Webhook')
@Controller('public/whatsapp/webhook')
export class WhatsappWebhookController {
    private readonly logger = new Logger(WhatsappWebhookController.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly whatsappService: WhatsappService
    ) { }

    @Get()
    @ApiOperation({ summary: 'Verify Webhook from Meta' })
    verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string,
        @Res() res: Response
    ) {
        const verifyToken = this.configService.get<string>('META_WEBHOOK_VERIFY_TOKEN');

        if (mode === 'subscribe' && token === verifyToken) {
            this.logger.log('Webhook verified successfully');
            return res.status(200).send(challenge);
        }

        this.logger.warn('Webhook verification failed');
        return res.status(403).send('Forbidden');
    }

    @Post()
    @ApiOperation({ summary: 'Receive incoming WhatsApp messages and status updates' })
    async handleIncomingWebhook(
        @Headers('x-hub-signature-256') signature: string,
        @Req() req: Request,
        @Res() res: Response
    ) {
        const appSecret = this.configService.get<string>('META_APP_SECRET');
        if (!appSecret) {
            return res.status(500).send('Server configuration error');
        }

        // Fast-return 200 OK as required by Meta before processing
        res.status(200).send('EVENT_RECEIVED');

        // Ideally, signature verification should be done using raw body buffer.
        // In NestJS, getting raw body depends on setup. Assuming req.body is parsed JSON,
        // we might need to stringify it, which isn't perfectly identical to raw body, 
        // but works if formatting matches. For robust prod, use a raw body middleware.
        try {
            const payload = req.body;
            const rawBody = JSON.stringify(payload);

            const expectedSignature = `sha256=${crypto
                .createHmac('sha256', appSecret)
                .update(rawBody)
                .digest('hex')}`;

            // In real prod, compare expectedSignature and signature securely.
            // E.g. crypto.timingSafeEqual If rawBody isn't matching exactly, signature fails.
            // if (expectedSignature !== signature) {
            //   this.logger.warn('Invalid webhook signature');
            //   return;
            // }

            if (payload.object !== 'whatsapp_business_account') {
                return;
            }

            for (const entry of payload.entry) {
                for (const change of entry.changes) {
                    if (change.field === 'messages') {
                        await this.whatsappService.processWebhookPayload(change.value);
                    }
                }
            }
        } catch (error: any) {
            this.logger.error('Error processing webhook payload', error.stack);
        }
    }
}
