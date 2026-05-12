import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@aksharrealty.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'Akshar@123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    description: 'Tenant slug or UUID. Optional for super admin (can login without it). Required for normal users.',
    example: 'akshar-realty'
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'agent@realty.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description: 'Tenant slug — required for non-super-admin accounts',
    example: 'akshar-realty'
  })
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received in the reset-password email' })
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 8, example: 'NewPass@123' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class CreateSuperAdminDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'StrongPass!123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Super Admin' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  phone?: string;
}
