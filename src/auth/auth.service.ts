import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';

import { AuthTokenService, AuthJwtPayload } from './auth.utils';
import { LoginDto, RefreshTokenDto } from './auth.dto';
import { ModulesService } from '../modules/modules.service';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesService } from '../roles/roles.service';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';

import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly rolesService: RolesService,
    private readonly permissionsService: PermissionsService,
    private readonly modulesService: ModulesService,
    private readonly tokenService: AuthTokenService
  ) { }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tenantIdentifier = dto.tenantSlug?.trim();

    // Super admin can login with or without tenant slug (tenant slug is optional)
    // Normal users must provide tenant slug
    if (user.roleGlobal !== 'super_admin' && !tenantIdentifier) {
      throw new BadRequestException('Tenant slug is required for normal users');
    }

    const context = await this.resolveAuthContext(user.id, user.roleGlobal, tenantIdentifier);

    const payload: AuthJwtPayload = {
      sub: user.id,
      name: user.name,
      tenant_id: context.tenant?.id ?? null,
      role_id: context.role?.id ?? null,
      role_global: user.roleGlobal,
      permissions: context.permissions as string[]
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken(payload),
      this.tokenService.signRefreshToken({
        sub: payload.sub,
        tenant_id: payload.tenant_id,
        role_id: payload.role_id,
        role_global: payload.role_global
      })
    ]);

    // Fire and forget updating last login to avoid blocking the response
    this.usersService.updateLastLogin(user.id).catch(err => {
      console.error('Failed to update last login:', err);
    });

    return {
      token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        roleGlobal: user.roleGlobal
      },
      tenant: context.tenant,
      role: context.role,
      permissions: context.permissions,
      modules: context.modules,
      routes: context.routes,
      tenants: context.tenants
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const decoded = await this.tokenService.verifyRefreshToken(dto.refreshToken);
    const user = await this.usersService.findById(decoded.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const context = await this.resolveAuthContext(
      user.id,
      user.roleGlobal,
      decoded.tenant_id ?? undefined
    );

    const payload: AuthJwtPayload = {
      sub: user.id,
      name: user.name,
      tenant_id: context.tenant?.id ?? null,
      role_id: context.role?.id ?? null,
      role_global: user.roleGlobal,
      permissions: context.permissions as string[]
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken(payload),
      this.tokenService.signRefreshToken({
        sub: payload.sub,
        tenant_id: payload.tenant_id,
        role_id: payload.role_id,
        role_global: payload.role_global
      })
    ]);

    return {
      token: accessToken,
      refresh_token: refreshToken
    };
  }

  async me(payload: AuthJwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const context = await this.resolveAuthContext(
      user.id,
      user.roleGlobal,
      payload.tenant_id ?? undefined
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        roleGlobal: user.roleGlobal
      },
      tenant: context.tenant,
      role: context.role,
      permissions: context.permissions,
      modules: context.modules,
      routes: context.routes,
      tenants: context.tenants
    };
  }

  private async resolveAuthContext(
    userId: string,
    roleGlobal: 'super_admin' | 'normal',
    tenantIdentifier?: string
  ) {
    if (roleGlobal === 'super_admin') {
      // Super admin can login with or without tenant slug
      // If tenant slug is provided, use that tenant context
      // If not provided, login without tenant context (global super admin view)
      const tenant = tenantIdentifier
        ? await this.findTenantByIdentifier(tenantIdentifier)
        : null;

      if (tenantIdentifier && !tenant) {
        throw new BadRequestException('Tenant not found');
      }

      const modules = tenant
        ? await this.modulesService.getTenantModules(tenant.id)
        : await this.modulesService.getAllModules();

      const allMasterPermissions = await this.permissionsService.getAllActions();
      const tenantsList = await this.tenantsService.findAll();

      const normalizedModulesWithFlag = modules.map(({ module, tenantModule }) => ({
        id: module.id,
        slug: module.slug,
        name: module.name,
        route: module.defaultRoute,
        parentId: module.parentId,
        isEnabled: tenantModule ? tenantModule.isEnabled : true
      }));

      const enabledModules = normalizedModulesWithFlag
        .filter((item) => item.isEnabled)
        .map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          route: item.route,
          parentId: item.parentId
        }));

      const allPermissions = enabledModules.flatMap((module) =>
        allMasterPermissions.map((perm) => `${module.slug}.${perm.action}`)
      );
      const routes = Array.from(new Set(enabledModules.map((item) => item.route)));

      return {
        tenant,
        role: null,
        permissions: Array.from(new Set(allPermissions)),
        modules: enabledModules,
        routes,
        tenants: tenantsList
      };
    }

    // Normal users must provide tenant identifier
    if (!tenantIdentifier) {
      throw new BadRequestException('Tenant slug is required for normal users');
    }

    const membership = await this.usersService.findUserWithTenant(userId, tenantIdentifier);

    if (!membership?.tenant || !membership.membership) {
      throw new UnauthorizedException('User does not belong to this tenant');
    }

    if (membership.membership.status !== 'active') {
      throw new UnauthorizedException('User is not active for this tenant');
    }

    if (membership.tenant.status !== 'active') {
      throw new UnauthorizedException('Tenant is not active');
    }

    const modules = await this.modulesService.getTenantModules(membership.tenant.id);

    const permissionsList = membership.membership.roleId
      ? await this.permissionsService.getCodesForRole(
        membership.tenant.id,
        membership.membership.roleId
      )
      : [];

    const accessibleTenants = await this.usersService.getTenantsForUser(userId);

    const normalizedModulesWithFlag = modules.map(({ module, tenantModule }) => ({
      id: module.id,
      slug: module.slug,
      name: module.name,
      route: module.defaultRoute,
      parentId: module.parentId,
      isEnabled: tenantModule?.isEnabled ?? true
    }));
    const enabledModules = normalizedModulesWithFlag
      .filter((item) => item.isEnabled)
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        route: item.route,
        parentId: item.parentId
      }));

    const permissions = Array.from(new Set(permissionsList));

    const role =
      membership.membership.roleId && membership.role
        ? membership.role
        : null;

    const tenantMap = new Map<string, (typeof accessibleTenants)[number]['tenant']>();
    for (const entry of accessibleTenants) {
      if (entry.tenant && !tenantMap.has(entry.tenant.id)) {
        tenantMap.set(entry.tenant.id, entry.tenant);
      }
    }

    const routes = Array.from(new Set(enabledModules.map((item) => item.route)));

    return {
      tenant: membership.tenant,
      role,
      permissions,
      modules: enabledModules,
      routes,
      tenants: Array.from(tenantMap.values())
    };
  }

  private async findTenantByIdentifier(identifier: string) {
    if (!identifier) {
      return null;
    }

    const [byId, bySlug] = await Promise.all([
      this.tenantsService.findById(identifier),
      this.tenantsService.findBySlug(identifier)
    ]);

    return byId ?? bySlug;
  }
}

