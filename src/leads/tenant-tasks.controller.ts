import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { TenantTaskListQueryDto } from './lead-tasks.dto';
import { LeadTasksService } from './lead-tasks.service';

@ApiTags('Tasks')
@Controller('tenants/:tenantId/tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TenantTasksController {
  constructor(
    private readonly leadTasksService: LeadTasksService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tasks across tenant (filters: assigned user, due, overdue, status)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: TenantTaskListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.leadTasksService.listTenantTasks(tenantId, query);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my tasks (assignedToUserId = current user)' })
  async my(@Param('tenantId') tenantId: string, @Query() query: TenantTaskListQueryDto) {
    this.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadTasksService.listTenantTasks(tenantId, { ...query, assignedToUserId: userId ?? undefined });
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


