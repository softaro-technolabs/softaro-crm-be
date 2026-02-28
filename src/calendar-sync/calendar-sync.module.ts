import { Module } from '@nestjs/common';
import { CalendarAuthController } from './calendar-auth.controller';
import { CalendarTokenService } from './calendar-token.service';
import { CalendarSyncService } from './calendar-sync.service';

@Module({
    controllers: [CalendarAuthController],
    providers: [CalendarTokenService, CalendarSyncService],
    exports: [CalendarTokenService, CalendarSyncService]
})
export class CalendarSyncModule { }
