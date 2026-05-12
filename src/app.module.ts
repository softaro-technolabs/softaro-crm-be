import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';

import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import configuration from './config/configuration';
import { DatabaseSyncService } from './database/database-sync.service';
import { DatabaseModule } from './database/database.module';
import { MigrationService } from './database/migration.service';
import { ChatModule } from './chat/chat.module';
import { LeadsModule } from './leads/leads.module';
import { KeepAliveModule } from './keep-alive/keep-alive.module';
import { ModulesModule } from './modules/modules.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PropertiesModule } from './properties/properties.module';
import { RolesModule } from './roles/roles.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { CalendarSyncModule } from './calendar-sync/calendar-sync.module';
import { QuotationsModule } from './quotations/quotations.module';
import { DealsModule } from './deals/deals.module';
import { BookingsModule } from './bookings/bookings.module';
import { MetaAdsModule } from './meta-ads/meta-ads.module';
import { GoogleAdsModule } from './google-ads/google-ads.module';
import { ContactsModule } from './contacts/contacts.module';

import { DashboardModule } from './dashboard/dashboard.module';
import { SiteVisitsModule } from './site-visits/site-visits.module';
import { WaterparkReviewsModule } from './waterpark-reviews/waterpark-reviews.module';
import { AutomationModule } from './automation/automation.module';
import { HealthController } from './health/health.controller';
import { CommissionsModule } from './commissions/commissions.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { CallLogsModule } from './call-logs/call-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', 'env.example']
    }),
    ScheduleModule.forRoot(),
    // Rate limiting: global guard applied, public endpoints get stricter via @Throttle()
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20, // 20 req/s burst
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 300, // 300 req/min
      },
    ]),
    TerminusModule,
    DatabaseModule,
    CommonModule,
    AuthModule,
    TenantsModule,
    RolesModule,
    UsersModule,
    PermissionsModule,
    ModulesModule,
    LeadsModule,
    PropertiesModule,
    KeepAliveModule,
    ChatModule,
    NotificationsModule,
    WhatsappModule,
    CalendarSyncModule,
    QuotationsModule,
    DealsModule,
    BookingsModule,
    MetaAdsModule,
    GoogleAdsModule,
    ContactsModule,
    DashboardModule,
    SiteVisitsModule,
    WaterparkReviewsModule,
    AutomationModule,
    CommissionsModule,
    AuditLogsModule,
    CallLogsModule,
  ],
  providers: [
    MigrationService,
    DatabaseSyncService,
    TenantMiddleware,
    // Apply rate-limiting globally; individual controllers can override with @SkipThrottle
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
