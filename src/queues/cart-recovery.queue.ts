/**
 * Cart Recovery Queue Processor
 *
 * Handles abandoned cart recovery messages with smart timing:
 * - 30 min: Gentle reminder
 * - 4 hours: Add urgency
 * - 24 hours: Offer discount
 * - 72 hours: Last chance
 */

import { Job, Queue } from 'bullmq';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { abandonedCartService } from '../services/abandoned-cart.service';

// Parse Redis URL for BullMQ connection
function getRedisConnection() {
  try {
    const url = new URL(config.redisUrl);
    return {
      host: url.hostname || 'localhost',
      port: parseInt(url.port || '6379'),
      password: url.password || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

export const cartRecoveryQueue = new Queue('cart-recovery', {
  connection: getRedisConnection(),
});

interface CartRecoveryJob {
  cartId: string;
  sequenceIndex: number;
  templateName: string;
  includeDiscount: boolean;
  discountPercent?: number;
}

/**
 * Process cart recovery job
 */
export async function cartRecoveryQueueProcessor(job: Job<CartRecoveryJob>): Promise<void> {
  const { cartId, sequenceIndex, templateName, includeDiscount, discountPercent } = job.data;

  logger.info({
    jobId: job.id,
    cartId,
    sequenceIndex,
  }, 'Processing cart recovery job');

  try {
    const success = await abandonedCartService.sendRecoveryMessage(
      cartId,
      sequenceIndex,
      templateName,
      includeDiscount,
      discountPercent
    );

    if (!success) {
      logger.info({ cartId }, 'Cart recovery skipped (already recovered or opted out)');
    }
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      cartId,
    }, 'Cart recovery job failed');
    throw error;
  }
}
