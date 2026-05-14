import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, ilike, or, sql, count } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import 'multer';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  leadStatuses,
  leadActivities,
  leadTasks,
  leads,
  tenants,
  users,
  userTenants,
  roles,
  siteVisits,
  propertyEntities,
  propertyLocations
} from '../database/schema';
import { MailService } from '../common/services/mail.service';
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
import { AiQualificationService, LeadQualificationInput } from './ai-qualification.service';
import { AutomationService } from '../automation/automation.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AUDIT_ACTIONS } from '../audit-logs/audit-actions.constants';
import { RequestContextService } from '../common/utils/request-context.service';

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
  private readonly logger = new Logger(LeadsService.name);
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly assignmentService: LeadAssignmentService,
    private readonly notificationGateway: NotificationGateway,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly aiQualificationService: AiQualificationService,
    private readonly automationService: AutomationService,
    private readonly auditLogsService: AuditLogsService,
    private readonly requestContext: RequestContextService,
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
          leadLabel: leads.leadLabel,
          aiQualification: leads.aiQualification
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
      leadLabel: row.leadLabel ?? null,
      aiQualification: row.aiQualification ?? null
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

    // 1. Check for duplicate lead (same phone or email in this tenant)
    const existingLead = await this.checkForDuplicate(tenantId, dto.phone, dto.email);
    if (existingLead) {
      return this.handleDuplicateLead(tenantId, existingLead.id, dto, options);
    }

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
      aiQualification: null,
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

    // Audit log — fire-and-forget
    this.auditLogsService.log(
      tenantId, AUDIT_ACTIONS.LEAD_CREATED, 'lead', id,
      { name: dto.name, phone: dto.phone, email: dto.email, leadSource: dto.leadSource },
      this.requestContext.getUserId(),
    ).catch(() => {});

    // Fire-and-forget AI qualification in the background
    this.qualifyLeadWithAi(tenantId, id).catch((err) => {
      this.logger.error('[AI Qualification Background Failed]', err);
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

    // Fire automation event (fire-and-forget)
    this.automationService.fireEvent(tenantId, 'lead_created', { leadId: id }).catch((err) => {
      this.logger.error('[Automation] lead_created event failed', err);
    });

    // Send Email Notifications (Background process)
    this.sendLeadCaptureEmails(tenantId, id, dto, assignedToUserId).catch((err) => {
      console.error('[Email Notification Failed]', err);
    });

    return this.getLead(tenantId, id);
  }

  private async sendLeadCaptureEmails(
    tenantId: string,
    leadId: string,
    dto: CreateLeadDto,
    assignedToUserId: string | null,
    isRecapture: boolean = false
  ) {
    try {
      // 1. Fetch Tenant Name
      const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const organization = tenant?.name || 'Your Company';
      const frontendUrl = this.configService.get<string>('mail.frontendUrl', 'https://softaro-crm.vercel.app');
      const dashboardUrl = `${frontendUrl}/leads/${leadId}`;

      // 2. Fetch Assignee Email
      let assignee: { name: string; email: string } | null = null;
      if (assignedToUserId) {
        const [user] = await this.db.select().from(users).where(eq(users.id, assignedToUserId)).limit(1);
        if (user) {
          assignee = { name: user.name, email: user.email };
        }
      }

      // 3. Fetch Tenant Admins
      const tenantAdmins = await this.db
        .select({
          name: users.name,
          email: users.email
        })
        .from(userTenants)
        .innerJoin(users, eq(userTenants.userId, users.id))
        .innerJoin(roles, eq(userTenants.roleId, roles.id))
        .where(
          and(
            eq(userTenants.tenantId, tenantId),
            eq(userTenants.status, 'active'),
            eq(roles.isAdmin, true)
          )
        );

      const emailData = {
        leadName: dto.name,
        leadEmail: dto.email,
        leadPhone: dto.phone,
        leadSource: dto.leadSource || 'website',
        requirementType: dto.requirementType,
        notes: dto.notes,
        dashboardUrl,
        organization,
        isRecapture
      };

      // 4. Send to Assignee
      if (assignee) {
        await this.mailService.sendLeadNotification(assignee.email, {
          ...emailData,
          recipientName: assignee.name,
          isAssignee: true,
          isRecapture
        });
      }

      // 5. Send to Admins (Exclude assignee if they are also an admin to avoid double emails)
      for (const admin of tenantAdmins) {
        if (assignee && admin.email === assignee.email) continue;
        
        await this.mailService.sendLeadNotification(admin.email, {
          ...emailData,
          recipientName: admin.name,
          isAssignee: false,
          isRecapture
        });
      }
    } catch (error) {
      console.error('[sendLeadCaptureEmails Error]', error);
    }
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

    // Build proper before/after diff — only the fields that actually changed
    const changedKeys = Object.keys(updateData).filter(k => k !== 'updatedAt');
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of changedKeys) {
      before[key] = (existing.lead as Record<string, unknown>)[key] ?? null;
      after[key]  = (updateData as Record<string, unknown>)[key] ?? null;
    }

    await this.db.update(leads).set(updateData).where(eq(leads.id, leadId));

    // Audit log — proper diff, not full payload dump
    this.auditLogsService.log(
      tenantId, AUDIT_ACTIONS.LEAD_UPDATED, 'lead', leadId,
      { before, after },
    ).catch(() => {});

    // Re-qualify with AI if key fields changed
    const qualificationFields = ['budget', 'requirementType', 'propertyType', 'propertyCategory', 'bhkType', 'locationPreference', 'notes'];
    const shouldRequalify = Object.keys(updateData).some(key => qualificationFields.includes(key));
    
    if (shouldRequalify) {
      // Run qualification in background to avoid delaying the response
      this.qualifyLeadWithAi(tenantId, leadId).catch(err => {
        console.error('[AI Re-qualification Failed]', err);
      });
    }

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
        // Audit log
        this.auditLogsService.log(
          tenantId, AUDIT_ACTIONS.LEAD_STATUS_CHANGED, 'lead', leadId,
          { fromStatusId: existing.statusId, toStatusId: statusId },
          this.requestContext.getUserId(),
        ).catch(() => {});

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

        // Fire automation event for status change (fire-and-forget)
        this.automationService.fireEvent(tenantId, 'lead_status_changed', {
          leadId,
          metadata: { fromStatusId: existing.statusId, toStatusId: statusId }
        }).catch((err) => {
          this.logger.error('[Automation] lead_status_changed event failed', err);
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

    this.auditLogsService.log(
      tenantId, AUDIT_ACTIONS.LEAD_TRANSFERRED, 'lead', leadId,
      { fromUserId: existing.lead.assignedToUserId, toUserId: newAssignee, reason: dto.reason },
      this.requestContext.getUserId(),
    ).catch(() => {});

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

  private async checkForDuplicate(tenantId: string, phone?: string, email?: string) {
    const normalizedPhone = PhoneUtil.normalize(phone);
    if (!normalizedPhone && !email) return null;

    const orConditions: SQL[] = [];
    if (normalizedPhone) orConditions.push(eq(leads.phone, normalizedPhone));
    if (email) orConditions.push(eq(leads.email, email));

    const [existing] = await this.db
      .select()
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), or(...orConditions)))
      .limit(1);

    return existing || null;
  }

  private async handleDuplicateLead(
    tenantId: string,
    leadId: string,
    dto: CreateLeadDto,
    options?: CreateLeadOptions
  ) {
    const existing = await this.getLead(tenantId, leadId);
    const now = new Date();
    const updateData: Partial<typeof leads.$inferInsert> = {
      updatedAt: now
    };

    // 1. Differentiate and Merge Notes
    let newNotes = existing.lead.notes || '';
    if (dto.notes) {
      const timestamp = now.toLocaleDateString();
      const sourceInfo = dto.leadSource || (dto as any).source || 'external form';
      const formattedNote = `\n[${timestamp} Re-captured via ${sourceInfo}]: ${dto.notes}`;
      newNotes = (newNotes + formattedNote).substring(0, 1000);
      updateData.notes = newNotes;
    }

    // 2. Update empty or better data
    if (!existing.lead.phone && dto.phone) updateData.phone = PhoneUtil.normalize(dto.phone);
    if (!existing.lead.email && dto.email) updateData.email = dto.email;
    if (dto.requirementType) updateData.requirementType = dto.requirementType;
    if (dto.propertyType) updateData.propertyType = dto.propertyType;
    if (dto.propertyCategory) updateData.propertyCategory = dto.propertyCategory;
    if (dto.bhkType) updateData.bhkType = dto.bhkType;
    if (dto.locationPreference) updateData.locationPreference = dto.locationPreference;
    
    if (dto.propertyMatchScore && (dto.propertyMatchScore > (existing.lead.propertyMatchScore || 0))) {
      updateData.propertyMatchScore = dto.propertyMatchScore;
    }
    if (dto.budget && (!existing.lead.budget || Number(dto.budget) > Number(existing.lead.budget))) {
      updateData.budget = this.serializeBudget(dto.budget);
    }

    // 3. Merge Metadata properly
    const mergedMetadata = {
      ...(existing.lead.metadata as object || {}),
      ...(dto.metadata || {}),
      last_recapture_at: now.toISOString(),
      last_recapture_source: dto.leadSource || (dto as any).source || 'website'
    };
    updateData.metadata = mergedMetadata;

    // 4. Activity Logs for re-capture
    await this.db.insert(leadActivities).values({
      id: randomUUID(),
      tenantId,
      leadId: existing.lead.id,
      type: 'note',
      title: `Re-captured via ${dto.leadSource || (dto as any).source || 'external source'}`,
      note: dto.notes || 'No new notes provided during re-capture.',
      metadata: { 
        isRecapture: true, 
        newRequirement: dto.requirementType,
        newPropertyType: dto.propertyType
      },
      happenedAt: now,
      createdAt: now
    });

    // 5. Reactivate if in final status
    const [statusObj] = await this.db.select().from(leadStatuses).where(eq(leadStatuses.id, existing.lead.statusId)).limit(1);
    
    if (statusObj?.isFinal) {
      const defaultStatusId = await this.resolveStatusId(tenantId);
      updateData.statusId = defaultStatusId;
      
      // Log status change activity
      await this.db.insert(leadActivities).values({
        id: randomUUID(),
        tenantId,
        leadId: existing.lead.id,
        type: 'status_change',
        title: 'Lead reactivated via re-capture',
        note: `Moved from ${statusObj.name} to New`,
        metadata: { fromStatusId: statusObj.id, toStatusId: defaultStatusId },
        happenedAt: now,
        createdAt: now
      });
    }

    await this.db.update(leads).set(updateData).where(eq(leads.id, leadId));

    // 5. Notify the existing assignee if present
    if (existing.lead.assignedToUserId) {
      this.notificationGateway.sendNotificationToUser(existing.lead.assignedToUserId, 'lead_recaptured', {
        id: leadId,
        name: existing.lead.name,
        changes: Object.keys(updateData)
      });
    }

    // Trigger emails for re-capture as well
    this.sendLeadCaptureEmails(tenantId, leadId, dto, existing.lead.assignedToUserId, true).catch((err) => {
      this.logger.error('[Recapture Email Notification Failed]', err);
    });

    // Re-qualify with AI on re-capture
    this.qualifyLeadWithAi(tenantId, leadId).catch((err) => {
      this.logger.error('[AI Re-qualification Background Failed on Duplicate]', err);
    });

    return this.getLead(tenantId, leadId);
  }

  async qualifyLeadWithAi(tenantId: string, leadId: string) {
    const lead = await this.getLead(tenantId, leadId);

    // Fetch robust scoring signals
    const [visitCountResult] = await this.db
      .select({ val: count() })
      .from(siteVisits)
      .where(and(eq(siteVisits.leadId, leadId), eq(siteVisits.status, 'completed')));
    
    const [activityCountResult] = await this.db
      .select({ val: count() })
      .from(leadActivities)
      .where(eq(leadActivities.leadId, leadId));

    // Fetch available properties for AI matching
    const availableProperties = await this.db
      .select({
        id: propertyEntities.id,
        name: propertyEntities.name,
        type: propertyEntities.entityType,
        reraNumber: propertyEntities.reraNumber,
        location: propertyLocations.area,
      })
      .from(propertyEntities)
      .leftJoin(propertyLocations, eq(propertyEntities.id, propertyLocations.entityId))
      .where(eq(propertyEntities.status, 'active'))
      .limit(15); // Limit to top 15 projects to keep prompt concise

    const dto: LeadQualificationInput = {
      name: lead.lead.name,
      phone: lead.lead.phone ?? '',
      email: lead.lead.email ?? undefined,
      budget: lead.lead.budget ? Number(lead.lead.budget) : undefined,
      requirementType: lead.lead.requirementType,
      propertyType: lead.lead.propertyType ?? undefined,
      propertyCategory: lead.lead.propertyCategory ?? undefined,
      bhkType: lead.lead.bhkType ?? undefined,
      locationPreference: lead.lead.locationPreference as any,
      notes: lead.lead.notes ?? undefined,
      leadSource: lead.lead.leadSource,
      siteVisitCount: Number(visitCountResult?.val || 0),
      followUpCount: Number(activityCountResult?.val || 0),
      timeline: (lead.lead.metadata as any)?.timeline || 'exploring',
      availableProperties: availableProperties.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        reraNumber: p.reraNumber ?? undefined,
        location: p.location ?? undefined
      }))
    };

    const aiResult = await this.aiQualificationService.qualifyLead(dto);
    if (!aiResult) {
      throw new InternalServerErrorException('AI qualification failed');
    }

    await this.db.update(leads).set({
      leadScore: aiResult?.finalScore ?? aiResult?.score ?? 0,
      leadLabel: aiResult?.label ?? 'cold',
      propertyMatchScore: aiResult?.propertyMatchScore ?? lead.lead.propertyMatchScore ?? 0,
      aiQualification: aiResult,
      updatedAt: new Date()
    }).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));

    this.auditLogsService.log(
      tenantId, AUDIT_ACTIONS.LEAD_AI_QUALIFIED, 'lead', leadId,
      { score: aiResult.finalScore, label: aiResult.label, model: aiResult.modelUsed },
      'system', // AI-triggered, not a human action
    ).catch(() => {});

    // Auto-create a follow-up task from AI suggested action (hot or warm leads only)
    if (aiResult.suggestedNextAction && (aiResult.label === 'hot' || aiResult.label === 'warm')) {
      const dueAt = new Date();
      // Hot leads: follow up within 2h, warm: within 24h
      dueAt.setHours(dueAt.getHours() + (aiResult.label === 'hot' ? 2 : 24));
      try {
        await this.db.insert(leadTasks).values({
          id: randomUUID(),
          tenantId,
          leadId,
          title: `[AI] ${aiResult.suggestedNextAction}`,
          description: aiResult.agentScript
            ? `Suggested script:\n"${aiResult.agentScript}"`
            : undefined,
          status: 'open',
          priority: aiResult.label === 'hot' ? 'urgent' : 'high',
          dueAt,
          assignedToUserId: lead.lead.assignedToUserId ?? undefined,
          metadata: { source: 'ai_qualification', score: aiResult.finalScore ?? aiResult.score },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        this.logger.log(`[AI Task Created] lead=${leadId} label=${aiResult.label} action="${aiResult.suggestedNextAction}"`);
      } catch (err) {
        // Non-fatal: log and continue
        this.logger.warn('[AI Task Creation Failed]', err);
      }
    }

    return this.getLead(tenantId, leadId);
  }

  // ─── AI Email Draft ──────────────────────────────────────────────────────────

  async draftEmailForLead(tenantId: string, leadId: string) {
    const { lead } = await this.getLead(tenantId, leadId);
    const draft = await this.aiQualificationService.draftLeadEmail({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      budget: lead.budget ? Number(lead.budget) : null,
      requirementType: lead.requirementType,
      propertyType: lead.propertyType,
      bhkType: lead.bhkType,
      leadSource: lead.leadSource,
      notes: lead.notes,
      aiQualification: lead.aiQualification as any,
    });
    if (!draft) {
      throw new InternalServerErrorException('AI email drafting failed — check GROQ_API_KEY');
    }
    return { data: draft };
  }

  // ─── AI Analytics Insights ────────────────────────────────────────────────────

  async getAiInsights(tenantId: string) {
    // Build stats from DB for the last 30 days
    const [totalResult] = await this.db
      .select({ val: count() })
      .from(leads)
      .where(eq(leads.tenantId, tenantId));

    const allLeads = await this.db
      .select({
        leadLabel: leads.leadLabel,
        leadScore: leads.leadScore,
        leadSource: leads.leadSource,
        statusId: leads.statusId,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .limit(500);

    const hotLeads  = allLeads.filter(l => l.leadLabel === 'hot').length;
    const warmLeads = allLeads.filter(l => l.leadLabel === 'warm').length;
    const coldLeads = allLeads.filter(l => l.leadLabel === 'cold').length;

    const scores = allLeads.map(l => Number(l.leadScore || 0)).filter(s => s > 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    // Source counts
    const sourceCounts: Record<string, number> = {};
    for (const l of allLeads) {
      if (l.leadSource) sourceCounts[l.leadSource] = (sourceCounts[l.leadSource] || 0) + 1;
    }
    const topSources = Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    // Fetch site visit rate
    const [visitResult] = await this.db
      .select({ val: count() })
      .from(siteVisits)
      .where(eq(siteVisits.tenantId, tenantId));

    const totalLeads = Number(totalResult?.val || 0);
    const siteVisitRate = totalLeads > 0
      ? Math.round((Number(visitResult?.val || 0) / totalLeads) * 100)
      : 0;

    const insights = await this.aiQualificationService.generateAnalyticsInsights({
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      convertedLeads: 0, // extend when deals module is linked
      avgScore,
      topSources,
      topDropOffStage: 'Initial Contact', // placeholder — extend with pipeline analytics
      siteVisitRate,
      avgResponseTimeHours: 4, // placeholder
      period: 'Last 30 days',
    });

    if (!insights) {
      throw new InternalServerErrorException('AI insights generation failed — check GROQ_API_KEY');
    }
    return { data: insights };
  }

  // ─── Export Leads to Excel ───────────────────────────────────────────────────

  async exportLeadsToXlsx(tenantId: string, query: LeadListQueryDto): Promise<Buffer> {
    // ── 1. Fetch all lead data with every field ──────────────────────────────
    const baseFilters: SQL[] = [eq(leads.tenantId, tenantId)];
    if (query.statusId)        baseFilters.push(eq(leads.statusId, query.statusId));
    if (query.assignedToUserId) baseFilters.push(eq(leads.assignedToUserId, query.assignedToUserId));
    if (query.search) {
      const sf = PaginationUtil.buildSearchFilter({ fields: [leads.name, leads.email, leads.phone], term: query.search });
      if (sf) baseFilters.push(sf);
    }
    const whereClause = PaginationUtil.buildFilters(baseFilters);

    const rows = await this.db
      .select({
        id:               leads.id,
        name:             leads.name,
        phone:            leads.phone,
        email:            leads.email,
        requirementType:  leads.requirementType,
        propertyType:     leads.propertyType,
        propertyCategory: leads.propertyCategory,
        bhkType:          leads.bhkType,
        budget:           leads.budget,
        leadSource:       leads.leadSource,
        captureChannel:   leads.captureChannel,
        leadScore:        leads.leadScore,
        leadLabel:        leads.leadLabel,
        notes:            leads.notes,
        lastContactedAt:  leads.lastContactedAt,
        nextFollowUpAt:   leads.nextFollowUpAt,
        createdAt:        leads.createdAt,
        statusName:       leadStatuses.name,
        assignedToName:   users.name,
      })
      .from(leads)
      .leftJoin(leadStatuses, eq(leads.statusId, leadStatuses.id))
      .leftJoin(users,        eq(leads.assignedToUserId, users.id))
      .where(whereClause || undefined)
      .orderBy(desc(leads.createdAt))
      .limit(5000);

    // ── 2. Build styled workbook with ExcelJS ────────────────────────────────
    const ExcelJS = await import('exceljs');
    const workbook  = new ExcelJS.default.Workbook();

    workbook.creator  = 'Softaro CRM';
    workbook.created  = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet('Leads', {
      views: [{ state: 'frozen', ySplit: 1 }], // freeze header row
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    // ── Column definitions ───────────────────────────────────────────────────
    sheet.columns = [
      { header: 'Name',          key: 'name',            width: 28 },
      { header: 'Phone',         key: 'phone',           width: 18 },
      { header: 'Email',         key: 'email',           width: 32 },
      { header: 'Status',        key: 'statusName',      width: 20 },
      { header: 'Assigned To',   key: 'assignedToName',  width: 22 },
      { header: 'AI Label',      key: 'leadLabel',       width: 12 },
      { header: 'AI Score',      key: 'leadScore',       width: 12 },
      { header: 'Requirement',   key: 'requirementType', width: 16 },
      { header: 'Property Type', key: 'propertyType',    width: 16 },
      { header: 'Category',      key: 'propertyCategory',width: 16 },
      { header: 'BHK',           key: 'bhkType',         width: 10 },
      { header: 'Budget (₹)',    key: 'budget',          width: 16 },
      { header: 'Lead Source',   key: 'leadSource',      width: 18 },
      { header: 'Next Follow Up',key: 'nextFollowUpAt',  width: 22 },
      { header: 'Last Contacted',key: 'lastContactedAt', width: 22 },
      { header: 'Notes',         key: 'notes',           width: 40 },
      { header: 'Created At',    key: 'createdAt',       width: 22 },
    ];

    // ── Style header row ─────────────────────────────────────────────────────
    const headerRow = sheet.getRow(1);
    headerRow.height = 32;
    headerRow.eachCell((cell) => {
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2D4F' } }; // navy
      cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FFC9A227' } }, // gold bottom border
      };
    });

    // ── AI Label color helper ────────────────────────────────────────────────
    const labelFill = (label: string | null): string => {
      if (label === 'hot')  return 'FFFDE8E8'; // light rose
      if (label === 'warm') return 'FFFEF3C7'; // light amber
      if (label === 'cold') return 'FFDBEAFE'; // light blue
      return 'FFFFFFFF';
    };
    const labelFont = (label: string | null): string => {
      if (label === 'hot')  return 'FFC0392B';
      if (label === 'warm') return 'FFD97706';
      if (label === 'cold') return 'FF2563EB';
      return 'FF374151';
    };

    // ── Add data rows ────────────────────────────────────────────────────────
    const fmt = (d: Date | string | null | undefined) =>
      d ? new Date(d as string).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    rows.forEach((r, idx) => {
      const isEven   = idx % 2 === 0;
      const rowBg    = isEven ? 'FFF8FAFD' : 'FFFFFFFF'; // very subtle alternating stripe
      const dataRow  = sheet.addRow({
        name:             r.name           ?? '',
        phone:            r.phone          ?? '',
        email:            r.email          ?? '',
        statusName:       r.statusName     ?? '',
        assignedToName:   r.assignedToName ?? '',
        leadLabel:        r.leadLabel      ? (r.leadLabel as string).toUpperCase() : '—',
        leadScore:        r.leadScore      ?? '',
        requirementType:  r.requirementType  ?? '',
        propertyType:     r.propertyType     ?? '',
        propertyCategory: r.propertyCategory ?? '',
        bhkType:          r.bhkType          ?? '',
        budget:           r.budget           ? Number(r.budget) : '',
        leadSource:       r.leadSource       ?? '',
        nextFollowUpAt:   fmt(r.nextFollowUpAt),
        lastContactedAt:  fmt(r.lastContactedAt),
        notes:            r.notes ?? '',
        createdAt:        fmt(r.createdAt),
      });

      dataRow.height = 22;

      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Alternating row background
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };

        // Thin border on every cell
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left:   { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right:  { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };

        cell.font      = { name: 'Calibri', size: 10, color: { argb: 'FF111827' } };
        cell.alignment = { vertical: 'middle', wrapText: false };

        // AI Label column (col 6) — colored badge style
        if (colNumber === 6) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: labelFill(r.leadLabel) } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: labelFont(r.leadLabel) } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        // AI Score column (col 7) — center align
        if (colNumber === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1B2D4F' } };
        }

        // Budget column (col 12) — right align, number format
        if (colNumber === 12 && typeof cell.value === 'number') {
          cell.numFmt    = '₹#,##0';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }
      });
    });

    // ── Summary row at the bottom ────────────────────────────────────────────
    sheet.addRow([]); // blank spacer
    const summaryRow = sheet.addRow([`Total Leads: ${rows.length}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `Exported: ${new Date().toLocaleString('en-IN')}`]);
    summaryRow.height = 20;
    summaryRow.eachCell({ includeEmpty: false }, (cell) => {
      cell.font  = { name: 'Calibri', size: 10, bold: true, italic: true, color: { argb: 'FF6B7280' } };
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    });

    return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
  }
}
