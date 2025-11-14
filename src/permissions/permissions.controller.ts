import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all available permissions with IDs' })
  async findAll() {
    const permissions = await this.permissionsService.getAll();
    return { permissions };
  }

  @Get('codes')
  @ApiOperation({ summary: 'List all available permission codes' })
  async findAllCodes() {
    const codes = await this.permissionsService.getAllCodes();
    return { permissions: codes };
  }

  @Get('role/:tenantId/:roleId')
  @ApiOperation({ summary: 'Get permissions for a specific role' })
  async getRolePermissions(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    const codes = await this.permissionsService.getCodesForRole(tenantId, roleId);
    return { permissions: codes };
  }
}

