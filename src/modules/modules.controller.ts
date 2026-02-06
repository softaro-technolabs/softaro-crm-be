import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ModulesService } from './modules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { CreateModuleDto, UpdateModuleDto } from './modules.dto';

import { RequestContextService } from '../common/utils/request-context.service';

@ApiTags('Modules')
@Controller('modules')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ModulesController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly requestContext: RequestContextService
  ) { }

  @Post()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Create a new module (Super Admin only)' })
  async create(@Body() dto: CreateModuleDto) {
    return await this.modulesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all available modules' })
  async findAll() {
    return await this.modulesService.getAllModules();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get modules accessible by the current user' })
  async getMyModules() {
    const user = this.requestContext.getUser();
    if (!user || !user.tenant_id) {
      // If no tenant context (e.g. global super admin not logged into a tenant), returns all global modules
      // But user specifically said "show accordingly in sidebar", implies inside a workspace/tenant.
      // If super admin without tenant, technically they see no tenant modules, or all system modules.
      // Let's fallback to returning all modules if super admin, else error.
      if (user?.role_global === 'super_admin') {
        return (await this.modulesService.getAllModules()).map(m => m.module);
      }
      throw new ForbiddenException('Tenant context required');
    }

    return await this.modulesService.getAccessibleModules(
      user.tenant_id as string,
      user.role_global as string,
      user.permissions
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get module by ID' })
  async findById(@Param('id') id: string) {
    return await this.modulesService.findById(id);
  }

  @Put(':id')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Update module (Super Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateModuleDto) {
    return await this.modulesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Delete module (Super Admin only)' })
  async delete(@Param('id') id: string) {
    await this.modulesService.delete(id);
    return null;
  }
}


