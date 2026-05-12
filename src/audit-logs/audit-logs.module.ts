import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService]
})
export class AuditLogsModule {}
