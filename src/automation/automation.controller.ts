import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { AutomationService } from './automation.service';
import {
  AutomationListQueryDto,
  AutomationLogQueryDto,
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto
} from './automation.dto';

@ApiTags('Automation')
@Controller('tenants/:tenantId/automation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get('rules')
  @ApiOperation({ summary: 'List automation rules for a tenant' })
  async listRules(
    @Param('tenantId') tenantId: string,
    @Query() query: AutomationListQueryDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.automationService.listRules(tenantId, query);
  }

  @Get('rules/:ruleId')
  @ApiOperation({ summary: 'Get a single automation rule' })
  async getRule(@Param('tenantId') tenantId: string, @Param('ruleId') ruleId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.automationService.getRule(tenantId, ruleId);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a new automation rule' })
  async createRule(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateAutomationRuleDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId() ?? undefined;
    return this.automationService.createRule(tenantId, dto, userId);
  }

  @Put('rules/:ruleId')
  @ApiOperation({ summary: 'Update an automation rule' })
  async updateRule(
    @Param('tenantId') tenantId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateAutomationRuleDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.automationService.updateRule(tenantId, ruleId, dto);
  }

  @Delete('rules/:ruleId')
  @ApiOperation({ summary: 'Delete an automation rule' })
  async deleteRule(@Param('tenantId') tenantId: string, @Param('ruleId') ruleId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.automationService.deleteRule(tenantId, ruleId);
  }

  @Patch('rules/:ruleId/toggle')
  @ApiOperation({ summary: 'Toggle active/inactive state of a rule' })
  async toggleRule(@Param('tenantId') tenantId: string, @Param('ruleId') ruleId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.automationService.toggleRule(tenantId, ruleId);
  }

  @Get('logs')
  @ApiOperation({ summary: 'List automation execution logs for a tenant' })
  async listLogs(
    @Param('tenantId') tenantId: string,
    @Query() query: AutomationLogQueryDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.automationService.listLogs(tenantId, query);
  }

}
