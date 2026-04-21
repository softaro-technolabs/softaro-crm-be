import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', 'env.example']
    }),
    ScheduleModule.forRoot(),
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
    SiteVisitsModule
  ],
  providers: [MigrationService, DatabaseSyncService, TenantMiddleware]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
