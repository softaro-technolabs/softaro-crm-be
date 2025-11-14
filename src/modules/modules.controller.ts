import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ModulesService } from './modules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { CreateModuleDto, UpdateModuleDto } from './modules.dto';

@ApiTags('Modules')
@Controller('modules')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

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


