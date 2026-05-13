import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, RoleListQueryDto } from './roles.dto';
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
    this.requestContext.verifyTenantAccess(tenantId);
    return this.rolesService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all roles in a tenant' })
  async findAll(@Param('tenantId') tenantId: string, @Query() query: RoleListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.rolesService.findByTenant(tenantId, query);
  }

  @Get(':roleId')
  @ApiOperation({ summary: 'Get role by ID' })
  async findById(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.rolesService.findById(roleId);
  }

  @Put(':roleId')
  @ApiOperation({ summary: 'Update role' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.rolesService.update(tenantId, roleId, dto);
  }

  @Delete(':roleId')
  @ApiOperation({ summary: 'Delete role' })
  async delete(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.rolesService.delete(tenantId, roleId);
    return null;
  }
}
