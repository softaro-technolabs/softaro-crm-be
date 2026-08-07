import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { CreatePermissionDto, UpdatePermissionDto, PermissionListQueryDto } from './permissions.dto';
import { AccessControlService } from '../rbac/access-control.service';

@ApiTags('Permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly accessControl: AccessControlService,
  ) { }

  @Post()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Create a new master permission (Super Admin only)' })
  async create(@Body() dto: CreatePermissionDto) {
    return await this.permissionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all available master permissions' })
  async findAll(@Query() query: PermissionListQueryDto) {
    return await this.permissionsService.getAll(query);
  }

  @Get('actions')
  @ApiOperation({ summary: 'List all available permission actions' })
  async findAllActions() {
    return await this.permissionsService.getAllActions();
  }

  @Get('role/:tenantId/:roleId')
  @ApiOperation({ summary: 'Get permissions for a specific role (admin of that tenant)' })
  async getRolePermissions(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    // Without this, any authenticated user could read any tenant's role config
    // by guessing ids — the tenant id is just a path parameter.
    await this.accessControl.requireAdmin(tenantId, 'view role permissions');
    return await this.permissionsService.getCodesForRole(tenantId, roleId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get permission by ID' })
  async findById(@Param('id') id: string) {
    return await this.permissionsService.findById(id);
  }

  @Put(':id')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Update permission (Super Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return await this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Delete permission (Super Admin only)' })
  async delete(@Param('id') id: string) {
    await this.permissionsService.delete(id);
    return null;
  }

  @Post('seed')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Seed standard permissions' })
  async seed() {
    await this.permissionsService.seedStandardPermissions();
    return { success: true, message: 'Seeding initiated' };
  }
}

