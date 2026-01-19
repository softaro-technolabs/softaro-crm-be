import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeepAliveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeepAliveService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const enabled = this.configService.get<boolean>('features.keepAlive.enabled', true);
    if (!enabled) {
      this.logger.log('Keep-alive is disabled');
      return;
    }

    const intervalMinutes = this.configService.get<number>('features.keepAlive.intervalMinutes', 10);
    const intervalMs = Math.max(1, intervalMinutes) * 60_000;
    const pingUrl = this.configService.get<string>('features.keepAlive.pingUrl', '').trim();

    this.timer = setInterval(() => {
      void this.tick(pingUrl);
    }, intervalMs);

    // Don't keep the event loop alive just for this timer
    this.timer.unref?.();

    this.logger.log(
      `Keep-alive scheduled every ${intervalMinutes} minutes${pingUrl ? ` (ping: ${pingUrl})` : ''}`
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(pingUrl: string) {
    const startedAt = Date.now();
    try {
      if (!pingUrl) {
        this.logger.debug('Keep-alive tick');
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch(pingUrl, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'user-agent': 'softaro-crm-keep-alive' }
        });
        this.logger.debug(`Keep-alive ping: ${res.status} (${Date.now() - startedAt}ms)`);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Keep-alive failed: ${msg}`);
    }
  }
}

