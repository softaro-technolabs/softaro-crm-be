import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import {
  CreateWhatsappTemplateDto,
  UpdateWhatsappTemplateDto,
  WhatsappTemplateListQueryDto,
} from './whatsapp.dto';
import { WhatsappTemplatesService } from './whatsapp-templates.service';

@ApiTags('WhatsApp Templates')
@Controller('tenants/:tenantId/whatsapp/templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WhatsappTemplatesController {
  constructor(
    private readonly templatesService: WhatsappTemplatesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all WhatsApp message templates for a tenant' })
  async list(
    @Param('tenantId') tenantId: string,
    @Query() query: WhatsappTemplateListQueryDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.templatesService.findAll(tenantId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new WhatsApp message template' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateWhatsappTemplateDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.templatesService.create(tenantId, dto, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single WhatsApp message template by ID' })
  async detail(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.templatesService.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a WhatsApp message template' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappTemplateDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.templatesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a WhatsApp message template' })
  async remove(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.templatesService.remove(tenantId, id);
  }
}
