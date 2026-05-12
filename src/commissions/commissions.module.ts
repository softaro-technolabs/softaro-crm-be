import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService]
})
export class CommissionsModule {}
