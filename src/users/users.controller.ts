import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { RegisterUserDto, UpdateUserTenantDto } from './users.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

@ApiTags('Users')
@Controller('tenants/:tenantId/users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly requestContext: RequestContextService
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user in a tenant' })
  async register(@Param('tenantId') tenantId: string, @Body() dto: RegisterUserDto) {
    this.verifyTenantAccess(tenantId);
    return this.usersService.registerUserInTenant(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all users in a tenant' })
  async findAll(@Param('tenantId') tenantId: string) {
    this.verifyTenantAccess(tenantId);
    return this.usersService.findUsersByTenant(tenantId);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get user details in a tenant' })
  async findById(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    this.verifyTenantAccess(tenantId);
    const result = await this.usersService.findUserWithTenant(userId, tenantId);
    if (!result || result.tenant?.id !== tenantId) {
      throw new NotFoundException('User not found in this tenant');
    }
    return result;
  }

  @Put(':userId')
  @ApiOperation({ summary: 'Update user membership in a tenant' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserTenantDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.usersService.updateUserTenantMembership(tenantId, userId, dto);
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    // Super admin can access any tenant
    if (user.role_global === 'super_admin') {
      return;
    }

    // Normal users can only access their own tenant
    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
  }
}

