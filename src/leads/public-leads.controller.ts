import { Controller, Post, Body, Query, BadRequestException, Logger, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiHeader } from '@nestjs/swagger';
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
    @ApiQuery({ name: 'apiKey', required: false, description: 'Tenant Public API Key (can also use x-lead-api-key header)' })
    @ApiHeader({ name: 'x-lead-api-key', required: false, description: 'Tenant Public API Key' })
    async captureLead(
        @Query('apiKey') apiKey: string,
        @Headers('x-lead-api-key') headerKey: string,
        @Body() dto: PublicLeadCaptureDto & { notes?: string; source?: string }
    ) {
        const finalKey = (apiKey || headerKey)?.trim();
        
        // Comprehensive Logging for Debugging
        this.logger.log(`[Incoming Lead Capture] Key Received: [${finalKey}]`);
        this.logger.log(`[Incoming Lead Capture] Payload: ${JSON.stringify(dto)}`);

        if (!finalKey) {
            throw new BadRequestException('API Key is required (pass via ?apiKey= or x-lead-api-key header)');
        }

        // 1. Find tenant by API Key
        const settings = await this.leadAssignmentService.findSettingsByApiKey(finalKey);
        if (!settings) {
            this.logger.warn(`[Capture Failed] Invalid API Key: [${finalKey}]`);
            throw new BadRequestException('Invalid API Key');
        }

        const tenantId = settings.tenantId;
        this.logger.log(`[Capture Success] Found Tenant ID: ${tenantId}`);

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
