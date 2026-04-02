import { Get, Post, Delete, Param, Query, Body, Controller, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { SendMessageDto, ScheduleMessageDto, MessageListQueryDto } from './whatsapp.dto';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp Messaging')
@Controller('tenants/:tenantId/whatsapp')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WhatsappController {
    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly requestContext: RequestContextService
    ) { }

    @Post('send')
    @ApiOperation({ summary: 'Send an immediate WhatsApp message' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async sendMessage(
        @Param('tenantId') tenantId: string,
        @Body() dto: SendMessageDto
    ) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.sendMessage(
            tenantId,
            dto.leadId ?? null,
            dto.contactPhone,
            dto.payload,
            dto.isTemplate ?? false
        );
    }

    @Post('schedule')
    @ApiOperation({ summary: 'Schedule a WhatsApp message' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async scheduleMessage(
        @Param('tenantId') tenantId: string,
        @Body() dto: ScheduleMessageDto
    ) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.scheduleMessage(
            tenantId,
            dto.leadId ?? null,
            dto.contactPhone,
            dto.payload,
            new Date(dto.scheduledAt),
            dto.isAutomated ?? false
        );
    }

    @Get('history/:leadId')
    @ApiOperation({ summary: 'Get WhatsApp message history for a lead' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    @ApiParam({ name: 'leadId', description: 'Lead ID' })
    async getHistory(
        @Param('tenantId') tenantId: string,
        @Param('leadId') leadId: string,
        @Query() query: MessageListQueryDto
    ) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.getLeadMessageHistory(tenantId, leadId, query);
    }

    @Get('scheduled/:leadId')
    @ApiOperation({ summary: 'Get pending scheduled messages for a lead' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    @ApiParam({ name: 'leadId', description: 'Lead ID' })
    async getScheduled(
        @Param('tenantId') tenantId: string,
        @Param('leadId') leadId: string
    ) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.getScheduledMessages(tenantId, leadId);
    }

    @Delete('scheduled/:id')
    @ApiOperation({ summary: 'Cancel a scheduled WhatsApp message' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    @ApiParam({ name: 'id', description: 'Scheduled Message ID' })
    async cancelScheduled(
        @Param('tenantId') tenantId: string,
        @Param('id') id: string
    ) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.cancelScheduledMessage(tenantId, id);
    }

    @Get('auth-url')
    @ApiOperation({ summary: 'Get Meta OAuth authorization URL for the tenant' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async getAuthUrl(@Param('tenantId') tenantId: string) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.getAuthUrl(tenantId);
    }

    @Get('account')
    @ApiOperation({ summary: 'Get current connected WhatsApp account details' })
    async getAccount(@Param('tenantId') tenantId: string) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.getTenantAccount(tenantId);
    }

    private verifyTenantAccess(tenantId: string) {
        const user = this.requestContext.getUser();
        if (!user) {
            throw new ForbiddenException('User context not found');
        }

        if (user.role_global === 'super_admin') {
            return;
        }

        if (user.tenant_id !== tenantId) {
            throw new ForbiddenException('Access denied to this tenant');
        }
    }
}
