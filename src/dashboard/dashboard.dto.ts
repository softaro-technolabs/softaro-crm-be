import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  period?: 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'year' | 'custom';
}

export class KeyMetricDto {
  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: string | number;

  @ApiPropertyOptional()
  change?: string;

  @ApiPropertyOptional()
  trend?: 'up' | 'down' | 'neutral';
}

export class LeadSourceDto {
  @ApiProperty()
  source!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  percentage!: number;
}

export class AgentPerformanceDto {
  @ApiProperty()
  agentName!: string;

  @ApiProperty()
  leadCount!: number;

  @ApiProperty()
  conversionRate!: number;
}

export class ProjectInterestDto {
  @ApiProperty()
  projectName!: string;

  @ApiProperty()
  leadCount!: number;
}

export class DashboardSummaryDto {
  @ApiProperty()
  totalLeads!: number;

  @ApiProperty()
  activeDeals!: number;

  @ApiProperty()
  totalBookingsMonth!: number;

  @ApiProperty()
  revenueCurrentMonth!: number;

  @ApiProperty()
  availableUnits!: number;
}

export class LeadFunnelStepDto {
  @ApiProperty()
  statusName!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty()
  color!: string;
}

export class LeadTrendPointDto {
  @ApiProperty()
  date!: string;

  @ApiProperty()
  count!: number;
}

export class DashboardResponseDto {
  @ApiProperty()
  summary!: DashboardSummaryDto;

  @ApiProperty({ type: [LeadFunnelStepDto] })
  funnel!: LeadFunnelStepDto[];

  @ApiProperty({ type: [LeadTrendPointDto] })
  trends!: LeadTrendPointDto[];

  @ApiProperty({ type: [LeadSourceDto] })
  sources!: LeadSourceDto[];

  @ApiProperty({ type: [AgentPerformanceDto] })
  agentPerformance!: AgentPerformanceDto[];

  @ApiProperty({ type: [ProjectInterestDto] })
  projectInterests!: ProjectInterestDto[];

  @ApiProperty()
  recentLeads!: any[];
}
