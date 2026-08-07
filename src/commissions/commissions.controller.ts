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
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import {
  CommissionListQueryDto,
  CreateCommissionDto,
  UpdateCommissionDto
} from './commissions.dto';
import { CommissionsService } from './commissions.service';

@ApiTags('Commissions')
@Controller('tenants/:tenantId/commissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CommissionsController {
  constructor(
    private readonly commissionsService: CommissionsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('commissions', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List commissions with pagination and filters' })
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query() query: CommissionListQueryDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.findAll(tenantId, query);
  }

  @Permissions(...perms('commissions', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Create a new commission record' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCommissionDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.create(tenantId, dto, this.requestContext.getUserId());
  }

  @Permissions(...perms('commissions', ACTIONS.READ))
  @Get(':id')
  @ApiOperation({ summary: 'Get commission details by ID' })
  async findOne(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.findOne(tenantId, id);
  }

  @Permissions(...perms('commissions', ACTIONS.UPDATE))
  @Patch(':id')
  @ApiOperation({ summary: 'Update a commission record' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCommissionDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.update(tenantId, id, dto);
  }

  @Permissions(...perms('commissions', ACTIONS.UPDATE))
  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a commission' })
  async approve(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.commissionsService.approve(tenantId, id, userId!);
  }

  @Permissions(...perms('commissions', ACTIONS.UPDATE))
  @Patch(':id/mark-paid')
  @ApiOperation({ summary: 'Mark a commission as paid' })
  async markPaid(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.markPaid(tenantId, id);
  }

  @Permissions(...perms('commissions', ACTIONS.DELETE))
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a commission record' })
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.remove(tenantId, id);
  }
}
