import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'StrongPass!123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'role-uuid-here',
    description: 'Role ID to assign to the user in this tenant'
  })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({
    enum: ['active', 'pending', 'disabled'],
    default: 'active',
    description: 'Initial status of the user in the tenant'
  })
  @IsOptional()
  @IsEnum(['active', 'pending', 'disabled'])
  status?: 'active' | 'pending' | 'disabled';
}

export class UpdateUserTenantDto {
  @ApiPropertyOptional({ example: 'John Doe', description: 'User full name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'user@example.com', description: 'User email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'User phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'role-uuid-here',
    description: 'Role ID to assign to the user in this tenant'
  })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({
    enum: ['active', 'pending', 'disabled'],
    description: 'Status of the user in the tenant'
  })
  @IsOptional()
  @IsEnum(['active', 'pending', 'disabled'])
  status?: 'active' | 'pending' | 'disabled';
}

export class UserListQueryDto {
  @ApiPropertyOptional({ description: 'Search string applied to name/email/phone', example: 'john' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', example: 'role-uuid-here', description: 'Filter by role ID' })
  @IsOptional()
  @IsUUID(4)
  roleId?: string;

  @ApiPropertyOptional({
    enum: ['active', 'pending', 'disabled'],
    description: 'Filter by user status in tenant',
    example: 'active'
  })
  @IsOptional()
  @IsEnum(['active', 'pending', 'disabled'])
  status?: 'active' | 'pending' | 'disabled';

  @ApiPropertyOptional({ minimum: 1, default: 50, example: 25, description: 'Number of items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number;

  @ApiPropertyOptional({ minimum: 1, default: 1, example: 2, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;

  @ApiPropertyOptional({
    enum: ['name', 'email', 'createdAt', 'updatedAt'],
    default: 'createdAt',
    description: 'Field to sort by',
    example: 'name'
  })
  @IsOptional()
  @IsIn(['name', 'email', 'createdAt', 'updatedAt'])
  sortBy?: 'name' | 'email' | 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'desc',
    description: 'Sort order',
    example: 'asc'
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

