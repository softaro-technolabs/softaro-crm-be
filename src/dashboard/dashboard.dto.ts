import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty()
  recentLeads!: any[]; // We can refine this later
}
