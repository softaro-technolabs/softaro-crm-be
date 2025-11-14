import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

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





