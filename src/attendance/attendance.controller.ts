import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AttendanceService } from './attendance.service';
import { AttendanceReportService } from './attendance-report.service';
import {
  CheckInDto,
  CheckOutDto,
  LocationPingDto,
  UpdateAttendanceSettingsDto,
  CreateAttendanceLocationDto,
  UpdateAttendanceLocationDto,
  AttendanceLocationsQueryDto,
  AttendanceRecordsQueryDto,
  AttendanceReportQueryDto,
  RegularizeAttendanceDto,
  CreateLeaveRequestDto,
  ReviewLeaveRequestDto,
  CancelLeaveRequestDto,
  LeaveRequestsQueryDto,
  UpsertLeaveBalanceDto,
} from './attendance.dto';

@ApiTags('Attendance')
@Controller('tenants/:tenantId/attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly reportService: AttendanceReportService,
  ) {}

  // ── Settings ─────────────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Get attendance settings (admin)' })
  async getSettings(@Param('tenantId') tenantId: string) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.getSettingsForActor(tenantId, actor);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update attendance settings (admin)' })
  async updateSettings(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateAttendanceSettingsDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.updateSettings(tenantId, actor, dto);
  }

  // ── Locations ────────────────────────────────────────────────────────────

  @Get('locations')
  @ApiOperation({ summary: 'List geo-fenced locations' })
  async getLocations(
    @Param('tenantId') tenantId: string,
    @Query() query: AttendanceLocationsQueryDto,
  ) {
    await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.getLocations(tenantId, query.type, query.activeOnly !== 'false');
  }

  @Post('locations')
  @ApiOperation({ summary: 'Create a geo-fenced location (admin)' })
  async createLocation(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateAttendanceLocationDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.createLocation(tenantId, actor, dto);
  }

  @Patch('locations/:locationId')
  @ApiOperation({ summary: 'Update a geo-fenced location (admin)' })
  async updateLocation(
    @Param('tenantId') tenantId: string,
    @Param('locationId') locationId: string,
    @Body() dto: UpdateAttendanceLocationDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.updateLocation(tenantId, actor, locationId, dto);
  }

  @Delete('locations/:locationId')
  @ApiOperation({ summary: 'Deactivate a geo-fenced location (admin)' })
  async deleteLocation(
    @Param('tenantId') tenantId: string,
    @Param('locationId') locationId: string,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.deactivateLocation(tenantId, actor, locationId);
  }

  // ── Check-in / Check-out (Agent-facing) ──────────────────────────────────

  @Post('check-in')
  @ApiOperation({ summary: 'Agent check-in with GPS location' })
  async checkIn(@Param('tenantId') tenantId: string, @Body() dto: CheckInDto) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.checkIn(tenantId, actor.userId, dto);
  }

  @Post('check-out')
  @ApiOperation({ summary: 'Agent check-out with GPS location' })
  async checkOut(@Param('tenantId') tenantId: string, @Body() dto: CheckOutDto) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.checkOut(tenantId, actor.userId, dto);
  }

  @Get('my-status')
  @ApiOperation({ summary: 'Get current agent attendance status' })
  async getMyStatus(@Param('tenantId') tenantId: string) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.getMyStatus(tenantId, actor.userId);
  }

  @Post('location-ping')
  @ApiOperation({ summary: 'Periodic GPS ping while checked in' })
  async locationPing(@Param('tenantId') tenantId: string, @Body() dto: LocationPingDto) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.locationPing(tenantId, actor.userId, dto);
  }

  // ── Records (Admin + Self) ───────────────────────────────────────────────

  @Get('records')
  @ApiOperation({ summary: 'List attendance records — non-admins see only their own' })
  async getRecords(
    @Param('tenantId') tenantId: string,
    @Query() query: AttendanceRecordsQueryDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.getRecords(tenantId, actor, query);
  }

  @Get('records/:recordId')
  @ApiOperation({ summary: 'Get attendance record detail with check-ins' })
  async getRecordDetail(
    @Param('tenantId') tenantId: string,
    @Param('recordId') recordId: string,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.getRecordDetail(tenantId, actor, recordId);
  }

  @Patch('records/:recordId')
  @ApiOperation({ summary: 'Regularize attendance record (admin)' })
  async regularizeRecord(
    @Param('tenantId') tenantId: string,
    @Param('recordId') recordId: string,
    @Body() dto: RegularizeAttendanceDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.regularizeRecord(tenantId, actor, recordId, dto);
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  @Get('reports/daily')
  @ApiOperation({ summary: 'Daily attendance summary for all users (admin)' })
  async getDailySummary(
    @Param('tenantId') tenantId: string,
    @Query('date') date?: string,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    const settings = await this.attendanceService.getSettings(tenantId);
    return this.attendanceService.getDailySummary(
      tenantId,
      actor,
      date || this.attendanceService.todayFor(settings),
    );
  }

  @Get('reports/monthly')
  @ApiOperation({ summary: 'Monthly attendance summary — non-admins see only their own' })
  async getMonthlySummary(
    @Param('tenantId') tenantId: string,
    @Query('month') month?: string,
    @Query('userId') userId?: string,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    const settings = await this.attendanceService.getSettings(tenantId);
    const resolvedMonth = month || this.attendanceService.todayFor(settings).slice(0, 7);
    return this.attendanceService.getMonthlySummary(tenantId, actor, resolvedMonth, userId);
  }

  // ── Team report ──────────────────────────────────────────────────────────
  // NOTE: `reports/export` is declared before the other report routes so the
  // literal path is never shadowed.

  @Get('reports/export')
  @ApiOperation({ summary: 'Download the attendance report as a styled Excel workbook' })
  async exportReport(
    @Param('tenantId') tenantId: string,
    @Query() query: AttendanceReportQueryDto,
    @Res() res: Response,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    const buffer = await this.reportService.exportToXlsx(tenantId, actor, query);
    const label = query.month ?? `${query.startDate ?? 'start'}_${query.endDate ?? 'today'}`;
    const filename = `attendance_report_${label}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('reports/team')
  @ApiOperation({ summary: 'Per-agent attendance totals for a date range — non-admins see only their own' })
  async getTeamReport(
    @Param('tenantId') tenantId: string,
    @Query() query: AttendanceReportQueryDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.reportService.getTeamReport(tenantId, actor, query);
  }

  @Get('reports/register')
  @ApiOperation({ summary: 'Day-by-day attendance register (agent × date grid), max 62 days' })
  async getRegister(
    @Param('tenantId') tenantId: string,
    @Query() query: AttendanceReportQueryDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.reportService.getRegister(tenantId, actor, query);
  }

  @Get('live-map')
  @ApiOperation({ summary: 'Currently checked-in agents with locations (admin)' })
  async getLiveMap(@Param('tenantId') tenantId: string) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.getLiveMap(tenantId, actor);
  }

  @Post('auto-checkout/run')
  @ApiOperation({ summary: 'Close forgotten check-ins for this tenant now (admin)' })
  async runAutoCheckout(@Param('tenantId') tenantId: string) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.triggerAutoCheckout(tenantId, actor);
  }

  // ── Leave Management ─────────────────────────────────────────────────────
  // NOTE: `leaves/balances` is declared before `leaves/:leaveId` so the literal
  // path is matched first.

  @Get('leaves/balances')
  @ApiOperation({ summary: 'Get leave balances — non-admins see only their own' })
  async getLeaveBalances(
    @Param('tenantId') tenantId: string,
    @Query('userId') userId?: string,
    @Query('year') year?: string,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    const parsedYear = year ? Number(year) : undefined;
    return this.attendanceService.getLeaveBalances(
      tenantId,
      actor,
      userId,
      Number.isFinite(parsedYear) ? parsedYear : undefined,
    );
  }

  @Post('leaves/balances')
  @ApiOperation({ summary: 'Allocate or update a leave balance (admin)' })
  async upsertLeaveBalance(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpsertLeaveBalanceDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.upsertLeaveBalance(tenantId, actor, dto);
  }

  @Post('leaves')
  @ApiOperation({ summary: 'Submit a leave request' })
  async createLeaveRequest(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.createLeaveRequest(tenantId, actor, dto);
  }

  @Get('leaves')
  @ApiOperation({ summary: 'List leave requests — non-admins see only their own' })
  async getLeaveRequests(
    @Param('tenantId') tenantId: string,
    @Query() query: LeaveRequestsQueryDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.getLeaveRequests(tenantId, actor, query);
  }

  @Patch('leaves/:leaveId')
  @ApiOperation({ summary: 'Approve/reject a leave request (admin)' })
  async reviewLeaveRequest(
    @Param('tenantId') tenantId: string,
    @Param('leaveId') leaveId: string,
    @Body() dto: ReviewLeaveRequestDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.reviewLeaveRequest(tenantId, leaveId, actor, dto);
  }

  @Post('leaves/:leaveId/cancel')
  @ApiOperation({ summary: 'Cancel your own pending leave request (admins may cancel approved ones)' })
  async cancelLeaveRequest(
    @Param('tenantId') tenantId: string,
    @Param('leaveId') leaveId: string,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    const actor = await this.attendanceService.resolveActor(tenantId);
    return this.attendanceService.cancelLeaveRequest(tenantId, leaveId, actor, dto.reason);
  }
}
