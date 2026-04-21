import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional, IsInt } from 'class-validator';

export class CreateModuleDto {
  @ApiProperty({ example: 'users', description: 'Unique slug for the module' })
  @IsString()
  @MinLength(2)
  slug!: string;

  @ApiProperty({ example: 'Users Management', description: 'Display name of the module' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: '/users', description: 'Default route for the module' })
  @IsString()
  @MinLength(1)
  defaultRoute!: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'ID of the parent module' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ example: 0, description: 'Display order of the module' })
  @IsOptional()
  @IsInt()
  sequence?: number;
}

export class UpdateModuleDto {
  @ApiPropertyOptional({ example: 'Users Management', description: 'Display name of the module' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: '/users', description: 'Default route for the module' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  defaultRoute?: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'ID of the parent module' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({ example: 0, description: 'Display order of the module' })
  @IsOptional()
  @IsInt()
  sequence?: number;
}


