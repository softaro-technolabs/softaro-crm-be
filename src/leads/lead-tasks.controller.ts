import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { CreateLeadTaskDto, LeadTaskListQueryDto, UpdateLeadTaskDto } from './lead-tasks.dto';
import { LeadTasksService } from './lead-tasks.service';

@ApiTags('Lead Tasks')
@Controller('tenants/:tenantId/leads/:leadId/tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadTasksController {
  constructor(
    private readonly leadTasksService: LeadTasksService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tasks for a lead' })
  async list(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Query() query: LeadTaskListQueryDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.leadTasksService.listLeadTasks(tenantId, leadId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a task for a lead' })
  async create(@Param('tenantId') tenantId: string, @Param('leadId') leadId: string, @Body() dto: CreateLeadTaskDto) {
    this.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadTasksService.createLeadTask(tenantId, leadId, dto, userId ?? null);
  }

  @Get(':taskId')
  @ApiOperation({ summary: 'Get a task by id (lead scoped)' })
  async get(@Param('tenantId') tenantId: string, @Param('leadId') leadId: string, @Param('taskId') taskId: string) {
    this.verifyTenantAccess(tenantId);
    return this.leadTasksService.getTask(tenantId, leadId, taskId);
  }

  @Patch(':taskId')
  @ApiOperation({ summary: 'Update a task (title/priority/status/due/reminder/assignee)' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateLeadTaskDto
  ) {
    this.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadTasksService.updateLeadTask(tenantId, leadId, taskId, dto, userId ?? null);
  }

  @Patch(':taskId/archive')
  @ApiOperation({ summary: 'Archive a task (soft hide)' })
  async archive(@Param('tenantId') tenantId: string, @Param('leadId') leadId: string, @Param('taskId') taskId: string) {
    this.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadTasksService.archiveLeadTask(tenantId, leadId, taskId, userId ?? null);
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


