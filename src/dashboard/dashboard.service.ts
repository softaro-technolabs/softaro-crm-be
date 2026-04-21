import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  leads,
  leadStatuses,
} from '../database/schema/leads.schema';
import { deals } from '../database/schema/deals.schema';
import { bookings } from '../database/schema/bookings.schema';
import { propertyUnits } from '../database/schema/properties.schema';
import { DashboardResponseDto } from './dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase
  ) {}

  async getDashboardSummary(tenantId: string): Promise<DashboardResponseDto> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      leadCount,
      dealCount,
      bookingStats,
      availableUnitsCount,
      funnelData,
      trendsData,
      recentLeadsList
    ] = await Promise.all([
      // Total Leads
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(eq(leads.tenantId, tenantId)),

      // Active Deals
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), eq(deals.status, 'active'))),

      // Bookings & Revenue this month
      this.db
        .select({
          count: sql<number>`count(*)`,
          revenue: sql<number>`sum(CAST(${bookings.paidAmount} AS NUMERIC))`
        })
        .from(bookings)
        .where(and(eq(bookings.tenantId, tenantId), gte(bookings.createdAt, startOfMonth))),

      // Available Units
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(propertyUnits)
        .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.unitStatus, 'available'))),

      // Funnel Data
      this.db
        .select({
          statusName: leadStatuses.name,
          color: leadStatuses.color,
          count: sql<number>`count(${leads.id})`
        })
        .from(leadStatuses)
        .leftJoin(leads, eq(leads.statusId, leadStatuses.id))
        .where(eq(leadStatuses.tenantId, tenantId))
        .groupBy(leadStatuses.id, leadStatuses.name, leadStatuses.color, leadStatuses.order)
        .orderBy(leadStatuses.order),

      // Lead Trends (Last 7 days)
      this.db
        .select({
          date: sql<string>`DATE(${leads.createdAt})`,
          count: sql<number>`count(*)`
        })
        .from(leads)
        .where(and(eq(leads.tenantId, tenantId), gte(leads.createdAt, sql`NOW() - INTERVAL '7 days'`)))
        .groupBy(sql`DATE(${leads.createdAt})`)
        .orderBy(sql`DATE(${leads.createdAt})`),

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
        .limit(5)
    ]);

    return {
      summary: {
        totalLeads: Number(leadCount[0]?.count || 0),
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
      recentLeads: recentLeadsList
    };
  }
}
