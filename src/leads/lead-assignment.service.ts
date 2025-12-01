import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { randomBytes, randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  leadAssignmentAgents,
  leadAssignmentLogs,
  leadAssignmentSettings,
  leadStatuses,
  leads,
  userTenants,
  users
} from '../database/schema';
import {
  LeadAssignmentStrategy,
  LEAD_ASSIGNMENT_STRATEGIES,
  UpdateLeadAssignmentSettingsDto,
  UpsertLeadAssignmentAgentDto
} from './leads.dto';

type LeadAutoAssignPayload = {
  requirementType: string;
  propertyCategory?: string | null;
  propertyType?: string | null;
  locationPreference?: string | null;
};

type AgentSnapshot = {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  isAvailable: boolean;
  maxActiveLeads: number | null;
  categoryPreferences: string[];
  locationPreferences: string[];
  propertyTypes: string[];
  activeLeadCount: number;
  lastAssignedAt: Date | null;
};

const DEFAULT_STRATEGY_ORDER: LeadAssignmentStrategy[] = [
  'availability',
  'property_category',
  'location',
  'round_robin'
];

@Injectable()
export class LeadAssignmentService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async ensureSettings(tenantId: string) {
    const [existing] = await this.db
      .select()
      .from(leadAssignmentSettings)
      .where(eq(leadAssignmentSettings.tenantId, tenantId))
      .limit(1);

    if (existing) {
      return existing;
    }

    const now = new Date();
    const apiKey = this.generateKey();
    const webhookSecret = this.generateKey();
    const id = randomUUID();

    await this.db.insert(leadAssignmentSettings).values({
      id,
      tenantId,
      autoAssignEnabled: true,
      strategyOrder: DEFAULT_STRATEGY_ORDER,
      publicApiKey: apiKey,
      webhookSecret,
      createdAt: now,
      updatedAt: now
    });

    const [created] = await this.db
      .select()
      .from(leadAssignmentSettings)
      .where(eq(leadAssignmentSettings.id, id))
      .limit(1);

