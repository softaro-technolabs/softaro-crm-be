import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { RegisterUserDto, UpdateUserTenantDto, UserListQueryDto } from './users.dto';
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
    this.requestContext.verifyTenantAccess(tenantId);
    return this.usersService.registerUserInTenant(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all users in a tenant with pagination, sorting, and filters' })
  async findAll(@Param('tenantId') tenantId: string, @Query() query: UserListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.usersService.findUsersByTenant(tenantId, query);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Get user details in a tenant' })
  async findById(@Param('tenantId') tenantId: string, @Param('userId') userId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    const result = await this.usersService.findUserWithTenant(userId, tenantId);
    if (!result || result.tenant?.id !== tenantId) {
      throw new NotFoundException('User not found in this tenant');
    }
    return result;
  }

  @Put(':userId')
  @ApiOperation({ summary: 'Update user details and tenant membership' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserTenantDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.usersService.updateUserTenantMembership(tenantId, userId, dto);
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Delete user and all associated data' })
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.usersService.deleteUser(userId);
    return { message: 'User deleted successfully' };
  }
}
