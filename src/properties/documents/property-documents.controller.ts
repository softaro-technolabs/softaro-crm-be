import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PropertyDocumentsService } from './property-documents.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Property Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('property-documents')
export class PropertyDocumentsController {
  constructor(private readonly documentsService: PropertyDocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'List property documents' })
  async list(
    @Request() req: any,
    @Query('leadId') leadId?: string,
    @Query('propertyUnitId') propertyUnitId?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
  ) {
    return this.documentsService.list(req.user.tenantId, {
      leadId,
      propertyUnitId,
      type,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document by ID' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.documentsService.findOne(req.user.tenantId, id);
  }
}
