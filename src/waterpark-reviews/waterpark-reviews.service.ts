import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, sql, desc, count } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { waterparkReviews } from '../database/schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewStatusDto } from './dto/update-status.dto';

@Injectable()
export class WaterparkReviewsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) { }

  async create(dto: CreateReviewDto) {
    const id = randomUUID();
    const [review] = await this.db.insert(waterparkReviews).values({
      id,
      ...dto,
      visitDate: new Date(dto.visitDate),
      status: 'pending',
    }).returning();
    return review;
  }

  async findAll(query: { page?: number; limit?: number; sort?: string; min_rating?: number; status?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    const filters: any[] = [];
    if (query.status) {
      filters.push(eq(waterparkReviews.status, query.status as any));
    }
    // Default to 'approved' only if explicitly requested, otherwise show all for now?
    // Actually, let's keep it 'approved' only if status is provided, 
    // but if the user wants to see their 2 reviews, they might be pending.
    // I will remove the hardcoded 'approved' filter to show all reviews by default as requested.
    if (query.min_rating) {
      filters.push(gte(waterparkReviews.ratingOverall, query.min_rating));
    }

    const orderBy = query.sort === 'rating' 
      ? [desc(waterparkReviews.ratingOverall)] 
      : [desc(waterparkReviews.submittedAt)];

    const results = await this.db
      .select()
      .from(waterparkReviews)
      .where(and(...filters))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    const [{ count: total }] = await this.db
      .select({ count: count() })
      .from(waterparkReviews)
      .where(and(...filters));

    return {
      reviews: results,
      totalPages: Math.ceil(Number(total) / limit),
      currentPage: page,
      totalReviews: Number(total),
    };
  }

  async findOne(id: string) {
    const [review] = await this.db
      .select()
      .from(waterparkReviews)
      .where(eq(waterparkReviews.id, id))
      .limit(1);

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }
  async getSummary() {
    const statsQuery = this.db
      .select({
        totalReviews: count(),
        avgOverall: sql<number>`avg(${waterparkReviews.ratingOverall})`,
        avgRideVariety: sql<number>`avg(${waterparkReviews.ratingRideVariety})`,
        avgThrill: sql<number>`avg(${waterparkReviews.ratingThrill})`,
        avgKidsFriendly: sql<number>`avg(${waterparkReviews.ratingKidsFriendly})`,
        avgWaitTime: sql<number>`avg(${waterparkReviews.ratingWaitTime})`,
        avgCleanliness: sql<number>`avg(${waterparkReviews.ratingCleanliness})`,
        avgChangingRooms: sql<number>`avg(${waterparkReviews.ratingChangingRooms})`,
        avgFood: sql<number>`avg(${waterparkReviews.ratingFood})`,
        avgSeating: sql<number>`avg(${waterparkReviews.ratingSeating})`,
        avgValue: sql<number>`avg(${waterparkReviews.ratingValue})`,
        avgLifeguard: sql<number>`avg(${waterparkReviews.ratingLifeguard})`,
        avgStaff: sql<number>`avg(${waterparkReviews.ratingStaff})`,
        avgFirstAid: sql<number>`avg(${waterparkReviews.ratingFirstAid})`,
      })
      .from(waterparkReviews);

    const breakdownQuery = this.db
      .select({
        rating: waterparkReviews.ratingOverall,
        count: count(),
      })
      .from(waterparkReviews)
      .groupBy(waterparkReviews.ratingOverall)
      .orderBy(desc(waterparkReviews.ratingOverall));

    // For now, no status filter in summary to show everything
    const [stats] = await statsQuery;
    const ratingBreakdown = await breakdownQuery;

    // Aggregate most enjoyed rides (stored as jsonb array)
    const ridesBreakdown = await this.db.execute(sql`
      SELECT ride, COUNT(*) as count
      FROM (
        SELECT jsonb_array_elements_text(rides_enjoyed) as ride
        FROM waterpark_reviews
      ) sub
      GROUP BY ride
      ORDER BY count DESC
    `);

    return {
      totalReviews: Number(stats.totalReviews),
      averageRatings: stats,
      ratingBreakdown,
      mostEnjoyedRides: ridesBreakdown,
    };
  }

  async updateStatus(id: string, dto: UpdateReviewStatusDto) {
    const [review] = await this.db
      .update(waterparkReviews)
      .set({ status: dto.status })
      .where(eq(waterparkReviews.id, id))
      .returning();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  async delete(id: string) {
    const result = await this.db
      .delete(waterparkReviews)
      .where(eq(waterparkReviews.id, id))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException('Review not found');
    }

    return { message: 'Review deleted successfully' };
  }
}
