import { Controller, Get, Inject, NotFoundException, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AppConfig } from '@mercato/config';
import { APP_CONFIG, OPENAPI_DOCUMENT } from '../../app.tokens.js';

const SWAGGER_INIT_JS = `window.onload = () => {
  window.ui = SwaggerUIBundle({
    url: '/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    tryItOutEnabled: true,
  });
};
`;

const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mercato API — OpenAPI</title>
    <link rel="stylesheet" href="/docs-static/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs-static/swagger-ui-bundle.js" defer></script>
    <script src="/docs/swagger-init.js" defer></script>
  </body>
</html>
`;

/** Serves the generated OpenAPI 3.1 document and an offline Swagger UI. */
@Controller()
export class DocsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(OPENAPI_DOCUMENT) private readonly document: unknown,
  ) {}

  @Get('openapi.json')
  spec(): unknown {
    this.assertDocsEnabled();
    return this.document;
  }

  @Get('docs')
  docs(@Res() reply: FastifyReply): void {
    this.assertDocsEnabled();
    void reply.type('text/html; charset=utf-8').send(DOCS_HTML);
  }

  @Get('docs/swagger-init.js')
  init(@Res() reply: FastifyReply): void {
    this.assertDocsEnabled();
    void reply.type('application/javascript; charset=utf-8').send(SWAGGER_INIT_JS);
  }

  /** API documentation is disabled in production unless explicitly enabled. */
  private assertDocsEnabled(): void {
    if (this.config.env === 'production') {
      throw new NotFoundException('resource not found');
    }
  }
}
