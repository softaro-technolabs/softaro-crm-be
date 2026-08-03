import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CpInventoryQueryDto, CpLoginDto, CpRegisterLeadDto } from './channel-partners.dto';
import { CpJwtAuthGuard, CurrentCp } from './cp-jwt-auth.guard';
import { CpPortalService } from './cp-portal.service';
import type { CpContext } from './cp-portal.service';

@ApiTags('Channel Partner Portal')
@Controller('cp')
export class CpPortalController {
  constructor(private readonly service: CpPortalService) {}

  @Post('auth/login')
  @ApiOperation({ summary: 'CP portal login' })
  async login(@Body() dto: CpLoginDto) {
    return this.service.login(dto);
  }

  @Get('inventory')
  @UseGuards(CpJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List available inventory (limited projection)' })
  async inventory(@CurrentCp() cp: CpContext, @Query() query: CpInventoryQueryDto) {
    return this.service.listInventory(cp, query);
  }

  @Post('leads')
  @UseGuards(CpJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a lead (claims attribution for this CP)' })
  async registerLead(@CurrentCp() cp: CpContext, @Body() dto: CpRegisterLeadDto) {
    return this.service.registerLead(cp, dto);
  }

  @Get('incentives')
  @UseGuards(CpJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List this CP's incentives" })
  async incentives(@CurrentCp() cp: CpContext) {
    return this.service.listMyIncentives(cp);
  }
}
