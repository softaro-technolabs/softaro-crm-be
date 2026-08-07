import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { QuotationsService } from './quotations.service';
import { PdfGeneratorService } from './pdf-generator.service';
import {
  CreateQuotationDto,
  UpdateQuotationDto,
  QuotationListQueryDto,
  ConvertToDealDto
} from './quotations.dto';

@ApiTags('Quotations')
@Controller('tenants/:tenantId/quotations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('quotations', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List quotations with filters and pagination' })
  async list(@Param('tenantId') tenantId: string, @Query() query: QuotationListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.quotationsService.listQuotations(tenantId, query);
  }

  @Permissions(...perms('quotations', ACTIONS.READ))
  @Get(':id')
  @ApiOperation({ summary: 'Get quotation details' })
  async detail(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.quotationsService.getQuotation(tenantId, id);
  }

  @Permissions(...perms('quotations', ACTIONS.READ))
  @Get(':id/pdf')
  @ApiOperation({ summary: 'Generate PDF for quotation' })
  async generatePdf(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Res() res: Response
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const quotation = await this.quotationsService.getQuotation(tenantId, id);
    const buffer = await this.pdfGeneratorService.generateQuotationPdf(quotation);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=quotation-${quotation.quotationNumber}.pdf`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Permissions(...perms('quotations', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Create a new quotation' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateQuotationDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.quotationsService.createQuotation(tenantId, dto);
  }

  @Permissions(...perms('quotations', ACTIONS.UPDATE))
  @Put(':id')
  @ApiOperation({ summary: 'Update an existing quotation' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.quotationsService.updateQuotation(tenantId, id, dto);
  }

  @Permissions(...perms('quotations', ACTIONS.DELETE))
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a quotation' })
  async delete(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.quotationsService.deleteQuotation(tenantId, id);
  }

  @Permissions(...perms('quotations', ACTIONS.WRITE))
  @Post(':id/send-email')
  @ApiOperation({ summary: 'Send quotation to lead via email' })
  async sendEmail(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.quotationsService.sendQuotationByEmail(tenantId, id);
  }

  @Permissions(...perms('quotations', ACTIONS.WRITE))
  @Post(':id/revision')
  @ApiOperation({ summary: 'Create a new version of the quotation' })
  async createRevision(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.quotationsService.createRevision(tenantId, id);
  }

  @Permissions(...perms('quotations', ACTIONS.WRITE))
  @Post(':id/convert-to-deal')
  @ApiOperation({ summary: 'Convert quotation to a deal and create contact' })
  async convertToDeal(
    @Param('tenantId') tenantId: string, 
    @Param('id') id: string,
    @Body() dto: ConvertToDealDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.quotationsService.convertToDeal(tenantId, id, dto);
  }
}
