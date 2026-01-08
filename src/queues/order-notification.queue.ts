/**
 * Order Notification Queue Processor
 *
 * Handles order-related notifications:
 * - Order confirmation
 * - Shipping updates
 * - Delivery confirmation
 * - Review requests (3 days after delivery)
 */

import { Job, Queue } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { whatsappService } from '../services/whatsapp.service';
import { prisma } from '../config/database';

export const orderNotificationQueue = new Queue('order-notifications', {
  connection: redis,
});

interface OrderNotificationJob {
  type: 'confirmation' | 'shipped' | 'delivered' | 'review_request';
  orderId: string;
  customerId: string;
  phone: string;
  orderNumber: string;
  templateName: string;
  variables: Record<string, string>;
}

/**
 * Process order notification job
 */
export async function orderNotificationQueueProcessor(
  job: Job<OrderNotificationJob>
): Promise<void> {
  const { type, orderId, customerId, phone, orderNumber, templateName, variables } = job.data;

  logger.info({
    jobId: job.id,
    type,
    orderId,
    orderNumber,
  }, 'Processing order notification');

  try {
    // Build template components
    const bodyParams = Object.values(variables).map((value) => ({
      type: 'text' as const,
      text: value,
    }));

    const result = await whatsappService.sendTemplateMessage(
      phone,
      templateName,
      'en',
      bodyParams.length > 0
        ? [{ type: 'body', parameters: bodyParams }]
        : undefined,
      {
        customerId,
        orderId,
      }
    );

    // Update order notification flags
    const updateData: Record<string, boolean> = {};
    switch (type) {
      case 'confirmation':
        updateData.confirmationSent = true;
        break;
      case 'shipped':
        updateData.shippingSent = true;
        break;
      case 'delivered':
        updateData.deliverySent = true;
        break;
      case 'review_request':
        updateData.reviewRequestSent = true;
        break;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    logger.info({
      jobId: job.id,
      type,
      orderId,
      messageId: result.messageId,
    }, 'Order notification sent');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      orderId,
      type,
    }, 'Order notification failed');
    throw error;
  }
}

// Helper functions for scheduling notifications

export async function scheduleOrderConfirmation(
  orderId: string,
  customerId: string,
  phone: string,
  orderNumber: string,
  customerName: string,
  total: string
): Promise<void> {
  await orderNotificationQueue.add('order-notification', {
    type: 'confirmation',
    orderId,
    customerId,
    phone,
    orderNumber,
    templateName: 'order_confirmation',
    variables: {
      customerName,
      orderNumber,
      total,
    },
  });
}

export async function scheduleShippingNotification(
  orderId: string,
  customerId: string,
  phone: string,
  orderNumber: string,
  trackingNumber: string,
  trackingUrl: string
): Promise<void> {
  await orderNotificationQueue.add('order-notification', {
    type: 'shipped',
    orderId,
    customerId,
    phone,
    orderNumber,
    templateName: 'order_shipped',
    variables: {
      orderNumber,
      trackingNumber,
      trackingUrl,
    },
  });
}

export async function scheduleDeliveryNotification(
  orderId: string,
  customerId: string,
  phone: string,
  orderNumber: string
): Promise<void> {
  await orderNotificationQueue.add('order-notification', {
    type: 'delivered',
    orderId,
    customerId,
    phone,
    orderNumber,
    templateName: 'order_delivered',
    variables: {
      orderNumber,
    },
  });
}

export async function scheduleReviewRequest(
  orderId: string,
  customerId: string,
  phone: string,
  orderNumber: string,
  customerName: string,
  productName: string
): Promise<void> {
  // Schedule review request 3 days after delivery
  await orderNotificationQueue.add(
    'order-notification',
    {
      type: 'review_request',
      orderId,
      customerId,
      phone,
      orderNumber,
      templateName: 'review_request',
      variables: {
        customerName,
        productName,
      },
    },
    {
      delay: 3 * 24 * 60 * 60 * 1000, // 3 days
    }
  );
}
