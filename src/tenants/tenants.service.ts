import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { tenants, userTenants } from '../database/schema';
import { CreateTenantDto, UpdateTenantDto } from './tenants.dto';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class TenantsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService
  ) { }

  async create(dto: CreateTenantDto) {
    const existingTenant = await this.findBySlug(dto.slug);
    if (existingTenant) {
      throw new BadRequestException('Tenant with this slug already exists');
    }

    // Check if user with this email already exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    const id = randomUUID();
    await this.db.insert(tenants).values({
      id,
      name: dto.name,
      slug: dto.slug,
      plan: dto.plan ?? null,
      status: dto.status ?? 'active'
    });

    // Create default Admin role for the tenant
    const adminRole = await this.rolesService.create(id, {
      name: 'Admin',
      isAdmin: true,
      permissions: []
    });

    if (!adminRole) {
      throw new Error('Failed to create admin role');
    }

    // Create the default admin user
    const adminUser = await this.usersService.createUser({
      email: dto.email,
      password: dto.password,
      name: dto.name + ' Admin',
      roleGlobal: 'normal'
    });

    // Link the user to the tenant with the admin role
    const membershipId = randomUUID();
    await this.db.insert(userTenants).values({
      id: membershipId,
      userId: adminUser.id,
      tenantId: id,
      roleId: adminRole.id,
      status: 'active'
    });

    return this.findById(id);
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const updateData: Partial<typeof tenants.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.plan !== undefined) updateData.plan = dto.plan;
    if (dto.status !== undefined) updateData.status = dto.status;

    await this.db.update(tenants).set(updateData).where(eq(tenants.id, id));

    return this.findById(id);
  }

  async findById(id: string) {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return tenant ?? null;
  }

  async findBySlug(slug: string) {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    return tenant ?? null;
  }

  async findAll() {
    return this.db.select().from(tenants);
  }
}

