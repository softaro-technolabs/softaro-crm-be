import { Controller, Get, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { DashboardService } from './dashboard.service';
import { DashboardResponseDto, DashboardQueryDto } from './dashboard.dto';

@ApiTags('Dashboard')
@Controller('tenants/:tenantId/dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get dashboard summary analytics' })
  async getSummary(
    @Param('tenantId') tenantId: string,
    @Query() query: DashboardQueryDto
  ): Promise<DashboardResponseDto> {
    this.verifyTenantAccess(tenantId);
    return this.dashboardService.getDashboardSummary(tenantId, query);
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
