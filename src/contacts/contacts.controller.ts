import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { ContactsService } from './contacts.service';

@ApiTags('Contacts (Customers)')
@Controller('tenants/:tenantId/contacts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all customers/contacts' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async list(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit?: number,
    @Query('page') page?: number,
    @Query('search') search?: string
  ) {
    this.verifyTenantAccess(tenantId);
    return this.contactsService.listContacts(tenantId, { limit, page, search });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a single customer' })
  async findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    this.verifyTenantAccess(tenantId);
    return this.contactsService.getContact(tenantId, id);
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) return;
    if (user.role_global === 'super_admin') return;
    if (user.tenant_id !== tenantId) {
      throw new Error('Access denied to this tenant');
    }
  }
}
