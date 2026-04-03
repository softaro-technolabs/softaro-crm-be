import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, ForbiddenException, Logger, Res, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { MetaAdsService } from './meta-ads.service';
import { ConnectPageDto, MetaWebhookDto } from './meta-ads.dto';

@ApiTags('Meta Ads Integration')
@Controller('tenants/:tenantId/meta-ads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MetaAdsController {
    private readonly logger = new Logger(MetaAdsController.name);

    constructor(
        private readonly metaAdsService: MetaAdsService,
        private readonly requestContextService: RequestContextService
    ) { }

    @Post('connect')
    @ApiOperation({ summary: 'Connect a Facebook Page to this tenant' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async connectPage(
        @Param('tenantId') tenantId: string,
        @Body() dto: ConnectPageDto
    ) {
        this.verifyTenantAccess(tenantId);
        return this.metaAdsService.connectPage(tenantId, dto.pageId, dto.pageName, dto.pageAccessToken);
    }

    @Get('auth-url')
    @ApiOperation({ summary: 'Get Meta OAuth authorization URL for Lead Ads' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async getAuthUrl(@Param('tenantId') tenantId: string) {
        this.verifyTenantAccess(tenantId);
        return this.metaAdsService.getAuthUrl(tenantId);
    }

    @Post('exchange-code')
    @ApiOperation({ summary: 'Exchange Meta code for Page tokens' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async exchangeCode(
        @Param('tenantId') tenantId: string,
        @Body('code') code: string
    ) {
        this.verifyTenantAccess(tenantId);
        return this.metaAdsService.exchangeCode(tenantId, code);
    }

    @Get('pages')
    @ApiOperation({ summary: 'Get all connected Facebook Pages' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async getPages(@Param('tenantId') tenantId: string) {
        this.verifyTenantAccess(tenantId);
        return this.metaAdsService.getConnectedPages(tenantId);
    }

    @Delete('pages/:pageId')
    @ApiOperation({ summary: 'Disconnect a Facebook Page' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    @ApiParam({ name: 'pageId', description: 'Facebook Page ID' })
    async disconnectPage(
        @Param('tenantId') tenantId: string,
        @Param('pageId') pageId: string
    ) {
        this.verifyTenantAccess(tenantId);
        return this.metaAdsService.disconnectPage(tenantId, pageId);
    }

    private verifyTenantAccess(tenantId: string) {
        if (this.requestContextService.getTenantId() !== tenantId) {
            throw new ForbiddenException('Invalid tenant association');
        }
    }
}

@ApiTags('Meta Ads Webhook')
@Controller('public/meta-ads/webhook')
export class MetaAdsWebhookController {
    private readonly logger = new Logger(MetaAdsWebhookController.name);

    constructor(
        private readonly metaAdsService: MetaAdsService
    ) { }

    @Get()
    @ApiOperation({ summary: 'Verify Meta Ads Webhook' })
    verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string,
        @Res() res: Response
    ) {
        const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
        if (mode === 'subscribe' && token === verifyToken) {
            this.logger.log('Meta Ads Webhook verified successfully');
            return res.status(200).send(challenge);
        }
        this.logger.warn('Meta Ads Webhook verification failed');
        return res.status(403).send('Forbidden');
    }

    @Post()
    @ApiOperation({ summary: 'Receive incoming Meta Lead Ads events' })
    async handleWebhook(@Body() data: any, @Res() res: Response) {
        // Meta expects 200 response immediately
        res.status(200).send('EVENT_RECEIVED');
        try {
            await this.metaAdsService.handleWebhook(data);
        } catch (error: any) {
            this.logger.error('Error handling Meta Ads Webhook:', error.message);
        }
    }
}
