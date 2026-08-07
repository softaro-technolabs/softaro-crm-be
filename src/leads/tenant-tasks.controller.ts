import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { CreateLeadTaskDto, TenantTaskListQueryDto, UpdateLeadTaskDto } from './lead-tasks.dto';
import { LeadTasksService } from './lead-tasks.service';

@ApiTags('Tasks')
@Controller('tenants/:tenantId/tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class TenantTasksController {
  constructor(
    private readonly leadTasksService: LeadTasksService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('lead-task', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List tasks across tenant (filters: assigned user, due, overdue, status)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: TenantTaskListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.leadTasksService.listTenantTasks(tenantId, query);
  }

  @Permissions(...perms('lead-task', ACTIONS.READ))
  @Get('my')
  @ApiOperation({ summary: 'List my tasks (assignedToUserId = current user)' })
  async my(@Param('tenantId') tenantId: string, @Query() query: TenantTaskListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadTasksService.listTenantTasks(tenantId, { ...query, assignedToUserId: userId ?? undefined });
  }

  @Permissions(...perms('lead-task', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Create a task (leadId is optional in body)' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateLeadTaskDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    // Use leadId from body if provided
    return this.leadTasksService.createLeadTask(tenantId, dto.leadId ?? null, dto, userId ?? null);
  }

  @Permissions(...perms('lead-task', ACTIONS.READ))
  @Get(':taskId')
  @ApiOperation({ summary: 'Get a task by id' })
  async get(@Param('tenantId') tenantId: string, @Param('taskId') taskId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    // Passing null for leadId to allow getting any task in the tenant by ID
    return this.leadTasksService.getTask(tenantId, null, taskId);
  }

  @Permissions(...perms('lead-task', ACTIONS.UPDATE))
  @Patch(':taskId')
  @ApiOperation({ summary: 'Update a task' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateLeadTaskDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    // If dto.leadId is provided, we use it, otherwise we pass null to indicate we don't care about existing lead scoping
    return this.leadTasksService.updateLeadTask(tenantId, dto.leadId ?? null, taskId, dto, userId ?? null);
  }

  @Permissions(...perms('lead-task', ACTIONS.UPDATE))
  @Patch(':taskId/archive')
  @ApiOperation({ summary: 'Archive a task' })
  async archive(@Param('tenantId') tenantId: string, @Param('taskId') taskId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadTasksService.archiveLeadTask(tenantId, null, taskId, userId ?? null);
  }

  @Permissions(...perms('lead-task', ACTIONS.UPDATE))
  @Patch(':taskId/unarchive')
  @ApiOperation({ summary: 'Restore an archived task' })
  async unarchive(@Param('tenantId') tenantId: string, @Param('taskId') taskId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadTasksService.unarchiveLeadTask(tenantId, null, taskId, userId ?? null);
  }
}


