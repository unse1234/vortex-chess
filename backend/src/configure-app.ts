import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { json } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Environment } from './config/environment';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { RealtimeIoAdapter } from './modules/realtime/realtime-io.adapter';
export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService<Environment, true>);
  app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  const hops = config.get('TRUST_PROXY_HOPS', { infer: true });
  if (hops) app.set('trust proxy', hops);
  app.use(helmet());
  app.use(json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use(
    (
      _req: unknown,
      res: { setHeader: (key: string, value: string) => void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin: (origin, callback) =>
      callback(null, !!origin && origins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Vortix-CSRF'],
    maxAge: 600,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, origins));
  app.enableShutdownHooks();
}
