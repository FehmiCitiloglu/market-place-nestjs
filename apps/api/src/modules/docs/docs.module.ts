import { Module, type Provider } from '@nestjs/common';
import type { AppConfig } from '@mercato/config';
import { buildOpenApiDocument } from '@mercato/contracts';
import { APP_CONFIG, OPENAPI_DOCUMENT } from '../../app.tokens.js';
import { DocsController } from './docs.controller.js';
import { readPackageVersion } from './package-version.js';

const openApiProvider: Provider = {
  provide: OPENAPI_DOCUMENT,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): unknown =>
    buildOpenApiDocument({ version: readPackageVersion(), environment: config.env }),
};

@Module({
  controllers: [DocsController],
  providers: [openApiProvider],
})
export class DocsModule {}
