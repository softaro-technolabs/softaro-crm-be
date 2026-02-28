import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsPositive } from 'class-validator';

export class NotificationListQueryDto {
    @ApiPropertyOptional({ description: 'Filter by unread status' })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    isRead?: boolean;

    @ApiPropertyOptional({ minimum: 1, default: 50 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsPositive()
    limit?: number;

    @ApiPropertyOptional({ minimum: 1, default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @IsPositive()
    page?: number;
}
