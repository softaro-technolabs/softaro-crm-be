import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export enum SiteVisitStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show'
}

export class CreateSiteVisitDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  leadId!: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  propertyId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  assignedToUserId?: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  visitDate!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class SiteVisitCheckInDto {
  @ApiProperty({ example: 19.076 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: '123 Main Road, Baner, Pune' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'https://storage.example.com/selfie.jpg' })
  @IsString()
  @IsOptional()
  selfieUrl?: string;
}

export class UpdateSiteVisitDto {
  @ApiPropertyOptional({ enum: SiteVisitStatus })
  @IsEnum(SiteVisitStatus)
  @IsOptional()
  status?: SiteVisitStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  feedback?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  visitDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
