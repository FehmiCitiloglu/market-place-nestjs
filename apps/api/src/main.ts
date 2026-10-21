import 'reflect-metadata';
import {
  ConfigValidationError,
  loadConfig,
  loadEnvFileIfPresent,
  redactConfig,
} from '@mercato/config';
import { createApp } from './app/bootstrap.js';

async function bootstrap(): Promise<void> {
  loadEnvFileIfPresent();

  const config = loadConfig();
  const { app, fastify } = await createApp(config);

  await app.listen(config.api.port, config.api.host);
  fastify.log.info(
    { config: redactConfig(config), url: `http://${config.api.host}:${String(config.api.port)}` },
    'mercato-api started',
  );

  const shutdown = (signal: string) => {
    fastify.log.info({ signal }, 'shutdown signal received');
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error: unknown) => {
  if (error instanceof ConfigValidationError) {
    console.error(`[mercato-api] ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`[mercato-api] fatal startup error: ${error.stack ?? error.message}`);
  } else {
    console.error('[mercato-api] fatal startup error', error);
  }
  process.exitCode = 1;
});
