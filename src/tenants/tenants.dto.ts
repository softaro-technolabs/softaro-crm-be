import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength, IsIn } from 'class-validator';
import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export class CreateTenantDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'acme', description: 'Unique slug for the tenant' })
  @IsString()
  @MinLength(2)
  slug!: string;

  @ApiProperty({ example: 'admin@acme.com', description: 'Email for the default admin user' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Password for the default admin user' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ example: 'premium' })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended', 'cancelled'], default: 'active' })
  @IsOptional()
  @IsEnum(['active', 'suspended', 'cancelled'])
  status?: 'active' | 'suspended' | 'cancelled';

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ example: 'Real estate excellence' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @ApiPropertyOptional({ example: 'contact@example.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: '123 Main St, City' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  socialLinks?: any;

  @ApiPropertyOptional()
  @IsOptional()
  websiteConfig?: any;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  socialLinks?: any;

  @ApiPropertyOptional()
  @IsOptional()
  websiteConfig?: any;
}





export class TenantListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({
    enum: ['name', 'slug', 'plan', 'status', 'createdAt'],
    default: 'createdAt',
    description: 'Field to sort by',
    example: 'name'
  })
  @IsOptional()
  @IsIn(['name', 'slug', 'plan', 'status', 'createdAt'])
  override sortBy?: 'name' | 'slug' | 'plan' | 'status' | 'createdAt';
}
