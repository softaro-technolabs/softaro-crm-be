import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import {
  BookingListQueryDto,
  CreateBookingDto,
  UpdateBookingDto
} from './bookings.dto';
import { BookingsService } from './bookings.service';

@ApiTags('Bookings')
@Controller('tenants/:tenantId/bookings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List bookings with pagination and filters' })
  async list(@Param('tenantId') tenantId: string, @Query() query: BookingListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.bookingsService.listBookings(tenantId, query);
  }

  @Get(':bookingId')
  @ApiOperation({ summary: 'Get booking details' })
  async detail(@Param('tenantId') tenantId: string, @Param('bookingId') bookingId: string) {
    this.verifyTenantAccess(tenantId);
    return this.bookingsService.getBooking(tenantId, bookingId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a booking for a deal/property unit' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateBookingDto) {
    this.verifyTenantAccess(tenantId);
    return this.bookingsService.createBooking(tenantId, dto, this.requestContext.getUserId());
  }

  @Put(':bookingId')
  @ApiOperation({ summary: 'Update booking status and payment progress' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: UpdateBookingDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.bookingsService.updateBooking(tenantId, bookingId, dto, this.requestContext.getUserId());
  }

  @Delete(':bookingId')
  @ApiOperation({ summary: 'Delete booking and release inventory linkage' })
  async delete(@Param('tenantId') tenantId: string, @Param('bookingId') bookingId: string) {
    this.verifyTenantAccess(tenantId);
    return this.bookingsService.deleteBooking(tenantId, bookingId, this.requestContext.getUserId());
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) {
      throw new ForbiddenException('User context not found');
    }
    if (user.role_global === 'super_admin') {
      return;
    }
    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
  }
}
