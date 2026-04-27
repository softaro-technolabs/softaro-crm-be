import { Module } from '@nestjs/common';
import { WaterparkReviewsService } from './waterpark-reviews.service';
import { WaterparkReviewsController } from './waterpark-reviews.controller';

@Module({
  controllers: [WaterparkReviewsController],
  providers: [WaterparkReviewsService],
  exports: [WaterparkReviewsService],
})
export class WaterparkReviewsModule {}
