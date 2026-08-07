import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import {
  CallLogListQueryDto,
  CreateCallLogDto,
  ExotelWebhookDto
} from './call-logs.dto';
import { CallLogsService } from './call-logs.service';

@ApiTags('Call Logs')
@Controller('tenants/:tenantId/call-logs')
export class CallLogsController {
  constructor(
    private readonly callLogsService: CallLogsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('call-logs', ACTIONS.READ))
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List call logs with pagination and filters' })
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query() query: CallLogListQueryDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.callLogsService.findAll(tenantId, query);
  }

  @Permissions(...perms('call-logs', ACTIONS.WRITE))
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new call log entry' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCallLogDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.callLogsService.create(tenantId, dto);
  }

  @Permissions(...perms('call-logs', ACTIONS.READ))
  @Get('lead/:leadId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all call logs for a specific lead' })
  async findByLead(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.callLogsService.findByLead(tenantId, leadId);
  }

  @Permissions(...perms('call-logs', ACTIONS.WRITE))
  @Post('webhook/exotel')
  @SkipThrottle()
  @ApiOperation({ summary: 'Exotel webhook endpoint (no auth required)' })
  async handleExotelWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: ExotelWebhookDto
  ) {
    return this.callLogsService.handleExotelWebhook(tenantId, body);
  }
}
