import {
  integer,
  pgEnum,
  pgTable,
  timestamp,
  varchar,
  text,
  jsonb
} from 'drizzle-orm/pg-core';

export const ageGroupEnum = pgEnum('age_group', [
  "Under 18", 
  "18–25", 
  "26–35", 
  "36–45", 
  "46–60", 
  "60+"
]);

export const visitTypeEnum = pgEnum('visit_type', [
  "Family Trip", 
  "Friends Group", 
  "Couple", 
  "School / College Trip", 
  "Corporate Outing", 
  "Solo Visit"
]);

export const groupSizeEnum = pgEnum('group_size', [
  "1–2 persons", 
  "3–5 persons", 
  "6–10 persons", 
  "11–20 persons", 
  "More than 20"
]);

export const timeSpentEnum = pgEnum('time_spent', [
  "Less than 2 hours", 
  "2–4 hours", 
  "4–6 hours", 
  "Full day (6+ hours)"
]);

export const childStatusEnum = pgEnum('child_status', [
  "Yes, with kids under 10", 
  "Yes, with kids 10-15", 
  "No children"
]);

export const recommendationEnum = pgEnum('recommendation', [
  "Definitely Yes", 
  "Probably Yes", 
  "Not Sure", 
  "Probably No"
]);

export const heardFromEnum = pgEnum('heard_from', [
  "Google", 
  "Instagram", 
  "Facebook", 
  "Friend / Family", 
  "YouTube", 
  "Roadside Board"
]);

export const reviewStatusEnum = pgEnum('review_status', [
  "pending", 
  "approved", 
  "rejected"
]);

export const waterparkReviews = pgTable('waterpark_reviews', {
  id: varchar('id', { length: 36 }).primaryKey(),
  
  // Personal Info
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  city: varchar('city', { length: 255 }).notNull(),
  ageGroup: ageGroupEnum('age_group').notNull(),
  visitDate: timestamp('visit_date', { withTimezone: true }).notNull(),
  visitType: visitTypeEnum('visit_type').notNull(),

  // Visit Details
  groupSize: groupSizeEnum('group_size').notNull(),
  timeSpent: timeSpentEnum('time_spent'),
  ridesEnjoyed: jsonb('rides_enjoyed').notNull(), // Array of Strings
  visitedWithChildren: childStatusEnum('visited_with_children'),

  // Ratings
  ratingRideVariety: integer('rating_ride_variety'),
  ratingThrill: integer('rating_thrill'),
  ratingKidsAttractions: integer('rating_kids_attractions'),
  ratingWaitTimes: integer('rating_wait_times'),
  ratingCleanliness: integer('rating_cleanliness'),
  ratingChangingRooms: integer('rating_changing_rooms'),
  ratingFoodQuality: integer('rating_food_quality'),
  ratingSeating: integer('rating_seating'),
  ratingValueForMoney: integer('rating_value_for_money'),
  ratingLifeguardSafety: integer('rating_lifeguard_safety'),
  ratingStaffBehaviour: integer('rating_staff_behaviour'),
  ratingFirstAid: integer('rating_first_aid'),
  ratingOverall: integer('rating_overall').notNull(),

  // Written Feedback
  reviewTitle: varchar('review_title', { length: 255 }),
  reviewText: text('review_text'),
  likedMost: text('liked_most'),
  needsImprovement: text('needs_improvement'),
  wouldRecommend: recommendationEnum('would_recommend'),
  heardFrom: heardFromEnum('heard_from'),

  // System Fields
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  status: reviewStatusEnum('status').default('pending').notNull()
});
