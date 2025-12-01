import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { LeadAssignmentService } from './lead-assignment.service';
import {
  UpdateAgentAvailabilityDto,
  UpdateLeadAssignmentSettingsDto,
  UpsertLeadAssignmentAgentDto
} from './leads.dto';

@ApiTags('Lead Assignment')
@Controller('tenants/:tenantId/leads/assignment')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadAssignmentController {
  constructor(
    private readonly assignmentService: LeadAssignmentService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get auto-assignment settings' })
  async getSettings(@Param('tenantId') tenantId: string) {
    this.verifyTenantAccess(tenantId);
    return this.assignmentService.getSettings(tenantId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update auto-assignment settings' })
  async updateSettings(@Param('tenantId') tenantId: string, @Body() dto: UpdateLeadAssignmentSettingsDto) {
    this.verifyTenantAccess(tenantId);
    return this.assignmentService.updateSettings(tenantId, dto);
  }

  @Get('agents')
  @ApiOperation({ summary: 'List assignment agents & profiles' })
  async listAgents(@Param('tenantId') tenantId: string) {
    this.verifyTenantAccess(tenantId);
    return this.assignmentService.listAgentProfiles(tenantId);
  }

  @Post('agents')
  @ApiOperation({ summary: 'Create or update agent assignment profile' })
  async upsertAgent(@Param('tenantId') tenantId: string, @Body() dto: UpsertLeadAssignmentAgentDto) {
    this.verifyTenantAccess(tenantId);
    return this.assignmentService.upsertAgentProfile(tenantId, dto);
  }

  @Patch('agents/:userId/availability')
  @ApiOperation({ summary: 'Set assignment availability for an agent' })
  async updateAvailability(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateAgentAvailabilityDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.assignmentService.setAgentAvailability(tenantId, userId, dto.isAvailable);
  }

  @Post('settings/rotate-api-key')
  @ApiOperation({
    summary: 'Rotate public API key for lead capture',
    description: `**⚠️ Requires Authentication (JWT Bearer Token)**
    
**How to use:**
1. First, login to get a JWT token: POST /auth/login
2. Use the token in Authorization header: "Bearer {your-token}"
3. Call this endpoint to generate a new API key
4. The old key will be invalidated immediately
5. Use the new key in x-lead-api-key header for public lead capture

**Why Access Denied?**
- You must be logged in (JWT token required)
- You must belong to the tenant (tenantId in URL must match your tenant)
- Super admin can access any tenant

**Alternative:** Use GET /tenants/{tenantId}/leads/assignment/settings to view current key (also requires auth)`
  })
  async rotateApiKey(@Param('tenantId') tenantId: string) {
    this.verifyTenantAccess(tenantId);
    return this.assignmentService.rotatePublicApiKey(tenantId);
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


