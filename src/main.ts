import { ValidationPipe } from '@nestjs/common';
import * as crypto from 'crypto';

// Polyfill for Node.js 18 environments where 'crypto' is not a global variable
if (!global.crypto) {
  (global as any).crypto = crypto;
}
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Softaro CRM API')
    .setDescription('Multi-tenant SaaS CRM backend API documentation')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      'bearer'
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true }
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3000);

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Server is running on port ${port}`);
}

bootstrap();

