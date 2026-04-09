import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import 'multer';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  leadStatuses,
  leadActivities,
  leads,
  tenants,
  userTenants,
  users
} from '../database/schema';
import {
  BulkLeadImportResultDto,
  CreateLeadDto,
  CreateLeadStatusDto,
  LeadAssignmentStrategy,
  LeadListQueryDto,
  LeadTransferDto,
  PublicLeadCaptureDto,
  ReorderLeadStatusesDto,
  UpdateLeadDto,
  UpdateLeadStatusDto
} from './leads.dto';
import { LeadAssignmentService } from './lead-assignment.service';
import { PhoneUtil } from '../common/utils/phone.util';
import { PaginationUtil } from '../common/utils/pagination.util';

type CreateLeadOptions = {
  createdByUserId?: string | null;
};

const DEFAULT_PIPELINE_STATUSES = [
  { name: 'New', slug: 'new', color: '#2563eb', isFinal: false },
  { name: 'Contacted', slug: 'contacted', color: '#7c3aed', isFinal: false },
  { name: 'Interested', slug: 'interested', color: '#16a34a', isFinal: false },
  { name: 'Site Visit Scheduled', slug: 'site_visit_scheduled', color: '#facc15', isFinal: false },
  { name: 'Site Visit Done', slug: 'site_visit_done', color: '#ea580c', isFinal: false },
  { name: 'Negotiation', slug: 'negotiation', color: '#0ea5e9', isFinal: false },
  { name: 'Booking Done', slug: 'booking_done', color: '#14b8a6', isFinal: true },
  { name: 'Not Interested', slug: 'not_interested', color: '#4b5563', isFinal: true }
] as const;

