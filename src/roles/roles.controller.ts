import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, RoleListQueryDto } from './roles.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccessControlService } from '../rbac/access-control.service';
import { NotificationGateway } from '../notifications/notification.gateway';

/**
 * Role management is admin-only across the board.
 *
 * Without this, any tenant member could create a role with `isAdmin: true` and
 * assign it to themselves — a full takeover of the tenant from an agent login.
 */
@ApiTags('Roles')
@Controller('tenants/:tenantId/roles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly accessControl: AccessControlService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new role in a tenant (admin)' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateRoleDto) {
    await this.accessControl.requireAdmin(tenantId, 'create roles');
    return this.rolesService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List roles in a tenant (any member — feeds user-assignment dropdowns)' })
  async findAll(@Param('tenantId') tenantId: string, @Query() query: RoleListQueryDto) {
    // Deliberately not admin-only: role *names* are needed by the user list and
    // user-create screens. The permission detail behind each role stays admin-only
    // via `findById`, and only admins can create, edit or assign them.
    await this.accessControl.resolveActor(tenantId);
    return this.rolesService.findByTenant(tenantId, query);
  }

  @Get(':roleId')
  @ApiOperation({ summary: 'Get role by ID (admin)' })
  async findById(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    await this.accessControl.requireAdmin(tenantId, 'view roles');
    // Scoped by tenant: a raw id lookup would expose other tenants' roles.
    return this.rolesService.findByIdForTenant(tenantId, roleId);
  }

  @Put(':roleId')
  @ApiOperation({ summary: 'Update role (admin)' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRoleDto
  ) {
    const actor = await this.accessControl.requireAdmin(tenantId, 'update roles');
    const updated = await this.rolesService.update(tenantId, roleId, dto, actor.roleId);

    // Broadcast to every connected user in this tenant.
    // The frontend will check if the updated roleId matches the user's own role
    // and refresh their session only when it does.
    this.notificationGateway.sendNotificationToTenant(tenantId, 'permissions:updated', {
      roleId,
      tenantId,
    });

    return updated;
  }

  @Delete(':roleId')
  @ApiOperation({ summary: 'Delete role (admin)' })
  async delete(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    await this.accessControl.requireAdmin(tenantId, 'delete roles');
    await this.rolesService.delete(tenantId, roleId);
    return null;
  }
}
