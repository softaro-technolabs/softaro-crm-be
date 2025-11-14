import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

@ApiTags('Roles')
@Controller('tenants/:tenantId/roles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new role in a tenant' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateRoleDto) {
    this.verifyTenantAccess(tenantId);
    return this.rolesService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all roles in a tenant' })
  async findAll(@Param('tenantId') tenantId: string) {
    this.verifyTenantAccess(tenantId);
    return this.rolesService.findByTenant(tenantId);
  }

  @Get(':roleId')
  @ApiOperation({ summary: 'Get role by ID' })
  async findById(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    this.verifyTenantAccess(tenantId);
    return this.rolesService.findById(roleId);
  }

  @Put(':roleId')
  @ApiOperation({ summary: 'Update role' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.rolesService.update(tenantId, roleId, dto);
  }

  @Delete(':roleId')
  @ApiOperation({ summary: 'Delete role' })
  async delete(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    this.verifyTenantAccess(tenantId);
    await this.rolesService.delete(tenantId, roleId);
    return null;
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    // Super admin can access any tenant
    if (user.role_global === 'super_admin') {
      return;
    }

    // Normal users can only access their own tenant
    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
  }
}

