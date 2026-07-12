import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { getAllowedOrigins, getCorsOptions } from './common/config/cors.config';
import { API_NAME, AUTH_COOKIE } from './common/constants';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = getAllowedOrigins(config);
  app.enableCors(getCorsOptions(config));

  const swaggerConfig = new DocumentBuilder()
    .setTitle(API_NAME)
    .setDescription(
      'BAYK Tracker REST API — yarış, parkur, tekne ve GPS senkronizasyonu. ' +
        `Kimlik doğrulama: \`${AUTH_COOKIE}\` httpOnly cookie.`,
    )
    .setVersion('0.2.0')
    .addCookieAuth(AUTH_COOKIE)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(config.get('PORT', 5174));
  await app.listen(port, '0.0.0.0');

  const apiUrl = `http://localhost:${port}/api`;
  const docsUrl = `http://localhost:${port}/api/docs`;
  const logger = new Logger('Bootstrap');

  logger.log(`API çalışıyor: ${apiUrl}`);
  logger.log(`Swagger dokümantasyon: ${docsUrl}`);
  logger.log(`CORS izinli origin'ler: ${allowedOrigins.join(', ')}`);
}

bootstrap();
