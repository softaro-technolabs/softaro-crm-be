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

  async findAll(query: { page?: number; limit?: number; sort?: string; min_rating?: number }) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    const filters = [eq(waterparkReviews.status, 'approved')];
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
    const filters = eq(waterparkReviews.status, 'approved');

    const [stats] = await this.db
      .select({
        totalReviews: count(),
        avgOverall: sql<number>`avg(${waterparkReviews.ratingOverall})`,
        avgRideVariety: sql<number>`avg(${waterparkReviews.ratingRideVariety})`,
        avgThrill: sql<number>`avg(${waterparkReviews.ratingThrill})`,
        avgKidsAttractions: sql<number>`avg(${waterparkReviews.ratingKidsAttractions})`,
        avgWaitTimes: sql<number>`avg(${waterparkReviews.ratingWaitTimes})`,
        avgCleanliness: sql<number>`avg(${waterparkReviews.ratingCleanliness})`,
        avgChangingRooms: sql<number>`avg(${waterparkReviews.ratingChangingRooms})`,
        avgFoodQuality: sql<number>`avg(${waterparkReviews.ratingFoodQuality})`,
        avgSeating: sql<number>`avg(${waterparkReviews.ratingSeating})`,
        avgValueForMoney: sql<number>`avg(${waterparkReviews.ratingValueForMoney})`,
        avgLifeguardSafety: sql<number>`avg(${waterparkReviews.ratingLifeguardSafety})`,
        avgStaffBehaviour: sql<number>`avg(${waterparkReviews.ratingStaffBehaviour})`,
        avgFirstAid: sql<number>`avg(${waterparkReviews.ratingFirstAid})`,
      })
      .from(waterparkReviews)
      .where(filters);

    const ratingBreakdown = await this.db
      .select({
        rating: waterparkReviews.ratingOverall,
        count: count(),
      })
      .from(waterparkReviews)
      .where(filters)
      .groupBy(waterparkReviews.ratingOverall)
      .orderBy(desc(waterparkReviews.ratingOverall));

    // Aggregate most enjoyed rides (stored as jsonb array)
    const ridesBreakdown = await this.db.execute(sql`
      SELECT ride, COUNT(*) as count
      FROM (
        SELECT jsonb_array_elements_text(rides_enjoyed) as ride
        FROM waterpark_reviews
        WHERE status = 'approved'
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