    return created;
  }

  async getSettings(tenantId: string) {
    return this.ensureSettings(tenantId);
  }

  async rotatePublicApiKey(tenantId: string) {
    const settings = await this.ensureSettings(tenantId);
    const apiKey = this.generateKey();
    await this.db
      .update(leadAssignmentSettings)
      .set({
        publicApiKey: apiKey,
        updatedAt: new Date()
      })
      .where(eq(leadAssignmentSettings.id, settings.id));
    return this.getSettings(tenantId);
  }

  async updateSettings(tenantId: string, dto: UpdateLeadAssignmentSettingsDto) {
    const settings = await this.ensureSettings(tenantId);
    const update: Partial<typeof leadAssignmentSettings.$inferInsert> = {};

    if (dto.autoAssignEnabled !== undefined) {
      update.autoAssignEnabled = dto.autoAssignEnabled;
    }

    if (dto.strategyOrder && dto.strategyOrder.length > 0) {
      update.strategyOrder = dto.strategyOrder;
    }

    if (Object.keys(update).length === 0) {
      return settings;
    }

    update.updatedAt = new Date();

    await this.db.update(leadAssignmentSettings).set(update).where(eq(leadAssignmentSettings.id, settings.id));

    return this.getSettings(tenantId);
  }

  async listAgentProfiles(tenantId: string) {
    return this.db
      .select({
        profile: leadAssignmentAgents,
        user: {
          id: users.id,
          name: users.name,
          email: users.email
        }
      })
      .from(leadAssignmentAgents)
      .innerJoin(users, eq(users.id, leadAssignmentAgents.userId))
      .innerJoin(
        userTenants,
        and(
          eq(userTenants.userId, leadAssignmentAgents.userId),
          eq(userTenants.tenantId, leadAssignmentAgents.tenantId),
          eq(userTenants.status, 'active')
        )
      )
      .where(eq(leadAssignmentAgents.tenantId, tenantId));
  }

  async upsertAgentProfile(tenantId: string, dto: UpsertLeadAssignmentAgentDto) {
    const [membership] = await this.db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.userId, dto.userId), eq(userTenants.tenantId, tenantId)))
      .limit(1);

    if (!membership || membership.status !== 'active') {
      throw new BadRequestException('User is not active in this tenant');
    }

    const now = new Date();
    const normalizedPreferences = {
      categoryPreferences: dto.categoryPreferences ?? [],
      locationPreferences: dto.locationPreferences ?? [],
      propertyTypes: dto.propertyTypes ?? []
    };
    const updateData: Partial<typeof leadAssignmentAgents.$inferInsert> = {
      isAvailable: dto.isAvailable ?? true,
      maxActiveLeads: dto.maxActiveLeads ?? null,
      ...normalizedPreferences,
      updatedAt: now
    };

    const [existing] = await this.db
      .select()
      .from(leadAssignmentAgents)
      .where(and(eq(leadAssignmentAgents.tenantId, tenantId), eq(leadAssignmentAgents.userId, dto.userId)))
      .limit(1);

    if (existing) {
      await this.db
        .update(leadAssignmentAgents)
        .set(updateData)
        .where(eq(leadAssignmentAgents.id, existing.id));
      return this.findAgentProfileById(existing.id);
    }

    const id = randomUUID();
    await this.db.insert(leadAssignmentAgents).values({
      id,
      tenantId,
      userId: dto.userId,
      isAvailable: updateData.isAvailable ?? true,
      maxActiveLeads: updateData.maxActiveLeads ?? null,
      ...normalizedPreferences,
      lastAssignedAt: null,
      createdAt: now,
      updatedAt: now
    });

    return this.findAgentProfileById(id);
  }

  async setAgentAvailability(tenantId: string, userId: string, isAvailable: boolean) {
    const [existing] = await this.db
      .select()
      .from(leadAssignmentAgents)
      .where(and(eq(leadAssignmentAgents.tenantId, tenantId), eq(leadAssignmentAgents.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Agent profile not found');
    }

    await this.db
      .update(leadAssignmentAgents)
      .set({ isAvailable, updatedAt: new Date() })
      .where(eq(leadAssignmentAgents.id, existing.id));

    return this.findAgentProfileById(existing.id);
  }

  async autoAssignLead(tenantId: string, payload: LeadAutoAssignPayload) {
    const settings = await this.ensureSettings(tenantId);
    if (!settings.autoAssignEnabled) {
      return { userId: null, strategy: null as LeadAssignmentStrategy | null };
    }

    const strategies = this.normalizeStrategies(settings.strategyOrder);
    const agents = await this.buildAgentSnapshots(tenantId);
    if (agents.length === 0) {
      return { userId: null, strategy: null };
    }

    for (const strategy of strategies) {
      const candidate = this.pickAgentByStrategy(strategy, agents, settings, payload);
      if (candidate) {
        await this.onAgentAssigned(tenantId, candidate.userId, strategy);
        return { userId: candidate.userId, strategy };
      }
    }

    return { userId: null, strategy: null };
  }

  async recordAssignmentLog(
    tenantId: string,
    leadId: string,
    fromUserId: string | null,
    toUserId: string | null,
    strategy: LeadAssignmentStrategy | null,
    reason: string | null,
    metadata?: Record<string, unknown>
  ) {
    await this.db.insert(leadAssignmentLogs).values({
      id: randomUUID(),
      tenantId,
      leadId,
      fromUserId,
      toUserId,
      strategy: strategy ?? null,
      reason: reason ?? null,
      metadata: metadata ?? null
    });
  }

  private async findAgentProfileById(id: string) {
    const [row] = await this.db
      .select({
        profile: leadAssignmentAgents,
        user: {
          id: users.id,
          name: users.name,
          email: users.email
        }
      })
      .from(leadAssignmentAgents)
      .innerJoin(users, eq(users.id, leadAssignmentAgents.userId))
      .where(eq(leadAssignmentAgents.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Agent profile not found');
    }

    return row;
  }

  private normalizeStrategies(value: unknown): LeadAssignmentStrategy[] {
    if (!Array.isArray(value)) {
      return DEFAULT_STRATEGY_ORDER;
    }

    const seen = new Set<LeadAssignmentStrategy>();
    for (const entry of value) {
      if (LEAD_ASSIGNMENT_STRATEGIES.includes(entry as LeadAssignmentStrategy)) {
        seen.add(entry as LeadAssignmentStrategy);
      }
    }

    if (seen.size === 0) {
      return DEFAULT_STRATEGY_ORDER;
    }

    return Array.from(seen);
  }

  private async buildAgentSnapshots(tenantId: string): Promise<AgentSnapshot[]> {
    const [activeStatuses, agentRows] = await Promise.all([
      this.getActiveStatusIds(tenantId),
      this.db
        .select({
          profile: leadAssignmentAgents,
          user: {
            id: users.id,
            name: users.name,
            email: users.email
          }
        })
        .from(leadAssignmentAgents)
        .innerJoin(users, eq(users.id, leadAssignmentAgents.userId))
        .innerJoin(
          userTenants,
          and(
            eq(userTenants.userId, leadAssignmentAgents.userId),
            eq(userTenants.tenantId, leadAssignmentAgents.tenantId),
            eq(userTenants.status, 'active')
          )
        )
        .where(and(eq(leadAssignmentAgents.tenantId, tenantId), eq(leadAssignmentAgents.isAvailable, true)))
    ]);

    const countsMap = await this.getActiveLeadCounts(tenantId, activeStatuses);

    return agentRows.map((row) => ({
      userId: row.user.id,
      tenantId,
      name: row.user.name,
      email: row.user.email,
      isAvailable: row.profile.isAvailable,
      maxActiveLeads: row.profile.maxActiveLeads ?? null,
      categoryPreferences: Array.isArray(row.profile.categoryPreferences)
        ? (row.profile.categoryPreferences as string[])
        : [],
      locationPreferences: Array.isArray(row.profile.locationPreferences)
        ? (row.profile.locationPreferences as string[])
        : [],
      propertyTypes: Array.isArray(row.profile.propertyTypes) ? (row.profile.propertyTypes as string[]) : [],
      activeLeadCount: countsMap.get(row.user.id) ?? 0,
      lastAssignedAt: row.profile.lastAssignedAt ?? null
    }));
  }

  private async getActiveStatusIds(tenantId: string) {
    const rows = await this.db
      .select({ id: leadStatuses.id })
      .from(leadStatuses)
      .where(and(eq(leadStatuses.tenantId, tenantId), eq(leadStatuses.isFinal, false)));
    return rows.map((row) => row.id);
  }

  private async getActiveLeadCounts(tenantId: string, statusIds: string[]) {
    if (statusIds.length === 0) {
      return new Map<string, number>();
    }

    const rows = await this.db
      .select({
        assignee: leads.assignedToUserId,
        total: sql<number>`count(*)`
      })
      .from(leads)
      .where(
        and(eq(leads.tenantId, tenantId), inArray(leads.statusId, statusIds), isNotNull(leads.assignedToUserId))
      )
      .groupBy(leads.assignedToUserId);

    return rows.reduce((acc, row) => {
      if (row.assignee) {
        acc.set(row.assignee, Number(row.total));
      }
      return acc;
    }, new Map<string, number>());
  }

  private pickAgentByStrategy(
    strategy: LeadAssignmentStrategy,
    agents: AgentSnapshot[],
    settings: typeof leadAssignmentSettings.$inferSelect,
    payload: LeadAutoAssignPayload
  ) {
    switch (strategy) {
      case 'availability':
        return this.pickByAvailability(agents);
      case 'property_category':
        return this.pickByCategory(agents, payload);
      case 'location':
        return this.pickByLocation(agents, payload);
      case 'round_robin':
      default:
        return this.pickByRoundRobin(agents, settings.roundRobinPointerUserId ?? null);
    }
  }

  private pickByAvailability(agents: AgentSnapshot[]) {
    const eligible = agents.filter(
      (agent) =>
        agent.isAvailable &&
        (agent.maxActiveLeads === null || agent.activeLeadCount < agent.maxActiveLeads)
    );

    if (eligible.length === 0) {
      return null;
    }

    return eligible.sort((a, b) => a.activeLeadCount - b.activeLeadCount)[0];
  }

  private pickByCategory(agents: AgentSnapshot[], payload: LeadAutoAssignPayload) {
    const category = (payload.propertyCategory ?? payload.requirementType ?? '').toLowerCase();
    if (!category) {
      return null;
    }

    const eligible = agents.filter((agent) =>
      agent.categoryPreferences.some((entry) => entry.toLowerCase() === category)
    );

    return eligible.length > 0 ? eligible[0] : null;
  }

  private pickByLocation(agents: AgentSnapshot[], payload: LeadAutoAssignPayload) {
    const location = (payload.locationPreference ?? '').trim().toLowerCase();
    if (!location) {
      return null;
    }

    const eligible = agents.filter((agent) =>
      agent.locationPreferences.some((entry) => location.includes(entry.toLowerCase()))
    );

    return eligible.length > 0 ? eligible[0] : null;
  }

  private pickByRoundRobin(agents: AgentSnapshot[], pointer: string | null) {
    const sorted = [...agents].sort((a, b) => a.userId.localeCompare(b.userId));
    if (sorted.length === 0) {
      return null;
    }

    if (!pointer) {
      return sorted[0];
    }

    const index = sorted.findIndex((agent) => agent.userId === pointer);
    if (index === -1) {
      return sorted[0];
    }

    return sorted[(index + 1) % sorted.length];
  }

  private async onAgentAssigned(tenantId: string, userId: string, strategy: LeadAssignmentStrategy) {
    const now = new Date();

    await Promise.all([
      this.db
        .update(leadAssignmentAgents)
        .set({ lastAssignedAt: now, updatedAt: now })
        .where(and(eq(leadAssignmentAgents.tenantId, tenantId), eq(leadAssignmentAgents.userId, userId))),
      this.db
        .update(leadAssignmentSettings)
        .set({ roundRobinPointerUserId: userId, updatedAt: now })
        .where(eq(leadAssignmentSettings.tenantId, tenantId))
    ]);
  }

  private generateKey() {
    return randomBytes(24).toString('hex');
  }
}


