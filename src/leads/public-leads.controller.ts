import { Controller, Post, Body, Query, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { LeadAssignmentService } from './lead-assignment.service';
import { PublicLeadCaptureDto } from './leads.dto';

@ApiTags('Public Lead API')
@Controller('public/external-leads')
export class PublicLeadsController {
    private readonly logger = new Logger(PublicLeadsController.name);

    constructor(
        private readonly leadsService: LeadsService,
        private readonly leadAssignmentService: LeadAssignmentService
    ) {}

    @Post('create')
    @ApiOperation({ summary: 'Capture lead from external website form' })
    @ApiQuery({ name: 'apiKey', description: 'Tenant Public API Key' })
    async captureLead(
        @Query('apiKey') apiKey: string,
        @Body() dto: PublicLeadCaptureDto & { notes?: string; source?: string }
    ) {
        if (!apiKey) {
            throw new BadRequestException('API Key is required');
        }

        // 1. Find tenant by API Key
        const settings = await this.leadAssignmentService.findSettingsByApiKey(apiKey);
        if (!settings) {
            throw new BadRequestException('Invalid API Key');
        }

        const tenantId = settings.tenantId;

        // 2. Create the lead
        return this.leadsService.createLead(tenantId, {
            ...dto,
            leadSource: (dto.source || dto.leadSource || 'website') as any,
            captureChannel: 'external_form',
            notes: dto.notes,
            autoAssign: true
        });
    }
}
