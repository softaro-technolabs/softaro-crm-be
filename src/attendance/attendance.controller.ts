import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { AttendanceService } from './attendance.service';
import {
  CheckInDto,
  CheckOutDto,
  LocationPingDto,
  UpdateAttendanceSettingsDto,
  CreateAttendanceLocationDto,
  UpdateAttendanceLocationDto,
  AttendanceRecordsQueryDto,
  RegularizeAttendanceDto,
  CreateLeaveRequestDto,
  ReviewLeaveRequestDto,
  LeaveRequestsQueryDto,
} from './attendance.dto';

@ApiTags('Attendance')
@Controller('tenants/:tenantId/attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly requestContext: RequestContextService,
  ) { }

  private getTenantAndUser(tenantId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    if (!userId) throw new Error('User context not found');
    return { tenantId, userId };
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Get attendance settings' })
  async getSettings(@Param('tenantId') tenantId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.getSettings(tenantId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update attendance settings' })
  async updateSettings(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateAttendanceSettingsDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.updateSettings(tenantId, dto);
  }

  // ── Locations ────────────────────────────────────────────────────────────

  @Get('locations')
  @ApiOperation({ summary: 'List geo-fenced locations' })
  async getLocations(
    @Param('tenantId') tenantId: string,
    @Query('type') type?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.getLocations(tenantId, type, activeOnly !== 'false');
  }

  @Post('locations')
  @ApiOperation({ summary: 'Create a geo-fenced location' })
  async createLocation(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateAttendanceLocationDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.createLocation(tenantId, dto);
  }

  @Patch('locations/:locationId')
  @ApiOperation({ summary: 'Update a geo-fenced location' })
  async updateLocation(
    @Param('tenantId') tenantId: string,
    @Param('locationId') locationId: string,
    @Body() dto: UpdateAttendanceLocationDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.updateLocation(tenantId, locationId, dto);
  }

  // ── Check-in / Check-out (Agent-facing) ──────────────────────────────────

  @Post('check-in')
  @ApiOperation({ summary: 'Agent check-in with GPS location' })
  async checkIn(@Param('tenantId') tenantId: string, @Body() dto: CheckInDto) {
    const { userId } = this.getTenantAndUser(tenantId);
    return this.attendanceService.checkIn(tenantId, userId, dto);
  }

  @Post('check-out')
  @ApiOperation({ summary: 'Agent check-out with GPS location' })
  async checkOut(@Param('tenantId') tenantId: string, @Body() dto: CheckOutDto) {
    const { userId } = this.getTenantAndUser(tenantId);
    return this.attendanceService.checkOut(tenantId, userId, dto);
  }

  @Get('my-status')
  @ApiOperation({ summary: 'Get current agent attendance status' })
  async getMyStatus(@Param('tenantId') tenantId: string) {
    const { userId } = this.getTenantAndUser(tenantId);
    return this.attendanceService.getMyStatus(tenantId, userId);
  }

  @Post('location-ping')
  @ApiOperation({ summary: 'Periodic GPS ping while checked in' })
  async locationPing(@Param('tenantId') tenantId: string, @Body() dto: LocationPingDto) {
    const { userId } = this.getTenantAndUser(tenantId);
    return this.attendanceService.locationPing(tenantId, userId, dto);
  }

  // ── Records (Admin + Self) ───────────────────────────────────────────────

  @Get('records')
  @ApiOperation({ summary: 'List attendance records' })
  async getRecords(
    @Param('tenantId') tenantId: string,
    @Query() query: AttendanceRecordsQueryDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.getRecords(tenantId, query);
  }

  @Get('records/:recordId')
  @ApiOperation({ summary: 'Get attendance record detail with check-ins' })
  async getRecordDetail(
    @Param('tenantId') tenantId: string,
    @Param('recordId') recordId: string,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.getRecordDetail(tenantId, recordId);
  }

  @Patch('records/:recordId')
  @ApiOperation({ summary: 'Regularize attendance record (admin)' })
  async regularizeRecord(
    @Param('tenantId') tenantId: string,
    @Param('recordId') recordId: string,
    @Body() dto: RegularizeAttendanceDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.regularizeRecord(tenantId, recordId, dto);
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  @Get('reports/daily')
  @ApiOperation({ summary: 'Daily attendance summary for all users' })
  async getDailySummary(
    @Param('tenantId') tenantId: string,
    @Query('date') date?: string,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.getDailySummary(tenantId, date || new Date().toISOString().split('T')[0]);
  }

  @Get('reports/monthly')
  @ApiOperation({ summary: 'Monthly attendance summary' })
  async getMonthlySummary(
    @Param('tenantId') tenantId: string,
    @Query('month') month?: string,
    @Query('userId') userId?: string,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const m = month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    return this.attendanceService.getMonthlySummary(tenantId, m, userId);
  }

  @Get('live-map')
  @ApiOperation({ summary: 'Currently checked-in agents with locations' })
  async getLiveMap(@Param('tenantId') tenantId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.getLiveMap(tenantId);
  }

  // ── Leave Management ─────────────────────────────────────────────────────

  @Post('leaves')
  @ApiOperation({ summary: 'Submit a leave request' })
  async createLeaveRequest(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    const { userId } = this.getTenantAndUser(tenantId);
    return this.attendanceService.createLeaveRequest(tenantId, userId, dto);
  }

  @Get('leaves')
  @ApiOperation({ summary: 'List leave requests' })
  async getLeaveRequests(
    @Param('tenantId') tenantId: string,
    @Query() query: LeaveRequestsQueryDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.attendanceService.getLeaveRequests(tenantId, query);
  }

  @Patch('leaves/:leaveId')
  @ApiOperation({ summary: 'Approve/reject a leave request' })
  async reviewLeaveRequest(
    @Param('tenantId') tenantId: string,
    @Param('leaveId') leaveId: string,
    @Body() dto: ReviewLeaveRequestDto,
  ) {
    const { userId } = this.getTenantAndUser(tenantId);
    return this.attendanceService.reviewLeaveRequest(tenantId, leaveId, userId, dto);
  }

  @Get('leaves/balances')
  @ApiOperation({ summary: 'Get leave balances for a user' })
  async getLeaveBalances(
    @Param('tenantId') tenantId: string,
    @Query('userId') userId?: string,
    @Query('year') year?: string,
  ) {
    const ctx = this.getTenantAndUser(tenantId);
    const targetUserId = userId || ctx.userId;
    return this.attendanceService.getLeaveBalances(tenantId, targetUserId, year ? parseInt(year) : undefined);
  }
}

