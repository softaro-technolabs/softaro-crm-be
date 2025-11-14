import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './tenants.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { AuthJwtPayload } from '../auth/auth.utils';

@ApiTags('Tenants')
@Controller('tenants')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Create a new tenant (Super Admin only)' })
  async create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'List all tenants (Super Admin only)' })
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Get tenant by ID (Super Admin only)' })
  async findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Put(':id')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: 'Update tenant (Super Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }
}



