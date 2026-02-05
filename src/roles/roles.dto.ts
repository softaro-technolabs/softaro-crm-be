import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RolePermissionAssignmentDto {
  @ApiProperty({ example: 'uuid-of-permission', description: 'ID of the master permission' })
  @IsString()
  permissionId!: string;

  @ApiProperty({ example: 'leads', description: 'Module slug to apply this permission to' })
  @IsString()
  @MinLength(2)
  moduleSlug!: string;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'Manager' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @ApiPropertyOptional({
    type: [RolePermissionAssignmentDto],
    description: 'Array of permissions with module assignments'
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionAssignmentDto)
  permissions?: RolePermissionAssignmentDto[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ example: 'Manager Updated' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @ApiPropertyOptional({
    type: [RolePermissionAssignmentDto],
    description: 'Array of permissions with module assignments'
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionAssignmentDto)
  permissions?: RolePermissionAssignmentDto[];
}





