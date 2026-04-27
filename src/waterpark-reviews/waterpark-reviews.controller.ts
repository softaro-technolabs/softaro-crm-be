import { 
  Controller, 
  Get, 
  Post, 
  Patch, 
  Delete, 
  Body, 
  Param, 
  Query, 
  Headers, 
  UnauthorizedException 
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiHeader } from '@nestjs/swagger';
import { WaterparkReviewsService } from './waterpark-reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewStatusDto } from './dto/update-status.dto';

@ApiTags('Waterpark Reviews')
@Controller('api/reviews')
export class WaterparkReviewsController {
  constructor(private readonly reviewsService: WaterparkReviewsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a new review' })
  create(@Body() createReviewDto: CreateReviewDto) {
    return this.reviewsService.create(createReviewDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all approved reviews' })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sort') sort?: string,
    @Query('min_rating') min_rating?: number,
  ) {
    return this.reviewsService.findAll({ page, limit, sort, min_rating });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Return aggregate stats' })
  getSummary() {
    return this.reviewsService.getSummary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single review by ID' })
  findOne(@Param('id') id: string) {
    return this.reviewsService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Admin only: update review status' })
  @ApiHeader({ name: 'x-admin-key', required: true })
  updateStatus(
    @Param('id') id: string,
    @Body() updateReviewStatusDto: UpdateReviewStatusDto,
    @Headers('x-admin-key') adminKey: string,
  ) {
    this.checkAdminKey(adminKey);
    return this.reviewsService.updateStatus(id, updateReviewStatusDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Admin only: delete a review' })
  @ApiHeader({ name: 'x-admin-key', required: true })
  remove(
    @Param('id') id: string,
    @Headers('x-admin-key') adminKey: string,
  ) {
    this.checkAdminKey(adminKey);
    return this.reviewsService.delete(id);
  }

  private checkAdminKey(key: string) {
    // We'll use the ADMIN_API_KEY from env, or a default for now
    const secretKey = process.env.ADMIN_API_KEY || 'admin123';
    if (!key || key !== secretKey) {
      throw new UnauthorizedException('Invalid or missing admin key');
    }
  }
}
