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
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { abandonedCartService } from '../services/abandoned-cart.service';

export const cartRecoveryQueue = new Queue('cart-recovery', {
  connection: redis,
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
