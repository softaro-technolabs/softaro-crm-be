import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, IsIn } from 'class-validator';
import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export class CreatePermissionDto {
  @ApiProperty({ example: 'read', description: 'Permission data action (e.g. read, write, create)' })
  @IsString()
  @MinLength(2)
  action!: string;

  @ApiPropertyOptional({ example: 'Read access', description: 'Description of the permission' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: 'read', description: 'Permission action' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  action?: string;

  @ApiPropertyOptional({ example: 'Read access', description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PermissionListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({
    enum: ['action'],
    default: 'action',
    description: 'Field to sort by',
    example: 'action'
  })
  @IsOptional()
  @IsIn(['action'])
  override sortBy?: 'action';
}


