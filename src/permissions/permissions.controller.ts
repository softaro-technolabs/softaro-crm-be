import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { CreatePermissionDto, UpdatePermissionDto, GenerateModulePermissionsDto } from './permissions.dto';

@ApiTags('Permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Create a new permission (Super Admin only)' })
  async create(@Body() dto: CreatePermissionDto) {
    return await this.permissionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all available permissions with IDs' })
  async findAll() {
    return await this.permissionsService.getAll();
  }

  @Get('codes')
  @ApiOperation({ summary: 'List all available permission codes' })
  async findAllCodes() {
    return await this.permissionsService.getAllCodes();
  }

  @Get('module/:moduleSlug')
  @ApiOperation({ summary: 'Get all permissions for a specific module' })
  async findByModule(@Param('moduleSlug') moduleSlug: string) {
    return await this.permissionsService.findByModuleSlug(moduleSlug);
  }

  @Get('role/:tenantId/:roleId')
  @ApiOperation({ summary: 'Get permissions for a specific role' })
  async getRolePermissions(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
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

  @Post('generate')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Generate standard permissions for a module (Super Admin only)' })
  async generateModulePermissions(@Body() dto: GenerateModulePermissionsDto) {
    return await this.permissionsService.generateModulePermissions(dto.moduleSlug);
  }
}

