import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';

import { ChannelPartnersController } from './channel-partners.controller';
import { ChannelPartnersService } from './channel-partners.service';
import { CpPortalController } from './cp-portal.controller';
import { CpPortalService } from './cp-portal.service';

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn', '1h') }
      })
    })
  ],
  controllers: [ChannelPartnersController, CpPortalController],
  providers: [ChannelPartnersService, CpPortalService],
  exports: [ChannelPartnersService]
})
export class ChannelPartnersModule {}
