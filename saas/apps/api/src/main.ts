import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { type NestFastifyApplication, FastifyAdapter } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 1_048_576 }),
    { logger: ["error", "warn", "log"], rawBody: true },
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Tenant-ID", "X-Trace-ID"],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("w3StreamItUp API")
    .setDescription("w3StreamItUp SaaS Platform API")
    .setVersion("2.0.0")
    .addBearerAuth()
    .addServer("/", "Current server")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("/docs", app, document);

  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, "0.0.0.0");
  logger.log(`API listening on port ${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
