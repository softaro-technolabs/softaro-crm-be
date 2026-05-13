import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export type LeadOptionType = 'requirement_type' | 'property_type' | 'property_category' | 'capture_channel';

export class CreateLeadOptionDto {
  @IsEnum(['requirement_type', 'property_type', 'property_category', 'capture_channel'])
  type!: LeadOptionType;

  @IsString()
  label!: string;

  @IsString()
  value!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateLeadOptionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListLeadOptionsDto {
  @IsOptional()
  @IsEnum(['requirement_type', 'property_type', 'property_category', 'capture_channel'])
  type?: LeadOptionType;

  @IsOptional()
  @IsBoolean()
  activeOnly?: boolean;
}
