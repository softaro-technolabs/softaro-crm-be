import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from '../utils/request-context.service';

export type JwtPayload = {
  sub: string;
  tenant_id: string | null;
  role_id: string | null;
  role_global: 'super_admin' | 'normal';
  permissions: string[];
};

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService
  ) {}

  async use(req: Request & { tenantId?: string | null; user?: JwtPayload }, _res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();

    let decoded: JwtPayload | null = null;
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      try {
        decoded = await this.jwtService.verifyAsync<JwtPayload>(token, {
          secret: this.configService.get<string>('jwt.secret')
        });

        req.user = decoded;
        req.tenantId = decoded.tenant_id ?? null;
      } catch {
        decoded = null;
      }
    }

    this.requestContext.run(
      {
        requestId,
        tenantId: decoded?.tenant_id ?? null,
        userId: decoded?.sub ?? null,
        roleId: decoded?.role_id ?? null,
        permissions: decoded?.permissions ?? [],
        roleGlobal: decoded?.role_global ?? null
      },
      () => next()
    );
  }
}

