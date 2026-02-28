import {
    Body,
    Controller,
    Post,
    UseGuards,
    Param,
    ForbiddenException
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { ConnectAccountDto, OnboardTenantDto } from './whatsapp.dto';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp Setup')
@Controller('tenants/:tenantId/whatsapp')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WhatsappAuthController {
    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly requestContext: RequestContextService
    ) { }

    @Post('exchange-code')
    @ApiOperation({ summary: 'Exchange Meta Embedded Signup code for token' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async exchangeCode(
        @Param('tenantId') tenantId: string,
        @Body() dto: OnboardTenantDto
    ) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.onboardTenantAccount(tenantId, dto.code);
    }

    @Post('connect')
    @ApiOperation({ summary: 'Save connected WhatsApp Account credentials' })
    @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
    async connectAccount(
        @Param('tenantId') tenantId: string,
        @Body() dto: ConnectAccountDto
    ) {
        this.verifyTenantAccess(tenantId);
        return this.whatsappService.saveTenantAccount(
            tenantId,
            dto.businessAccountId,
            dto.phoneNumberId,
            dto.phoneNumber,
            dto.wabaId ?? null,
            dto.permanentToken
        );
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
