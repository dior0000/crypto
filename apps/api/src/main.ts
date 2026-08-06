import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

import { AppModule } from "./app.module";
import { AppErrorFilter } from "./common/errors/app-error.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AppErrorFilter());
  // Веб-дашборд (:5175 в dev) и side panel расширения (chrome-extension://<id>)
  // обращаются к API с другого origin — без этого браузер блокирует fetch/EventSource
  // ещё до того, как код увидит ответ.
  app.enableCors({
    origin: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  const config = app.get(ConfigService);
  const port = config.get<number>("PORT") ?? 3000;
  await app.listen(port);
}

void bootstrap();
