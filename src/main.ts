import { ValidationPipe } from '@nestjs/common';
import * as crypto from 'crypto';

// Polyfill for Node.js 18 environments where 'crypto' is not a global variable
if (!global.crypto) {
  (global as any).crypto = crypto;
}
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));

  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  // ─── Security Headers ────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: isProduction
        ? {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            scriptSrc: ["'self'"],
          },
        }
        : false,
    })
  );

  // ─── CORS (origin-scoped) ────────────────────────────────────────────────────
  const allowedOrigins = configService
    .get<string>('ALLOWED_ORIGINS', 'http://localhost:5174,http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  // Wildcard subdomain patterns — entries starting with "*." are treated as
  // suffix matches so any subdomain is allowed automatically, e.g.
  //   *.softarotechnolabs.com  →  rk-group.softarotechnolabs.com  ✓
  //   *.softarotechnolabs.local →  rk-group.softarotechnolabs.local ✓
  const wildcardSuffixes = allowedOrigins
    .filter((o) => o.startsWith('*.'))
    .map((o) => o.slice(1)); // keep the leading dot: ".softarotechnolabs.com"

  const isOriginAllowed = (origin: string): boolean => {
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return true;

    // Check wildcard suffix patterns (scheme + optional port aware)
    for (const suffix of wildcardSuffixes) {
      try {
        const url = new URL(origin);
        // suffix is like ".softarotechnolabs.com"; host must end with it
        if (url.hostname.endsWith(suffix) || url.host.endsWith(suffix)) return true;
      } catch { /* invalid origin — fall through */ }
    }
    return false;
  };

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  });

  // ─── Validation ──────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    })
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── Swagger (only in non-production) ────────────────────────────────────────
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Softaro CRM API')
      .setDescription('Multi-tenant SaaS CRM backend API documentation')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'bearer'
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = configService.get<number>('port', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Server is running on port ${port} [${isProduction ? 'production' : 'development'}]`);
}

bootstrap();
