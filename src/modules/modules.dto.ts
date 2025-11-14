import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional } from 'class-validator';

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
}


