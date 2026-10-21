import { describe, expect, it } from 'vitest';
import { NestPinoLogger, type PinoLikeLogger } from '../../src/common/logging/nest-pino.logger.js';

interface Recorded {
  level: string;
  obj: object;
  msg: string;
}

function recordingLogger(): { logger: PinoLikeLogger; records: Recorded[] } {
  const records: Recorded[] = [];
  const logger: PinoLikeLogger = {
    info: (obj, msg) => records.push({ level: 'info', obj, msg: msg ?? '' }),
    warn: (obj, msg) => records.push({ level: 'warn', obj, msg: msg ?? '' }),
    error: (obj, msg) => records.push({ level: 'error', obj, msg: msg ?? '' }),
    debug: (obj, msg) => records.push({ level: 'debug', obj, msg: msg ?? '' }),
    fatal: (obj, msg) => records.push({ level: 'fatal', obj, msg: msg ?? '' }),
    child: () => logger,
  };
  return { logger, records };
}

describe('NestPinoLogger', () => {
  it('routes Nest logs through the structured logger with context', () => {
    const { logger, records } = recordingLogger();
    const nest = new NestPinoLogger(logger);
    nest.log('hello', 'TestContext');
    nest.error('boom', 'stack', 'TestContext');
    nest.warn('careful');
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({
      level: 'info',
      msg: 'hello',
      obj: { context: 'TestContext' },
    });
    expect(records[1]).toMatchObject({ level: 'error', msg: 'boom', obj: { trace: 'stack' } });
    expect(records[2]).toMatchObject({ level: 'warn', obj: { context: 'App' } });
  });
});
