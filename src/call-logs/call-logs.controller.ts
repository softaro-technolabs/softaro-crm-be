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

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List call logs with pagination and filters' })
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query() query: CallLogListQueryDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.callLogsService.findAll(tenantId, query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new call log entry' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCallLogDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.callLogsService.create(tenantId, dto);
  }

  @Get('lead/:leadId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all call logs for a specific lead' })
  async findByLead(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string
  ) {
    this.verifyTenantAccess(tenantId);
    return this.callLogsService.findByLead(tenantId, leadId);
  }

  @Post('webhook/exotel')
  @SkipThrottle()
  @ApiOperation({ summary: 'Exotel webhook endpoint (no auth required)' })
  async handleExotelWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: ExotelWebhookDto
  ) {
    return this.callLogsService.handleExotelWebhook(tenantId, body);
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
