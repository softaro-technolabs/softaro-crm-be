import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { CreatePropertyMediaDto, PropertyMediaListQueryDto, UpdatePropertyMediaDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Media')
@Controller('tenants/:tenantId/properties/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertyMediaController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List media for an entity (optionally a unit)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: PropertyMediaListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.listMedia(tenantId, { entityId: query.entityId, unitId: query.unitId });
  }

  @Post()
  @ApiOperation({ summary: 'Create media record' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreatePropertyMediaDto) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.createMedia(tenantId, dto);
  }

  @Put(':mediaId')
  @ApiOperation({ summary: 'Update media record' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('mediaId') mediaId: string,
    @Body() dto: UpdatePropertyMediaDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.updateMedia(tenantId, mediaId, dto);
  }

  @Delete(':mediaId')
  @ApiOperation({ summary: 'Delete media record' })
  async delete(@Param('tenantId') tenantId: string, @Param('mediaId') mediaId: string) {
    this.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteMedia(tenantId, mediaId);
    return null;
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) throw new ForbiddenException('User context not found');
    if (user.role_global === 'super_admin') return;
    if (user.tenant_id !== tenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}

