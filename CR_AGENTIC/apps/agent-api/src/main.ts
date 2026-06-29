import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createLogger } from '@cr-agentic/observability';

async function bootstrap() {
  const logger = createLogger('agent-api');
  const app = await NestFactory.create(AppModule, { logger: false });

  app.setGlobalPrefix('api/v1/agent');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Course Rep Agent API')
    .setDescription('Academic Agent orchestration API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs/agent', app, SwaggerModule.createDocument(app, config));

  const port = process.env.AGENT_API_PORT ?? 3100;
  await app.listen(port);
  logger.info({ port }, 'Agent API started');
}

bootstrap();
