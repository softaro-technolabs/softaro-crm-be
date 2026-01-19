import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { KeepAliveService } from './keep-alive.service';

@Module({
  imports: [ConfigModule],
  providers: [KeepAliveService]
})
export class KeepAliveModule {}

