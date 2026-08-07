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
    description:
      'Optional. The tenant is resolved from the user’s own memberships, so this is only needed ' +
      'to pick a specific workspace when the user belongs to more than one. Accepts a slug or UUID.',
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
