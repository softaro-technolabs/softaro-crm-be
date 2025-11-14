import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'users.read', description: 'Permission code (format: module.action)' })
  @IsString()
  @MinLength(3)
  code!: string;

  @ApiProperty({ example: 'users', description: 'Module slug this permission belongs to' })
  @IsString()
  @MinLength(2)
  moduleSlug!: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: 'users.read', description: 'Permission code' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  code?: string;

  @ApiPropertyOptional({ example: 'users', description: 'Module slug' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  moduleSlug?: string;
}

export class GenerateModulePermissionsDto {
  @ApiProperty({ example: 'users', description: 'Module slug to generate permissions for' })
  @IsString()
  @MinLength(2)
  moduleSlug!: string;
}


