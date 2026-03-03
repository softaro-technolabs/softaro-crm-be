import { Controller, Get, Param, Patch, Post, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { NotificationListQueryDto, CreatePushSubscriptionDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';
import { Body } from '@nestjs/common';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly requestContext: RequestContextService
    ) { }

    @Get()
    @ApiOperation({ summary: 'List all notifications for the current user' })
    async listNotifications(@Query() query: NotificationListQueryDto) {
        const { tenantId, userId } = this.getUserContext();
        return this.notificationsService.listNotifications(tenantId, userId, query);
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Mark a notification as read' })
    async markAsRead(@Param('id') notificationId: string) {
        const { tenantId, userId } = this.getUserContext();
        return this.notificationsService.markAsRead(tenantId, userId, notificationId);
    }

    @Post('mark-all-read')
    @ApiOperation({ summary: 'Mark all unread notifications as read' })
    async markAllAsRead() {
        const { tenantId, userId } = this.getUserContext();
        return this.notificationsService.markAllAsRead(tenantId, userId);
    }

    @Post('subscribe')
    @ApiOperation({ summary: 'Register a push subscription for the current user' })
    async subscribe(@Body() dto: CreatePushSubscriptionDto) {
        const { tenantId, userId } = this.getUserContext();
        return this.notificationsService.addPushSubscription(tenantId, userId, dto);
    }

    private getUserContext() {
        const tenantId = this.requestContext.getTenantId();
        const userId = this.requestContext.getUserId();
        if (!userId || !tenantId) {
            throw new ForbiddenException('User context or tenant not found');
        }
        return { tenantId, userId };
    }
}
