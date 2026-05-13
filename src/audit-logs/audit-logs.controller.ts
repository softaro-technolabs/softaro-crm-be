import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('Audit Logs')
@Controller('tenants/:tenantId/audit-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs with optional filters' })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.auditLogsService.findAll(tenantId, {
      action,
      entityType,
      entityId,
      userId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
  }

  @Get(':entityType/:entityId')
  @ApiOperation({ summary: 'Get all audit logs for a specific entity' })
  async findByEntity(
    @Param('tenantId') tenantId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.auditLogsService.findByEntity(tenantId, entityType, entityId);
  }

    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
  }
}