import { NotificationGateway } from '../notifications/notification.gateway';

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly assignmentService: LeadAssignmentService,
    private readonly notificationGateway: NotificationGateway
  ) { }

  async listLeads(tenantId: string, query: LeadListQueryDto) {
    await this.ensureLeadDefaults(tenantId);

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters: SQL[] = [eq(leads.tenantId, tenantId)];

    if (query.statusId) {
      baseFilters.push(eq(leads.statusId, query.statusId));
    }

    if (query.assignedToUserId) {
      baseFilters.push(eq(leads.assignedToUserId, query.assignedToUserId));
    }

    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [leads.name, leads.email, leads.phone],
        term: query.search
      });
    }

    const allFilters = [...baseFilters];
    if (searchFilter) {
      allFilters.push(searchFilter);
    }

    const whereClause = PaginationUtil.buildFilters(allFilters);

    const allowedSortFields = {
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      budget: leads.budget,
      propertyMatchScore: leads.propertyMatchScore
    };

    const orderBy = PaginationUtil.buildOrderBy(
      leads.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [results, totalRows] = await Promise.all([
      this.db
        .select({
          id: leads.id,
          name: leads.name,
          email: leads.email,
          phone: leads.phone,
          status: leadStatuses.name,
          createdAt: leads.createdAt,
          assignedTo: users.name,
          propertyMatchScore: leads.propertyMatchScore,
          leadScore: leads.leadScore,
          leadLabel: leads.leadLabel
        })
        .from(leads)
        .leftJoin(leadStatuses, eq(leads.statusId, leadStatuses.id))
        .leftJoin(users, eq(leads.assignedToUserId, users.id))
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;

    const mappedResults = results.map((row) => ({
      id: row.id,
      name: row.name ?? '',
      email: row.email ?? null,
      phone: row.phone ?? null,
      status: row.status ?? null,
      created: row.createdAt,
      assignedTo: row.assignedTo ?? null,
      propertyMatchScore: row.propertyMatchScore ?? 0,
      leadScore: row.leadScore ?? 0,
      leadLabel: row.leadLabel ?? null
    }));

    return PaginationUtil.buildPaginatedResult(mappedResults, total, page, limit);
  }

  async getLead(tenantId: string, leadId: string) {
    await this.ensureLeadDefaults(tenantId);
    const [row] = await this.db
      .select({
        lead: leads,
        status: leadStatuses,
        assignee: {
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone
        }
      })
      .from(leads)
      .leftJoin(leadStatuses, eq(leads.statusId, leadStatuses.id))
      .leftJoin(users, eq(leads.assignedToUserId, users.id))
      .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Lead not found');
    }

    return row;
  }

  async createLead(tenantId: string, dto: CreateLeadDto, options?: CreateLeadOptions) {
    await this.ensureLeadDefaults(tenantId);
    const statusId = await this.resolveStatusId(tenantId, dto.statusId);

    const id = randomUUID();
    const now = new Date();

    let assignedToUserId = dto.assignedToUserId ? await this.resolveAssignee(tenantId, dto.assignedToUserId) : null;
    let chosenStrategy: LeadAssignmentStrategy | null = null;
    let score = 0;
    let label: string | null = null;

    const shouldAutoAssign = dto.autoAssign ?? true;

    if (!assignedToUserId && shouldAutoAssign) {
      const autoResult = await this.assignmentService.autoAssignLead(tenantId, {
        requirementType: dto.requirementType,
        propertyCategory: dto.propertyCategory,
        propertyType: dto.propertyType,
        locationPreference: dto.locationPreference,
        leadSource: dto.leadSource,
        budget: dto.budget,
        createdAt: now
      });
      assignedToUserId = autoResult.userId;
      chosenStrategy = autoResult.strategy;
      score = autoResult.score;
      label = autoResult.label;
    }

    await this.db.insert(leads).values({
      id,
      tenantId,
      statusId,
      name: dto.name,
      phone: PhoneUtil.normalize(dto.phone) ?? null,
      email: dto.email ?? null,
      budget: this.serializeBudget(dto.budget),
      requirementType: dto.requirementType,
      propertyType: dto.propertyType ?? null,
      propertyCategory: dto.propertyCategory ?? null,
      bhkType: dto.bhkType ?? null,
      locationPreference: dto.locationPreference ?? null,
      propertyMatchScore: dto.propertyMatchScore ?? 0,
      leadScore: score,
      leadLabel: label,
      leadSource: dto.leadSource ?? 'website',
      captureChannel: dto.captureChannel ?? null,
      notes: dto.notes ?? null,
      metadata: dto.metadata ?? null,
      assignedToUserId,
      createdByUserId: options?.createdByUserId ?? null,
      kanbanPosition: now.getTime(),
      createdAt: now,
      updatedAt: now
    });

    if (assignedToUserId) {
      await this.assignmentService.recordAssignmentLog(
        tenantId,
        id,
        null,
        assignedToUserId,
        chosenStrategy,
        chosenStrategy ? 'auto_assign' : 'manual_assign',
        {
          requirementType: dto.requirementType,
          propertyCategory: dto.propertyCategory ?? null,
          locationPreference: dto.locationPreference ?? null
        }
      );
    }

    this.notificationGateway.sendNotificationToTenant(tenantId, 'lead_captured', {
      id,
      name: dto.name,
      leadSource: dto.leadSource ?? 'website',
      phone: dto.phone
    });

    return this.getLead(tenantId, id);
  }

  async updateLead(tenantId: string, leadId: string, dto: UpdateLeadDto) {
    const existing = await this.getLead(tenantId, leadId);
    const updateData: Partial<typeof leads.$inferInsert> = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.phone !== undefined) updateData.phone = PhoneUtil.normalize(dto.phone);
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.budget !== undefined) updateData.budget = this.serializeBudget(dto.budget);
    if (dto.requirementType !== undefined) updateData.requirementType = dto.requirementType;
    if (dto.propertyType !== undefined) updateData.propertyType = dto.propertyType;
    if (dto.propertyCategory !== undefined) updateData.propertyCategory = dto.propertyCategory;
    if (dto.bhkType !== undefined) updateData.bhkType = dto.bhkType;
    if (dto.locationPreference !== undefined) {
      updateData.locationPreference = dto.locationPreference;
    }
    if (dto.propertyMatchScore !== undefined) updateData.propertyMatchScore = dto.propertyMatchScore;
    if (dto.leadSource !== undefined) updateData.leadSource = dto.leadSource;
    if (dto.captureChannel !== undefined) updateData.captureChannel = dto.captureChannel;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata;

    if (dto.statusId) {
      updateData.statusId = await this.resolveStatusId(tenantId, dto.statusId);
    }

    if (dto.assignedToUserId !== undefined) {
      updateData.assignedToUserId = dto.assignedToUserId
        ? await this.resolveAssignee(tenantId, dto.assignedToUserId)
        : null;
    }

    if (Object.keys(updateData).length === 0) {
      return existing;
    }

    updateData.updatedAt = new Date();
    await this.db.update(leads).set(updateData).where(eq(leads.id, leadId));

    if (dto.assignedToUserId && dto.assignedToUserId !== existing.lead.assignedToUserId) {
      await this.assignmentService.recordAssignmentLog(
        tenantId,
        leadId,
        existing.lead.assignedToUserId ?? null,
        dto.assignedToUserId,
        null,
        'manual_transfer'
      );
    }

    return this.getLead(tenantId, leadId);
  }

  async updateLeadStatus(tenantId: string, leadId: string, dto: UpdateLeadStatusDto) {
    await this.ensureLeadDefaults(tenantId);
    const statusId = await this.resolveStatusId(tenantId, dto.statusId);
    const now = new Date();

    const [existing] = await this.db
      .select({ statusId: leads.statusId })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Lead not found');
    }

    const updateData: Partial<typeof leads.$inferInsert> = {
      statusId,
      updatedAt: now
    };
    if (dto.kanbanPosition !== undefined) {
      updateData.kanbanPosition = dto.kanbanPosition;
    }

    await this.db.transaction(async (tx) => {
      await tx.update(leads).set(updateData).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));

      if (existing.statusId !== statusId) {
        await tx.insert(leadActivities).values({
          id: randomUUID(),
          tenantId,
          leadId,
          type: 'status_change',
          title: 'Pipeline stage changed',
          note: null,
          metadata: {
            fromStatusId: existing.statusId,
            toStatusId: statusId
          },
          happenedAt: now,
          nextFollowUpAt: null,
          createdByUserId: null,
          createdAt: now
        });
      }
    });

    return this.getLead(tenantId, leadId);
  }

  async transferLead(tenantId: string, leadId: string, dto: LeadTransferDto) {
    const existing = await this.getLead(tenantId, leadId);
    const newAssignee = await this.resolveAssignee(tenantId, dto.targetUserId);

    await this.db
      .update(leads)
      .set({ assignedToUserId: newAssignee, updatedAt: new Date() })
      .where(eq(leads.id, leadId));

    await this.assignmentService.recordAssignmentLog(
      tenantId,
      leadId,
      existing.lead.assignedToUserId ?? null,
      newAssignee,
      null,
      dto.reason ?? 'manual_transfer'
    );

    return this.getLead(tenantId, leadId);
  }

  async getPipeline(tenantId: string) {
    await this.ensureLeadDefaults(tenantId);
    const [statuses, counts] = await Promise.all([
      this.db
        .select()
        .from(leadStatuses)
        .where(eq(leadStatuses.tenantId, tenantId))
        .orderBy(leadStatuses.order),
      this.db
        .select({
          statusId: leads.statusId,
          total: sql<number>`count(*)`
        })
        .from(leads)
        .where(eq(leads.tenantId, tenantId))
        .groupBy(leads.statusId)
    ]);

    const countMap = counts.reduce((acc, row) => {
      acc.set(row.statusId, Number(row.total));
      return acc;
    }, new Map<string, number>());

    return statuses.map((status) => ({
      ...status,
      totalLeads: countMap.get(status.id) ?? 0
    }));
  }

  async createPipelineStatus(tenantId: string, dto: CreateLeadStatusDto) {
    await this.ensureLeadDefaults(tenantId);
    const [existing] = await this.db
      .select()
      .from(leadStatuses)
      .where(and(eq(leadStatuses.tenantId, tenantId), eq(leadStatuses.slug, dto.slug)))
      .limit(1);

    if (existing) {
      throw new BadRequestException('Status slug already exists in this tenant');
    }

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(leadStatuses)
      .where(eq(leadStatuses.tenantId, tenantId));

    const id = randomUUID();
    const now = new Date();
    await this.db.insert(leadStatuses).values({
      id,
      tenantId,
      name: dto.name,
      slug: dto.slug,
      color: dto.color ?? null,
      isFinal: dto.isFinal ?? false,
      isDefault: false,
      order: Number(count) ?? 0,
      createdAt: now,
      updatedAt: now
    });

    return this.getPipeline(tenantId);
  }

  async reorderPipeline(tenantId: string, dto: ReorderLeadStatusesDto) {
    await this.ensureLeadDefaults(tenantId);
    await this.db.transaction(async (tx) => {
      await Promise.all(
        dto.statusIds.map((statusId, index) =>
          tx
            .update(leadStatuses)
            .set({ order: index, updatedAt: new Date() })
            .where(and(eq(leadStatuses.id, statusId), eq(leadStatuses.tenantId, tenantId)))
        )
      );
    });

    return this.getPipeline(tenantId);
  }

  async importLeads(tenantId: string, file: Express.Multer.File, createdByUserId?: string | null) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File buffer is empty');
    }

    await this.ensureLeadDefaults(tenantId);
    let XLSX: typeof import('xlsx');
    try {
      XLSX = await import('xlsx');
    } catch (error) {
      throw new InternalServerErrorException('Spreadsheet parser is not installed. Please run npm install xlsx.');
    }
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Unable to read spreadsheet');
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
      defval: null
    });

    const summary: BulkLeadImportResultDto = {
      total: rows.length,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      try {
        const normalized = this.normalizeImportedRow(rows[i]);
        if (!normalized) {
          summary.skipped += 1;
          continue;
        }
        await this.createLead(
          tenantId,
          { ...normalized, autoAssign: true },
          { createdByUserId: createdByUserId ?? null }
        );
        summary.created += 1;
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({
          row: rowNumber,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return summary;
  }

  async captureLeadFromPublicChannel(tenantSlug: string, apiKey: string | null, dto: PublicLeadCaptureDto) {
    try {
      // Validate tenant slug
      const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);
      if (!tenant) {
        throw new NotFoundException(`Tenant with slug "${tenantSlug}" not found. Please check the tenant slug.`);
      }

      if (tenant.status !== 'active') {
        throw new ForbiddenException(`Tenant "${tenantSlug}" is not active. Status: ${tenant.status}`);
      }

      // Get or create settings (this will auto-generate API key if it doesn't exist)
      const settings = await this.assignmentService.ensureSettings(tenant.id);

      // Validate API key
      if (!apiKey) {
        throw new ForbiddenException(
          'API key is required. Include it in the "x-lead-api-key" header. ' +
          `Get your API key from: GET /tenants/${tenant.id}/leads/assignment/settings (requires authentication)`
        );
      }

      if (!settings.publicApiKey) {
        throw new InternalServerErrorException(
          'Public API key is not configured. Please contact support or check assignment settings.'
        );
      }

      if (apiKey !== settings.publicApiKey) {
        throw new ForbiddenException(
          'Invalid API key. The provided key does not match your tenant\'s configured key. ' +
          'If you rotated the key, use the new key. ' +
          `Get current key from: GET /tenants/${tenant.id}/leads/assignment/settings`
        );
      }

      // Create lead payload
      const originalSource = dto.leadSource || (dto as any).source;
      const normalizedSource = this.normalizeSource(originalSource) || 'website';
      
      const payload: CreateLeadDto = {
        ...dto,
        leadSource: normalizedSource,
        captureChannel: 'public_api',
        autoAssign: true,
        metadata: {
          ...dto.metadata,
          ...(originalSource && originalSource.toLowerCase() !== normalizedSource ? { original_source: originalSource } : {})
        }
      };

      return await this.createLead(tenant.id, payload, { createdByUserId: null });
    } catch (error) {
      // Re-throw known exceptions as-is
      if (error instanceof NotFoundException || error instanceof ForbiddenException || error instanceof BadRequestException) {
        throw error;
      }

      // Log unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[Lead Capture Error]', {
        tenantSlug,
        hasApiKey: !!apiKey,
        error: errorMessage,
        stack: errorStack
      });

      throw new InternalServerErrorException(
        `Failed to capture lead: ${errorMessage}. Please check server logs for details.`
      );
    }
  }

  private async ensureLeadDefaults(tenantId: string) {
    await this.assignmentService.ensureSettings(tenantId);
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(leadStatuses)
      .where(eq(leadStatuses.tenantId, tenantId));

    const count = countResult.length > 0 ? Number(countResult[0].count) : 0;

    if (count > 0) {
      return;
    }

    const now = new Date();
    try {
      await this.db.insert(leadStatuses).values(
        DEFAULT_PIPELINE_STATUSES.map((status, index) => ({
          id: randomUUID(),
          tenantId,
          name: status.name,
          slug: status.slug,
          color: status.color,
          isFinal: status.isFinal,
          isDefault: index === 0,
          order: index,
          createdAt: now,
          updatedAt: now
        }))
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to initialize lead pipeline: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async resolveStatusId(tenantId: string, statusId?: string) {
    if (statusId) {
      const [status] = await this.db
        .select()
        .from(leadStatuses)
        .where(and(eq(leadStatuses.tenantId, tenantId), eq(leadStatuses.id, statusId)))
        .limit(1);
      if (!status) {
        throw new BadRequestException(`Lead status with ID "${statusId}" not found for this tenant`);
      }
      return status.id;
    }

    const statuses = await this.db
      .select()
      .from(leadStatuses)
      .where(eq(leadStatuses.tenantId, tenantId))
      .orderBy(leadStatuses.order)
      .limit(1);

    if (statuses.length === 0) {
      throw new InternalServerErrorException(
        'Lead pipeline is not configured. Please ensure default statuses are created.'
      );
    }

    return statuses[0].id;
  }

  private async resolveAssignee(tenantId: string, userId: string) {
    const [membership] = await this.db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.tenantId, tenantId), eq(userTenants.userId, userId)))
      .limit(1);

    if (!membership || membership.status !== 'active') {
      throw new BadRequestException('Assignee must be an active member of this tenant');
    }

    return userId;
  }

  private normalizeImportedRow(
    row: Record<string, unknown>
  ): (Pick<CreateLeadDto, 'name' | 'requirementType'> & Partial<CreateLeadDto>) | null {
    const mapKey = (key: string) => key.trim().toLowerCase();
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      normalized[mapKey(key)] = row[key];
    }

    const name = this.cleanString(normalized['name'] ?? normalized['lead name']);
    const requirementType = this.cleanString(normalized['requirement'] ?? normalized['requirement_type'] ?? 'buy');

    if (!name) {
      return null;
    }

    const requirement =
      requirementType && ['buy', 'rent', 'investment'].includes(requirementType.toLowerCase())
        ? (requirementType.toLowerCase() as CreateLeadDto['requirementType'])
        : 'buy';

    const propertyMatchScore = normalized['match_score'] ?? normalized['property_match_score'];
    const parsedMatchScore =
      typeof propertyMatchScore === 'number'
        ? propertyMatchScore
        : propertyMatchScore
          ? Number(propertyMatchScore)
          : undefined;

    const result: Pick<CreateLeadDto, 'name' | 'requirementType'> & Partial<CreateLeadDto> = {
      name,
      requirementType: requirement,
      phone: PhoneUtil.normalize(this.cleanString(normalized['phone'] ?? normalized['mobile'])) ?? undefined,
      email: this.cleanString(normalized['email']),
      budget: this.parseNumber(normalized['budget']),
      propertyType: this.cleanString(normalized['property_type'] ?? normalized['bhk']),
      propertyCategory: this.cleanString(normalized['property_category']),
      bhkType: this.cleanString(normalized['bhk']),
      locationPreference: this.cleanString(normalized['location'] ?? normalized['location_preference']),
      propertyMatchScore: parsedMatchScore !== undefined ? Math.min(Math.max(parsedMatchScore, 0), 100) : undefined,
      leadSource: this.normalizeSource(this.cleanString(normalized['lead_source'] ?? normalized['source'])),
      notes: this.cleanString(normalized['notes'])
    };

    return result;
  }

  private cleanString(value: unknown) {
    if (typeof value !== 'string') {
      return value === null || value === undefined ? undefined : String(value);
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }

  private parseNumber(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private normalizeSource(source?: string) {
    if (!source) {
      return undefined;
    }
    const normalized = source.toLowerCase();
    const allowed = ['facebook', 'google', 'referral', 'website', 'walk_in', 'other'];
    if (allowed.includes(normalized)) {
      return normalized as CreateLeadDto['leadSource'];
    }
    return 'other';
  }

  private serializeBudget(value?: number | null) {
    if (value === undefined || value === null) {
      return null;
    }
    return value.toString();
  }
}


