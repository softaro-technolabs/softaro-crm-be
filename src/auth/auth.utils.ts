import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export type AuthJwtPayload = {
  sub: string;
  name: string;
  tenant_id: string | null;
  role_id: string | null;
  role_global: 'super_admin' | 'normal';
  permissions: string[];
};

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) { }

  signAccessToken(payload: AuthJwtPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn', '1h')
    });
  }

  signRefreshToken(payload: Pick<AuthJwtPayload, 'sub' | 'tenant_id' | 'role_id' | 'role_global'>) {
    const refreshSecret =
      this.configService.get<string>('jwt.refreshSecret') ??
      this.configService.get<string>('jwt.secret') ??
      'change-me-refresh';
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';

    return this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn
    });
  }

  verifyRefreshToken(token: string) {
    const refreshSecret =
      this.configService.get<string>('jwt.refreshSecret') ??
      this.configService.get<string>('jwt.secret') ??
      'change-me-refresh';

    return this.jwtService.verifyAsync<
      Pick<AuthJwtPayload, 'sub' | 'tenant_id' | 'role_id' | 'role_global'>
    >(token, {
      secret: refreshSecret
    });
  }
}

