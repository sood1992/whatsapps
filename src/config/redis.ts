/**
 * Redis Configuration
 * For queues and caching
 */

import Redis from 'ioredis';
import { config } from './environment';
import { logger } from '../utils/logger';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 3) {
      logger.error('Redis connection failed after 3 retries');
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (error) => {
  logger.error({ error }, 'Redis error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Create a duplicate connection for BullMQ subscriber
export const redisSubscriber = redis.duplicate();
