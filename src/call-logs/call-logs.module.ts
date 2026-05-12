import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [CallLogsController],
  providers: [CallLogsService],
  exports: [CallLogsService]
})
export class CallLogsModule {}
