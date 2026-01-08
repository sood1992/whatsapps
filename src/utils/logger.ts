/**
 * Logger Configuration
 * Pino-based logging
 */

import pino from 'pino';
import { config } from '../config/environment';

export const logger = pino({
  level: config.isDev ? 'debug' : 'info',
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'treatfortails-whatsapp',
  },
});
