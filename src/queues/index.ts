/**
 * Queue System Initialization
 *
 * BullMQ-based queue system for:
 * - Message sending (rate-limited)
 * - Campaign processing
 * - Cart recovery
 * - Order notifications
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { config } from '../config/environment';

// Import queue handlers
import { messageQueueProcessor } from './message.queue';
import { cartRecoveryQueueProcessor } from './cart-recovery.queue';
import { orderNotificationQueueProcessor } from './order-notification.queue';

// Queue names
export const QUEUE_NAMES = {
  MESSAGES: 'whatsapp-messages',
  CART_RECOVERY: 'cart-recovery',
  ORDER_NOTIFICATIONS: 'order-notifications',
  CAMPAIGNS: 'campaigns',
  SCHEDULED_MESSAGES: 'scheduled-messages',
};

// Queue instances
export const messageQueue = new Queue(QUEUE_NAMES.MESSAGES, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

export const cartRecoveryQueue = new Queue(QUEUE_NAMES.CART_RECOVERY, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 60000, // 1 minute retry
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const orderNotificationQueue = new Queue(QUEUE_NAMES.ORDER_NOTIFICATIONS, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const campaignQueue = new Queue(QUEUE_NAMES.CAMPAIGNS, {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

// Workers
let messageWorker: Worker;
let cartRecoveryWorker: Worker;
let orderNotificationWorker: Worker;

// Initialize all queues and workers
export async function initializeQueues(): Promise<void> {
  logger.info('Initializing queue system...');

  // Create workers with rate limiting
  messageWorker = new Worker(
    QUEUE_NAMES.MESSAGES,
    messageQueueProcessor,
    {
      connection: redis,
      concurrency: 5,
      limiter: {
        max: config.messaging.maxMessagesPerMinute,
        duration: 60000, // 1 minute
      },
    }
  );

  cartRecoveryWorker = new Worker(
    QUEUE_NAMES.CART_RECOVERY,
    cartRecoveryQueueProcessor,
    {
      connection: redis,
      concurrency: 3,
    }
  );

  orderNotificationWorker = new Worker(
    QUEUE_NAMES.ORDER_NOTIFICATIONS,
    orderNotificationQueueProcessor,
    {
      connection: redis,
      concurrency: 5,
    }
  );

  // Event listeners for logging
  const setupWorkerEvents = (worker: Worker, queueName: string) => {
    worker.on('completed', (job) => {
      logger.debug({ jobId: job.id, queue: queueName }, 'Job completed');
    });

    worker.on('failed', (job, err) => {
      logger.error({
        jobId: job?.id,
        queue: queueName,
        error: err.message,
      }, 'Job failed');
    });

    worker.on('error', (err) => {
      logger.error({ queue: queueName, error: err.message }, 'Worker error');
    });
  };

  setupWorkerEvents(messageWorker, QUEUE_NAMES.MESSAGES);
  setupWorkerEvents(cartRecoveryWorker, QUEUE_NAMES.CART_RECOVERY);
  setupWorkerEvents(orderNotificationWorker, QUEUE_NAMES.ORDER_NOTIFICATIONS);

  // Queue events for monitoring
  const messageQueueEvents = new QueueEvents(QUEUE_NAMES.MESSAGES, {
    connection: redis,
  });

  messageQueueEvents.on('waiting', ({ jobId }) => {
    logger.debug({ jobId }, 'Message job waiting');
  });

  logger.info('Queue system initialized successfully');
}

// Graceful shutdown
export async function shutdownQueues(): Promise<void> {
  logger.info('Shutting down queue system...');

  await Promise.all([
    messageWorker?.close(),
    cartRecoveryWorker?.close(),
    orderNotificationWorker?.close(),
    messageQueue?.close(),
    cartRecoveryQueue?.close(),
    orderNotificationQueue?.close(),
    campaignQueue?.close(),
  ]);

  logger.info('Queue system shut down');
}

// Export queue instances
export { messageQueue as default };
