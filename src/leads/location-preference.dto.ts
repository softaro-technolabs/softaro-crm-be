import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class LocationPointDto {
  @ApiProperty({ example: 'Indiranagar, Bengaluru' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '12.9716' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: '77.5946' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 'osm_123456789' })
  @IsOptional()
  @IsString()
  osmId?: string;

  @ApiPropertyOptional({ description: 'Coverage radius in KM for agents', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  radiusKm?: number;
}
