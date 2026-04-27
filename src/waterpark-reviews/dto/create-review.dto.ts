import { IsString, IsEmail, IsOptional, IsEnum, IsDateString, IsArray, IsInt, Min, Max, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty({ required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty()
  @IsString()
  city!: string;

  @ApiProperty({ enum: ["Under 18", "18–25", "26–35", "36–45", "46–60", "60+"] })
  @IsEnum(["Under 18", "18–25", "26–35", "36–45", "46–60", "60+"])
  ageGroup!: "Under 18" | "18–25" | "26–35" | "36–45" | "46–60" | "60+";

  @ApiProperty()
  @IsDateString()
  visitDate!: string;

  @ApiProperty({ enum: ["Family Trip", "Friends Group", "Couple", "School / College Trip", "Corporate Outing", "Solo Visit"] })
  @IsEnum(["Family Trip", "Friends Group", "Couple", "School / College Trip", "Corporate Outing", "Solo Visit"])
  visitType!: "Family Trip" | "Friends Group" | "Couple" | "School / College Trip" | "Corporate Outing" | "Solo Visit";

  @ApiProperty({ enum: ["1–2 persons", "3–5 persons", "6–10 persons", "11–20 persons", "More than 20"] })
  @IsEnum(["1–2 persons", "3–5 persons", "6–10 persons", "11–20 persons", "More than 20"])
  groupSize!: "1–2 persons" | "3–5 persons" | "6–10 persons" | "11–20 persons" | "More than 20";

  @ApiProperty({ required: false, enum: ["Less than 2 hours", "2–4 hours", "4–6 hours", "Full day (6+ hours)"] })
  @IsOptional()
  @IsEnum(["Less than 2 hours", "2–4 hours", "4–6 hours", "Full day (6+ hours)"])
  timeSpent?: "Less than 2 hours" | "2–4 hours" | "4–6 hours" | "Full day (6+ hours)";

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ridesEnjoyed!: string[];

  @ApiProperty({ required: false, enum: ["Yes, with kids under 10", "Yes, with kids 10-15", "No children"] })
  @IsOptional()
  @IsEnum(["Yes, with kids under 10", "Yes, with kids 10-15", "No children"])
  visitedWithChildren?: "Yes, with kids under 10" | "Yes, with kids 10-15" | "No children";

  // Ratings
  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingRideVariety?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingThrill?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingKidsFriendly?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingWaitTime?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingCleanliness?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingChangingRooms?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingFood?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingSeating?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingValue?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingLifeguard?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingStaff?: number;

  @ApiProperty({ required: false, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingFirstAid?: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  ratingOverall!: number;

  // Feedback
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reviewTitle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reviewText?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  likedMost?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  improvements?: string;

  @ApiProperty({ required: false, enum: ["Definitely Yes", "Probably Yes", "Not Sure", "Probably No"] })
  @IsOptional()
  @IsEnum(["Definitely Yes", "Probably Yes", "Not Sure", "Probably No"])
  wouldRecommend?: "Definitely Yes" | "Probably Yes" | "Not Sure" | "Probably No";

  @ApiProperty({ required: false, enum: ["Google", "Instagram", "Facebook", "Friend / Family", "YouTube", "Roadside Board"] })
  @IsOptional()
  @IsEnum(["Google", "Instagram", "Facebook", "Friend / Family", "YouTube", "Roadside Board"])
  heardFrom?: "Google" | "Instagram" | "Facebook" | "Friend / Family" | "YouTube" | "Roadside Board";
}
