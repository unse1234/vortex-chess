import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment';
import { CHESS_ENGINE_PROVIDER } from './engine.types';
import { EngineMetrics } from './engine-metrics';
import { EnginesService } from './engines.service';
import { HttpEngineAdapter } from './http/http-engine.adapter';

/**
 * Engine boundary. The provider is the HTTP adapter for the configured engine
 * service, or absent when ENGINE_BASE_URL is unset (engine games disabled).
 * The browser never reaches the engine service; only this module does.
 */
@Module({
  providers: [
    {
      provide: CHESS_ENGINE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => {
        const baseUrl = config.get('ENGINE_BASE_URL', { infer: true });
        if (!baseUrl) return null;
        return new HttpEngineAdapter({
          baseUrl,
          maxSockets: config.get('ENGINE_MAX_CONCURRENT_SEARCHES', { infer: true }) + 1,
        });
      },
    },
    EngineMetrics,
    EnginesService,
  ],
  exports: [EnginesService, EngineMetrics],
})
export class EnginesModule {}
