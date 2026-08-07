import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UsersService } from './users.service';
import { RegisterUserDto, UpdateUserTenantDto, UserListQueryDto } from './users.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { AccessControlService } from '../rbac/access-control.service';
import { NotificationGateway } from '../notifications/notification.gateway';

@ApiTags('Users')
@Controller('tenants/:tenantId/users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly requestContext: RequestContextService,
    private readonly accessControl: AccessControlService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user in a tenant (admin)' })
  async register(@Param('tenantId') tenantId: string, @Body() dto: RegisterUserDto) {
    // Membership creation carries a roleId, so this is an admin operation:
    // otherwise any member could invite a user straight into an admin role.
    await this.accessControl.requireAdmin(tenantId, 'add users to this tenant');
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
    const actor = await this.accessControl.resolveActor(tenantId);

    // Changing someone's role or membership status is an admin action. Regular
    // users may still edit their own profile fields, but nothing that grants access.
    const changesAccess = dto.roleId !== undefined || dto.status !== undefined;
    if (changesAccess || userId !== actor.userId) {
      this.accessControl.assertAdmin(actor, 'update other users or change roles');
    }

    const result = await this.usersService.updateUserTenantMembership(tenantId, userId, dto);

    // When an admin changes a user's role or status, push a targeted event so
    // that user's session refreshes immediately without waiting for a re-login.
    if (dto.roleId !== undefined || dto.status !== undefined) {
      this.notificationGateway.sendNotificationToUser(userId, 'permissions:updated', {
        userId,
        tenantId,
      });
    }

    return result;
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Delete user and all associated data (admin)' })
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string
  ) {
    const actor = await this.accessControl.requireAdmin(tenantId, 'delete users');

    if (userId === actor.userId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    // Tenant-scoped: the id comes from the URL, so without this check a member of
    // one tenant could delete a user belonging to another.
    await this.usersService.deleteUserInTenant(tenantId, userId);
    return { message: 'User deleted successfully' };
  }
}
