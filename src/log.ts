import pino from 'pino';
import { getEnv } from './env';

const env = getEnv();

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export interface RequestLog {
  id: string;
  method: string;
  path: string;
  status: number;
  bytesIn: number;
  ms: number;
}

export function logRequest(log: RequestLog): void {
  logger.info(log, 'request');
}

