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
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List quotations with filters and pagination' })
  async list(@Param('tenantId') tenantId: string, @Query() query: QuotationListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.quotationsService.listQuotations(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get quotation details' })
  async detail(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.verifyTenantAccess(tenantId);
    return this.quotationsService.getQuotation(tenantId, id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Generate PDF for quotation' })
  async generatePdf(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Res() res: Response
  ) {
    this.verifyTenantAccess(tenantId);
    const quotation = await this.quotationsService.getQuotation(tenantId, id);
    const buffer = await this.pdfGeneratorService.generateQuotationPdf(quotation);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=quotation-${quotation.quotationNumber}.pdf`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new quotation' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateQuotationDto) {
    this.verifyTenantAccess(tenantId);
    return this.quotationsService.createQuotation(tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing quotation' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuotationDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.quotationsService.updateQuotation(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a quotation' })
  async delete(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.verifyTenantAccess(tenantId);
    return this.quotationsService.deleteQuotation(tenantId, id);
  }

  @Post(':id/send-email')
  @ApiOperation({ summary: 'Send quotation to lead via email' })
  async sendEmail(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.verifyTenantAccess(tenantId);
    return this.quotationsService.sendQuotationByEmail(tenantId, id);
  }

  @Post(':id/revision')
  @ApiOperation({ summary: 'Create a new version of the quotation' })
  async createRevision(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.verifyTenantAccess(tenantId);
    return this.quotationsService.createRevision(tenantId, id);
  }

  @Post(':id/convert-to-deal')
  @ApiOperation({ summary: 'Convert quotation to a deal and create contact' })
  async convertToDeal(
    @Param('tenantId') tenantId: string, 
    @Param('id') id: string,
    @Body() dto: ConvertToDealDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.quotationsService.convertToDeal(tenantId, id, dto);
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    if (user.role_global === 'super_admin') {
      return;
    }

    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
  }
}
