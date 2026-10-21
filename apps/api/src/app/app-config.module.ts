import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '@mercato/config';
import { APP_CONFIG } from '../app.tokens.js';

/** Supplies validated runtime configuration to every module. */
@Global()
@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
