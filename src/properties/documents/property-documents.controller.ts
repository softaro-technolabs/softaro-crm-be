import { Controller, Get, Query, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PropertyDocumentsService } from './property-documents.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RequestContextService } from '../../common/utils/request-context.service';

@ApiTags('Property Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tenants/:tenantId/property-documents')
export class PropertyDocumentsController {
  constructor(
    private readonly documentsService: PropertyDocumentsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List property documents' })
  async list(
    @Param('tenantId') tenantId: string,
    @Query('leadId') leadId?: string,
    @Query('propertyUnitId') propertyUnitId?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ) {
    this.verifyTenantAccess(tenantId);
    return this.documentsService.list(tenantId, {
      leadId,
      propertyUnitId,
      type,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document by ID' })
  async findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.verifyTenantAccess(tenantId);
    return this.documentsService.findOne(tenantId, id);
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) throw new ForbiddenException('User context not found');
    if (user.role_global === 'super_admin') return;
    if (user.tenant_id !== tenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}
