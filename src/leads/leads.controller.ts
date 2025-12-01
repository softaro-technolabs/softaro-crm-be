import {
  Body,
  Controller,
  Get,
  ForbiddenException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Express } from 'express';
import 'multer';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { LeadsService } from './leads.service';
import {
  CreateLeadDto,
  CreateLeadStatusDto,
  LeadListQueryDto,
  LeadTransferDto,
  ReorderLeadStatusesDto,
  UpdateLeadDto,
  UpdateLeadStatusDto
} from './leads.dto';

@ApiTags('Leads')
@Controller('tenants/:tenantId/leads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List leads with filters and pagination' })
  async list(@Param('tenantId') tenantId: string, @Query() query: LeadListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.leadsService.listLeads(tenantId, query);
  }

  @Get(':leadId')
  @ApiOperation({ summary: 'Get lead details' })
  async detail(@Param('tenantId') tenantId: string, @Param('leadId') leadId: string) {
    this.verifyTenantAccess(tenantId);
    return this.leadsService.getLead(tenantId, leadId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateLeadDto) {
    this.verifyTenantAccess(tenantId);
    const createdBy = this.requestContext.getUserId();
    return this.leadsService.createLead(tenantId, dto, { createdByUserId: createdBy });
  }

  @Put(':leadId')
  @ApiOperation({ summary: 'Update an existing lead' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Body() dto: UpdateLeadDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.leadsService.updateLead(tenantId, leadId, dto);
  }

  @Patch(':leadId/status')
  @ApiOperation({ summary: 'Move lead across pipeline / update Kanban position' })
  async updateStatus(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Body() dto: UpdateLeadStatusDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.leadsService.updateLeadStatus(tenantId, leadId, dto);
  }

  @Post(':leadId/transfer')
  @ApiOperation({ summary: 'Manually transfer a lead to another agent' })
  async transfer(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Body() dto: LeadTransferDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.leadsService.transferLead(tenantId, leadId, dto);
  }

  @Get('pipeline/statuses')
  @ApiOperation({ summary: 'Fetch pipeline/kanban statuses with counts' })
  async pipeline(@Param('tenantId') tenantId: string) {
    this.verifyTenantAccess(tenantId);
    return this.leadsService.getPipeline(tenantId);
  }

  @Post('pipeline/statuses')
  @ApiOperation({ summary: 'Create a new pipeline status column' })
  async createStatus(@Param('tenantId') tenantId: string, @Body() dto: CreateLeadStatusDto) {
    this.verifyTenantAccess(tenantId);
    return this.leadsService.createPipelineStatus(tenantId, dto);
  }

  @Patch('pipeline/reorder')
  @ApiOperation({ summary: 'Reorder pipeline columns (drag & drop order)' })
  async reorderStatuses(@Param('tenantId') tenantId: string, @Body() dto: ReorderLeadStatusesDto) {
    this.verifyTenantAccess(tenantId);
    return this.leadsService.reorderPipeline(tenantId, dto);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bulk import leads from Excel/CSV' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel/CSV file containing leads'
        }
      },
      required: ['file']
    }
  })
  async import(
    @Param('tenantId') tenantId: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    this.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadsService.importLeads(tenantId, file, userId ?? undefined);
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


