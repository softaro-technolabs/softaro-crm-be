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
import { RequestContextService } from '../common/utils/request-context.service';
import {
  CommissionListQueryDto,
  CreateCommissionDto,
  UpdateCommissionDto
} from './commissions.dto';
import { CommissionsService } from './commissions.service';

@ApiTags('Commissions')
@Controller('tenants/:tenantId/commissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommissionsController {
  constructor(
    private readonly commissionsService: CommissionsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List commissions with pagination and filters' })
  async findAll(
    @Param('tenantId') tenantId: string,
    @Query() query: CommissionListQueryDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.findAll(tenantId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new commission record' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateCommissionDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.create(tenantId, dto, this.requestContext.getUserId());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get commission details by ID' })
  async findOne(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.findOne(tenantId, id);
  }

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

  @Patch(':id/mark-paid')
  @ApiOperation({ summary: 'Mark a commission as paid' })
  async markPaid(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.markPaid(tenantId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a commission record' })
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.commissionsService.remove(tenantId, id);
  }

    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
  }
}
