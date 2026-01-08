/**
 * Abandoned Cart Recovery Service
 *
 * Smart abandoned cart recovery with optimized timing based on research:
 * - First message: 15-60 minutes after abandonment
 * - Second message: 8-24 hours later
 * - Third message: 3 days later (last chance)
 *
 * Research shows:
 * - 98% WhatsApp open rate vs 20% email
 * - 25-40% cart recovery rate achievable
 * - Timing is critical - 30-60 min window is optimal
 *
 * Sources:
 * - https://business.whatsapp.com/blog/shopping-cart-recovery-seasonal-sales
 * - https://m.aisensy.com/blog/recover-abandoned-carts-with-whatsapp/
 */

import { prisma } from '../config/database';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { whatsappService } from './whatsapp.service';
import { wooCommerceService } from './woocommerce.service';
import { cartRecoveryQueue } from '../queues/cart-recovery.queue';
import { CartRecoveryStatus, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';

interface CartItem {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

interface RecoveryMessage {
  templateName: string;
  delay: number; // minutes
  includeDiscount: boolean;
  discountPercent?: number;
  urgency: 'low' | 'medium' | 'high';
}

// Smart recovery sequence based on research
const RECOVERY_SEQUENCE: RecoveryMessage[] = [
  {
    // First message: 30 min - Gentle reminder with product image
    templateName: 'cart_reminder_1',
    delay: 30,
    includeDiscount: false,
    urgency: 'low',
  },
  {
    // Second message: 4 hours - Add social proof/urgency
    templateName: 'cart_reminder_2',
    delay: 240, // 4 hours
    includeDiscount: false,
    urgency: 'medium',
  },
  {
    // Third message: 24 hours - Offer discount
    templateName: 'cart_reminder_3',
    delay: 1440, // 24 hours
    includeDiscount: true,
    discountPercent: 10,
    urgency: 'high',
  },
  {
    // Fourth message: 72 hours - Last chance with bigger discount
    templateName: 'cart_reminder_final',
    delay: 4320, // 72 hours
    includeDiscount: true,
    discountPercent: 15,
    urgency: 'high',
  },
];

export class AbandonedCartService {
  /**
   * Track a new abandoned cart
   */
  async trackAbandonedCart(
    customerId: string,
    items: CartItem[],
    subtotal: number,
    cartToken?: string
  ): Promise<string> {
    // Check if customer exists and is opted-in
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || !customer.optedIn) {
      logger.info({ customerId }, 'Customer not opted-in, skipping cart tracking');
      throw new Error('Customer not opted-in');
    }

    // Check for existing active cart
    const existingCart = await prisma.abandonedCart.findFirst({
      where: {
        customerId,
        recoveryStatus: {
          in: [CartRecoveryStatus.ABANDONED, CartRecoveryStatus.REMINDER_SENT],
        },
      },
    });

    // Update existing cart or create new one
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Cart expires in 7 days

    let cart;
    if (existingCart) {
      cart = await prisma.abandonedCart.update({
        where: { id: existingCart.id },
        data: {
          items: items as unknown as Prisma.InputJsonValue,
          subtotal,
          abandonedAt: new Date(),
          expiresAt,
        },
      });
    } else {
      cart = await prisma.abandonedCart.create({
        data: {
          customerId,
          cartToken: cartToken || `cart_${nanoid(12)}`,
          items: items as unknown as Prisma.InputJsonValue,
          subtotal,
          currency: 'INR',
          recoveryStatus: CartRecoveryStatus.ABANDONED,
          abandonedAt: new Date(),
          expiresAt,
        },
      });

      // Schedule first recovery message
      await this.scheduleRecoveryMessage(cart.id, 0);
    }

    logger.info({
      cartId: cart.id,
      customerId,
      itemCount: items.length,
      subtotal,
    }, 'Abandoned cart tracked');

    return cart.id;
  }

  /**
   * Schedule a recovery message in the sequence
   */
  async scheduleRecoveryMessage(cartId: string, sequenceIndex: number): Promise<void> {
    if (sequenceIndex >= RECOVERY_SEQUENCE.length) {
      logger.info({ cartId }, 'Recovery sequence completed');
      return;
    }

    const message = RECOVERY_SEQUENCE[sequenceIndex];

    await cartRecoveryQueue.add(
      'send-recovery-message',
      {
        cartId,
        sequenceIndex,
        templateName: message.templateName,
        includeDiscount: message.includeDiscount,
        discountPercent: message.discountPercent,
      },
      {
        delay: message.delay * 60 * 1000, // Convert minutes to ms
        jobId: `cart-${cartId}-seq-${sequenceIndex}`,
      }
    );

    logger.info({
      cartId,
      sequenceIndex,
      delayMinutes: message.delay,
    }, 'Recovery message scheduled');
  }

  /**
   * Send a cart recovery message
   */
  async sendRecoveryMessage(
    cartId: string,
    sequenceIndex: number,
    templateName: string,
    includeDiscount: boolean,
    discountPercent?: number
  ): Promise<boolean> {
    const cart = await prisma.abandonedCart.findUnique({
      where: { id: cartId },
      include: { customer: true },
    });

    if (!cart) {
      logger.warn({ cartId }, 'Cart not found');
      return false;
    }

    // Check if cart was already recovered or customer opted out
    if (cart.recoveryStatus === CartRecoveryStatus.RECOVERED) {
      logger.info({ cartId }, 'Cart already recovered, skipping message');
      return false;
    }

    if (cart.recoveryStatus === CartRecoveryStatus.OPTED_OUT) {
      logger.info({ cartId }, 'Customer opted out, skipping message');
      return false;
    }

    if (!cart.customer.optedIn) {
      logger.info({ cartId }, 'Customer not opted-in, skipping message');
      return false;
    }

    const items = cart.items as unknown as CartItem[];
    const firstItem = items[0];

    // Generate coupon if discount is included
    let couponCode: string | undefined;
    if (includeDiscount && discountPercent) {
      couponCode = `SAVE${discountPercent}_${nanoid(6).toUpperCase()}`;
      try {
        await wooCommerceService.createRecoveryCoupon({
          code: couponCode,
          discountType: 'percent',
          amount: discountPercent.toString(),
          expiryDays: 3,
          usageLimit: 1,
          customerEmail: cart.customer.email || undefined,
        });
      } catch (error) {
        logger.error({ error, cartId }, 'Failed to create recovery coupon');
        couponCode = undefined;
      }
    }

    // Build recovery URL
    const recoveryUrl = wooCommerceService.getCartRecoveryUrl(
      items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      couponCode
    );

    // Build template components
    const components = this.buildRecoveryComponents(
      cart.customer.name || 'there',
      firstItem.name,
      cart.subtotal,
      items.length,
      couponCode,
      discountPercent,
      firstItem.image
    );

    try {
      await whatsappService.sendTemplateMessage(
        cart.customer.phone,
        templateName,
        'en',
        components,
        {
          customerId: cart.customer.id,
          cartId: cart.id,
        }
      );

      // Update cart status
      const newStatus = sequenceIndex === 0
        ? CartRecoveryStatus.REMINDER_SENT
        : CartRecoveryStatus.FOLLOWUP_SENT;

      await prisma.abandonedCart.update({
        where: { id: cartId },
        data: {
          recoveryStatus: newStatus,
          recoveryAttempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });

      // Schedule next message in sequence
      await this.scheduleRecoveryMessage(cartId, sequenceIndex + 1);

      logger.info({
        cartId,
        sequenceIndex,
        phone: cart.customer.phone,
      }, 'Recovery message sent');

      return true;
    } catch (error) {
      logger.error({ error, cartId }, 'Failed to send recovery message');
      return false;
    }
  }

  /**
   * Build template components for recovery message
   */
  private buildRecoveryComponents(
    customerName: string,
    productName: string,
    subtotal: number,
    itemCount: number,
    couponCode?: string,
    discountPercent?: number,
    productImage?: string
  ): Array<{
    type: 'header' | 'body' | 'button';
    parameters?: Array<{ type: 'text' | 'image'; text?: string; image?: { link: string } }>;
    sub_type?: 'quick_reply' | 'url';
    index?: number;
  }> {
    const components: Array<{
      type: 'header' | 'body' | 'button';
      parameters?: Array<{ type: 'text' | 'image'; text?: string; image?: { link: string } }>;
      sub_type?: 'quick_reply' | 'url';
      index?: number;
    }> = [];

    // Header with product image
    if (productImage) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: productImage } }],
      });
    }

    // Body parameters
    const bodyParams: Array<{ type: 'text'; text: string }> = [
      { type: 'text', text: customerName },
      { type: 'text', text: productName },
      { type: 'text', text: `₹${subtotal.toFixed(2)}` },
    ];

    if (itemCount > 1) {
      bodyParams.push({ type: 'text', text: `+${itemCount - 1} more items` });
    }

    if (couponCode && discountPercent) {
      bodyParams.push({ type: 'text', text: couponCode });
      bodyParams.push({ type: 'text', text: `${discountPercent}%` });
    }

    components.push({
      type: 'body',
      parameters: bodyParams,
    });

    return components;
  }

  /**
   * Mark cart as recovered
   */
  async markCartRecovered(cartId: string, orderId: string): Promise<void> {
    await prisma.abandonedCart.update({
      where: { id: cartId },
      data: {
        recoveryStatus: CartRecoveryStatus.RECOVERED,
        recoveredAt: new Date(),
        recoveredOrderId: orderId,
      },
    });

    // Cancel any pending recovery messages
    await this.cancelPendingRecoveryMessages(cartId);

    logger.info({ cartId, orderId }, 'Cart marked as recovered');
  }

  /**
   * Mark customer as opted out of recovery messages
   */
  async optOutCustomer(customerId: string): Promise<void> {
    await prisma.abandonedCart.updateMany({
      where: {
        customerId,
        recoveryStatus: {
          in: [CartRecoveryStatus.ABANDONED, CartRecoveryStatus.REMINDER_SENT, CartRecoveryStatus.FOLLOWUP_SENT],
        },
      },
      data: {
        recoveryStatus: CartRecoveryStatus.OPTED_OUT,
      },
    });

    await this.cancelPendingRecoveryMessages(customerId, true);

    logger.info({ customerId }, 'Customer opted out of cart recovery');
  }

  /**
   * Cancel pending recovery messages
   */
  private async cancelPendingRecoveryMessages(
    identifier: string,
    isCustomerId = false
  ): Promise<void> {
    // Implementation depends on BullMQ job removal
    // This would remove scheduled jobs from the queue
    logger.info({ identifier, isCustomerId }, 'Cancelling pending recovery messages');
  }

  /**
   * Get cart recovery analytics
   */
  async getRecoveryStats(days: number = 30): Promise<{
    totalAbandoned: number;
    recovered: number;
    recoveryRate: number;
    recoveredRevenue: number;
    messagesSent: number;
    avgRecoveryTime: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const stats = await prisma.abandonedCart.groupBy({
      by: ['recoveryStatus'],
      where: {
        abandonedAt: { gte: cutoffDate },
      },
      _count: true,
      _sum: {
        subtotal: true,
        recoveryAttempts: true,
      },
    });

    let totalAbandoned = 0;
    let recovered = 0;
    let recoveredRevenue = 0;
    let messagesSent = 0;

    for (const stat of stats) {
      totalAbandoned += stat._count;
      messagesSent += stat._sum.recoveryAttempts || 0;

      if (stat.recoveryStatus === CartRecoveryStatus.RECOVERED) {
        recovered = stat._count;
        recoveredRevenue = stat._sum.subtotal || 0;
      }
    }

    return {
      totalAbandoned,
      recovered,
      recoveryRate: totalAbandoned > 0 ? (recovered / totalAbandoned) * 100 : 0,
      recoveredRevenue,
      messagesSent,
      avgRecoveryTime: 0, // TODO: Calculate average time to recovery
    };
  }

  /**
   * Check for carts abandoned from WooCommerce
   * Should be called periodically (e.g., every 15 minutes)
   */
  async checkForAbandonedCarts(): Promise<number> {
    // This would integrate with WooCommerce cart tracking
    // Many WooCommerce stores use plugins like:
    // - WooCommerce Cart Abandonment Recovery
    // - Retainful
    // - CartFlows
    //
    // For now, we track carts through our webhook integration
    // when add_to_cart events are received

    logger.info('Checking for abandoned carts...');

    // Mark old carts as expired
    const expiredCount = await prisma.abandonedCart.updateMany({
      where: {
        expiresAt: { lte: new Date() },
        recoveryStatus: {
          in: [CartRecoveryStatus.ABANDONED, CartRecoveryStatus.REMINDER_SENT, CartRecoveryStatus.FOLLOWUP_SENT],
        },
      },
      data: {
        recoveryStatus: CartRecoveryStatus.EXPIRED,
      },
    });

    if (expiredCount.count > 0) {
      logger.info({ count: expiredCount.count }, 'Marked carts as expired');
    }

    return expiredCount.count;
  }
}

export const abandonedCartService = new AbandonedCartService();
