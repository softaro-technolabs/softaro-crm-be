import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, or, SQL, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  leadAssignmentAgents,
  leadAssignmentLogs,
  leadAssignmentSettings,
  leads,
  roles,
  tenants,
  userTenants,
  users
} from '../database/schema';
import { RegisterUserDto, UpdateUserTenantDto, UserListQueryDto } from './users.dto';
import { PaginationUtil } from '../common/utils/pagination.util';

import * as bcrypt from 'bcrypt';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  roleGlobal?: 'super_admin' | 'normal';
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly configService: ConfigService
  ) {}

  async createUser(input: CreateUserInput) {
    const existingUser = await this.findByEmail(input.email);
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const id = randomUUID();
    const saltRounds = this.configService.get<number>('security.hashRounds', 12);
    const passwordHash = await bcrypt.hash(input.password, saltRounds);

    await this.db.insert(users).values({
      id,
      email: input.email,
      passwordHash,
      name: input.name,
      phone: input.phone ?? null,
      roleGlobal: input.roleGlobal ?? 'normal'
    });

    return this.findById(id);
  }

  async registerUserInTenant(tenantId: string, dto: RegisterUserDto) {
    // Check if tenant exists
    const tenant = await this.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant.length) {
      throw new BadRequestException('Tenant not found');
    }

    // Check if user already exists
    let user = await this.findByEmail(dto.email);

    if (!user) {
      // Create new user
      user = await this.createUser({
        email: dto.email,
        password: dto.password,
        name: dto.name,
        phone: dto.phone,
        roleGlobal: 'normal'
      });
    } else {
      // User exists, check if already in this tenant
      const existingMembership = await this.db
        .select()
        .from(userTenants)
        .where(and(eq(userTenants.userId, user.id), eq(userTenants.tenantId, tenantId)))
        .limit(1);

      if (existingMembership.length > 0) {
        throw new BadRequestException('User is already registered in this tenant');
      }
    }

    // Verify role if provided
    if (dto.roleId) {
      const role = await this.db
        .select()
        .from(roles)
        .where(and(eq(roles.id, dto.roleId), eq(roles.tenantId, tenantId)))
        .limit(1);

      if (!role.length) {
        throw new BadRequestException('Role not found in this tenant');
      }
    }

    // Create user-tenant relationship
    const membershipId = randomUUID();
    await this.db.insert(userTenants).values({
      id: membershipId,
      userId: user.id,
      tenantId,
      roleId: dto.roleId ?? null,
      status: dto.status ?? 'active'
    });

    return this.findUserWithTenant(user.id, tenantId);
  }

  async updateUserTenantMembership(
    tenantId: string,
    userId: string,
    dto: UpdateUserTenantDto
  ) {
    // Check if user exists
    const user = await this.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if user is a member of this tenant
    const membership = await this.db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
      .limit(1);

    if (!membership.length) {
      throw new BadRequestException('User is not a member of this tenant');
    }

    // Check email uniqueness if email is being updated
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.findByEmail(dto.email);
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('Email is already in use by another user');
      }
    }

    // Verify role if provided
    if (dto.roleId) {
      const role = await this.db
        .select()
        .from(roles)
        .where(and(eq(roles.id, dto.roleId), eq(roles.tenantId, tenantId)))
        .limit(1);

      if (!role.length) {
        throw new BadRequestException('Role not found in this tenant');
      }
    }

    // Update user fields if provided
    const userUpdateData: Partial<typeof users.$inferInsert> = {};
    if (dto.name !== undefined) userUpdateData.name = dto.name;
    if (dto.email !== undefined) userUpdateData.email = dto.email;
    if (dto.phone !== undefined) userUpdateData.phone = dto.phone ?? null;

    if (Object.keys(userUpdateData).length > 0) {
      userUpdateData.updatedAt = new Date();
      await this.db.update(users).set(userUpdateData).where(eq(users.id, userId));
    }

    // Update tenant membership if provided
    const membershipUpdateData: Partial<typeof userTenants.$inferInsert> = {};
    if (dto.roleId !== undefined) membershipUpdateData.roleId = dto.roleId;
    if (dto.status !== undefined) membershipUpdateData.status = dto.status;

    if (Object.keys(membershipUpdateData).length > 0) {
      await this.db
        .update(userTenants)
        .set(membershipUpdateData)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)));
    }

    return this.findUserWithTenant(userId, tenantId);
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async findByEmail(email: string) {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  }

  async updatePassword(userId: string, password: string) {
    const saltRounds = this.configService.get<number>('security.hashRounds', 12);
    const passwordHash = await bcrypt.hash(password, saltRounds);
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  }

  async updateLastLogin(userId: string) {
    await this.db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, userId));
  }

  async findUserWithTenant(userIdOrEmail: string, tenantSlugOrId?: string) {
    const baseCondition = or(eq(users.email, userIdOrEmail), eq(users.id, userIdOrEmail));

    const whereClause =
      tenantSlugOrId && tenantSlugOrId.length > 0
        ? and(baseCondition, or(eq(tenants.slug, tenantSlugOrId), eq(tenants.id, tenantSlugOrId)))
        : baseCondition;

    const [row] = await this.db
      .select({
        user: users,
        tenant: tenants,
        membership: userTenants,
        role: roles
      })
      .from(users)
      .leftJoin(userTenants, eq(users.id, userTenants.userId))
      .leftJoin(tenants, eq(userTenants.tenantId, tenants.id))
      .leftJoin(roles, eq(userTenants.roleId, roles.id))
      .where(whereClause)
      .limit(1);

    return row ?? null;
  }

  async getTenantsForUser(userId: string) {
    return this.db
      .select({
        tenant: tenants,
        membership: userTenants,
        role: roles
      })
      .from(userTenants)
      .leftJoin(tenants, eq(userTenants.tenantId, tenants.id))
      .leftJoin(roles, eq(userTenants.roleId, roles.id))
      .where(eq(userTenants.userId, userId));
  }

  async findUsersByTenant(tenantId: string, query: UserListQueryDto = {}) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    // Base filter - always filter by tenant
    const baseFilters: SQL[] = [eq(userTenants.tenantId, tenantId)];

    // Additional filters
    if (query.roleId) {
      baseFilters.push(eq(userTenants.roleId, query.roleId));
    }

    if (query.status) {
      baseFilters.push(eq(userTenants.status, query.status));
    }

    // Search filter
    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [users.name, users.email, users.phone],
        term: query.search
      });
    }

    // Combine all filters
    const allFilters = [...baseFilters];
    if (searchFilter) {
      allFilters.push(searchFilter);
    }

    // Build where clause from all filters
    let whereClause: SQL | undefined = undefined;
    if (allFilters.length > 0) {
      if (allFilters.length === 1) {
        whereClause = allFilters[0];
      } else {
        let combined = allFilters[0];
        for (let i = 1; i < allFilters.length; i += 1) {
          combined = and(combined, allFilters[i]) as SQL;
        }
        whereClause = combined;
      }
    }

    // Build sort order
    const allowedSortFields = {
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt
    };

    const orderBy = PaginationUtil.buildOrderBy(
      users.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    // Execute queries - return simplified user object
    const [results, totalRows] = await Promise.all([
      this.db
        .select({
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: roles.name,
          status: userTenants.status,
          joinedDate: userTenants.createdAt
        })
        .from(userTenants)
        .innerJoin(users, eq(userTenants.userId, users.id))
        .leftJoin(roles, eq(userTenants.roleId, roles.id))
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(userTenants)
        .innerJoin(users, eq(userTenants.userId, users.id))
        .where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;

    return PaginationUtil.buildPaginatedResult(results, total, page, limit);
  }

  async deleteUser(userId: string) {
    // Check if user exists
    const user = await this.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Prevent deletion of super admin users
    if (user.roleGlobal === 'super_admin') {
      throw new BadRequestException('Cannot delete super admin user');
    }

    // Delete user-tenant relationships
    await this.db.delete(userTenants).where(eq(userTenants.userId, userId));

    // Update leads: set assignedToUserId and createdByUserId to null
    await this.db
      .update(leads)
      .set({
        assignedToUserId: null,
        createdByUserId: null
      })
      .where(or(eq(leads.assignedToUserId, userId), eq(leads.createdByUserId, userId)));

    // Delete lead assignment agents
    await this.db.delete(leadAssignmentAgents).where(eq(leadAssignmentAgents.userId, userId));

    // Update lead assignment settings: set roundRobinPointerUserId to null if it matches
    await this.db
      .update(leadAssignmentSettings)
      .set({
        roundRobinPointerUserId: null
      })
      .where(eq(leadAssignmentSettings.roundRobinPointerUserId, userId));

    // Update lead assignment logs: set fromUserId and toUserId to null
    await this.db
      .update(leadAssignmentLogs)
      .set({
        fromUserId: null,
        toUserId: null
      })
      .where(or(eq(leadAssignmentLogs.fromUserId, userId), eq(leadAssignmentLogs.toUserId, userId)));

    // Finally, delete the user
    await this.db.delete(users).where(eq(users.id, userId));
  }
}

