import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { tenants, userTenants, leads, siteVisits, leadActivities, leadStatuses } from '../database/schema';
import { and } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { CreateTenantDto, UpdateTenantDto, TenantListQueryDto } from './tenants.dto';
import { PaginationUtil } from '../common/utils/pagination.util';
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
      logo: dto.logo ?? null,
      description: dto.description ?? null,
      primaryColor: dto.primaryColor ?? null,
      secondaryColor: dto.secondaryColor ?? null,
      contactEmail: dto.contactEmail ?? null,
      contactPhone: dto.contactPhone ?? null,
      address: dto.address ?? null,
      socialLinks: dto.socialLinks ?? null,
      websiteConfig: dto.websiteConfig ?? null,
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
    if (dto.logo !== undefined) updateData.logo = dto.logo;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.primaryColor !== undefined) updateData.primaryColor = dto.primaryColor;
    if (dto.secondaryColor !== undefined) updateData.secondaryColor = dto.secondaryColor;
    if (dto.contactEmail !== undefined) updateData.contactEmail = dto.contactEmail;
    if (dto.contactPhone !== undefined) updateData.contactPhone = dto.contactPhone;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.socialLinks !== undefined) updateData.socialLinks = dto.socialLinks;
    if (dto.websiteConfig !== undefined) updateData.websiteConfig = dto.websiteConfig;

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

  async findAll(query: TenantListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters: SQL[] = [];

    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [tenants.name, tenants.slug],
        term: query.search
      });
    }

    const allFilters = [...baseFilters];
    if (searchFilter) allFilters.push(searchFilter);

    const whereClause = PaginationUtil.buildFilters(allFilters);

    const allowedSortFields = {
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      status: tenants.status,
      createdAt: tenants.createdAt
    };

    const orderBy = PaginationUtil.buildOrderBy(
      tenants.createdAt,
      query.sortBy,
      query.sortOrder || 'asc',
      allowedSortFields
    );

    const [results, totalRows] = await Promise.all([
      this.db
        .select()
        .from(tenants)
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(tenants).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(results, total, page, limit);
  }

  async getPublicProspects(tenantId: string) {
    return await this.db
      .select({
        id: leads.id,
        name: leads.name,
        budget: leads.budget,
        propertyType: leads.propertyType,
        locationPreference: leads.locationPreference,
        bhkType: leads.bhkType,
      })
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .orderBy(desc(leads.createdAt))
      .limit(50);
  }

  /**
   * Create a site visit record directly from the public portal — no auth required.
   * Inserts the visit + a lead-timeline activity, and moves the lead status to
   * "site_visit_scheduled" if that status exists for the tenant.
   */
  async publicCreateSiteVisit(
    tenantId: string,
    dto: { leadId: string; propertyId?: string; visitDate: string; notes?: string }
  ) {
    const id  = randomUUID();
    const now = new Date();

    await this.db.transaction(async (tx) => {
      // 1. Insert site visit
      await tx.insert(siteVisits).values({
        id,
        tenantId,
        leadId:     dto.leadId,
        propertyId: dto.propertyId ?? null,
        visitDate:  new Date(dto.visitDate),
        notes:      dto.notes ?? null,
        status:     'scheduled',
        createdAt:  now,
        updatedAt:  now,
      });

      // 2. Add lead timeline activity
      await tx.insert(leadActivities).values({
        id:               randomUUID(),
        tenantId,
        leadId:           dto.leadId,
        type:             'meeting',
        title:            'Site Visit Requested',
        note:             dto.notes || 'Site visit requested via agent portal.',
        metadata:         { siteVisitId: id, visitDate: dto.visitDate, source: 'agent_portal' },
        happenedAt:       now,
        createdByUserId:  null,
        createdAt:        now,
      });

      // 3. Advance lead status to "site_visit_scheduled" if it exists
      const [statusRow] = await tx
        .select({ id: leadStatuses.id })
        .from(leadStatuses)
        .where(and(
          eq(leadStatuses.tenantId, tenantId),
          eq(leadStatuses.slug, 'site_visit_scheduled'),
        ))
        .limit(1);

      if (statusRow) {
        await tx.update(leads)
          .set({ statusId: statusRow.id, updatedAt: now })
          .where(and(eq(leads.id, dto.leadId), eq(leads.tenantId, tenantId)));
      }
    });

    return { id, visitDate: dto.visitDate };
  }
}

