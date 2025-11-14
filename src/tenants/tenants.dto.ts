import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'acme', description: 'Unique slug for the tenant' })
  @IsString()
  @MinLength(2)
  slug!: string;

  @ApiPropertyOptional({ example: 'premium' })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'cancelled'], default: 'active' })
  @IsOptional()
  @IsEnum(['active', 'suspended', 'cancelled'])
  status?: 'active' | 'suspended' | 'cancelled';
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'Acme Corporation Updated' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'premium' })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'cancelled'] })
  @IsOptional()
  @IsEnum(['active', 'suspended', 'cancelled'])
  status?: 'active' | 'suspended' | 'cancelled';
}



