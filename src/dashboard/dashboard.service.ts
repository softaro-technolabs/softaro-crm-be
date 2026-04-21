import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  leads,
  leadStatuses,
} from '../database/schema/leads.schema';
import { deals } from '../database/schema/deals.schema';
import { bookings } from '../database/schema/bookings.schema';
import { propertyUnits } from '../database/schema/properties.schema';
import { users } from '../database/schema/users.schema';
import { userTenants } from '../database/schema/user-tenants.schema';
import { DashboardResponseDto, DashboardQueryDto } from './dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase
  ) {}

  async getDashboardSummary(tenantId: string, query: DashboardQueryDto): Promise<DashboardResponseDto> {
    const { startDate, endDate, period } = query;
    let start: Date;
    let end = new Date();

    if (startDate) {
      start = new Date(startDate);
      if (endDate) end = new Date(endDate);
    } else {
      start = new Date();
      switch (period) {
        case 'today':
          start.setHours(0, 0, 0, 0);
          break;
        case 'yesterday':
          start.setDate(start.getDate() - 1);
          start.setHours(0, 0, 0, 0);
          end = new Date(start);
          end.setHours(23, 59, 59, 999);
          break;
        case '7days':
          start.setDate(start.getDate() - 7);
          break;
        case '30days':
          start.setDate(start.getDate() - 30);
          break;
        case 'year':
          start.setFullYear(start.getFullYear() - 1);
          break;
        case 'month':
        default:
          start.setDate(1);
          start.setHours(0, 0, 0, 0);
          break;
      }
    }

    const [
      leadCount,
      dealCount,
      bookingStats,
      availableUnitsCount,
      funnelData,
      trendsData,
      sourceData,
      agentData,
      projectData,
      recentLeadsList
    ] = await Promise.all([
      // Total Leads (in period)
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), gte(leads.createdAt, start), lte(leads.createdAt, end))),

      // Active Deals
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), eq(deals.status, 'active'))),

      // Bookings & Revenue in period
      this.db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<number>`sum(CAST(${bookings.paidAmount} AS NUMERIC))`
        })
        .from(bookings)
        .where(and(eq(bookings.tenantId, tenantId), gte(bookings.createdAt, start), lte(bookings.createdAt, end))),

      // Available Units
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(propertyUnits)
        .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.unitStatus, 'available'))),

      // Funnel Data (Filtered by period)
      this.db
        .select({
          statusName: leadStatuses.name,
          color: leadStatuses.color,
          count: sql<number>`count(${leads.id})`
        })
        .from(leadStatuses)
        .leftJoin(leads, and(eq(leads.statusId, leadStatuses.id), gte(leads.createdAt, start), lte(leads.createdAt, end)))
        .where(eq(leadStatuses.tenantId, tenantId))
        .groupBy(leadStatuses.id, leadStatuses.name, leadStatuses.color, leadStatuses.order)
        .orderBy(leadStatuses.order),

      // Lead Trends
      this.db
        .select({
          date: sql<string>`DATE(${leads.createdAt})`,
          count: sql<number>`count(*)`
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), gte(leads.createdAt, start), lte(leads.createdAt, end)))
        .groupBy(sql`DATE(${leads.createdAt})`)
        .orderBy(sql`DATE(${leads.createdAt})`),

      // Lead Sources
      this.db
        .select({
          source: leads.leadSource,
          count: sql<number>`count(*)`
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), gte(leads.createdAt, start), lte(leads.createdAt, end)))
        .groupBy(leads.leadSource),

      // Agent Performance
      this.db
        .select({
          agentName: users.name,
          leadCount: sql<number>`count(${leads.id})`
        })
        .from(users)
        .innerJoin(userTenants, eq(userTenants.userId, users.id))
        .leftJoin(leads, and(eq(leads.assignedToUserId, users.id), gte(leads.createdAt, start), lte(leads.createdAt, end)))
        .where(eq(userTenants.tenantId, tenantId))
        .groupBy(users.name)
        .limit(10),

      // Project Interests (using propertyCategory as proxy for project name)
      this.db
        .select({
          projectName: leads.propertyCategory,
          count: sql<number>`count(*)`
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), gte(leads.createdAt, start), lte(leads.createdAt, end)))
        .groupBy(leads.propertyCategory)
        .orderBy(sql`count(*) DESC`)
        .limit(5),

      // Recent Leads
      this.db
        .select({
          id: leads.id,
          name: leads.name,
          email: leads.email,
          createdAt: leads.createdAt
        })
        .from(leads)
        .where(eq(leads.tenantId, tenantId))
        .orderBy(sql`${leads.createdAt} DESC`)
        .limit(10)
    ]);

    const totalLeadsInPeriod = Number(leadCount[0]?.count || 0);

    return {
      summary: {
        totalLeads: totalLeadsInPeriod,
        activeDeals: Number(dealCount[0]?.count || 0),
        totalBookingsMonth: Number(bookingStats[0]?.count || 0),
        revenueCurrentMonth: Number(bookingStats[0]?.revenue || 0),
        availableUnits: Number(availableUnitsCount[0]?.count || 0)
      },
      funnel: funnelData.map(f => ({
        statusName: f.statusName,
        count: Number(f.count || 0),
        color: f.color || '#cbd5e1'
      })),
      trends: trendsData.map(t => ({
        date: t.date,
        count: Number(t.count || 0)
      })),
      sources: sourceData.map(s => ({
        source: s.source,
        count: Number(s.count || 0),
        percentage: totalLeadsInPeriod > 0 ? (Number(s.count) / totalLeadsInPeriod) * 100 : 0
      })).sort((a,b) => b.count - a.count),
      agentPerformance: agentData.map(a => ({
        agentName: a.agentName || 'Unassigned',
        leadCount: Number(a.leadCount || 0),
        conversionRate: 0 // Will implement full conversion tracking separately
      })).filter(a => a.leadCount > 0),
      projectInterests: projectData.map(p => ({
        projectName: p.projectName || 'General Inquiry',
        leadCount: Number(p.count || 0)
      })).filter(p => p.leadCount > 0),
      recentLeads: recentLeadsList
    };
  }
}
