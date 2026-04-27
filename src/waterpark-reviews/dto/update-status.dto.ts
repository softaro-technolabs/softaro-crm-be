import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateReviewStatusDto {
  @ApiProperty({ enum: ['pending', 'approved', 'rejected'] })
  @IsEnum(['pending', 'approved', 'rejected'])
  status!: 'pending' | 'approved' | 'rejected';
}
