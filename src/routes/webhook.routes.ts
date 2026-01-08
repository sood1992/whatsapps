/**
 * Webhook Routes
 *
 * Handles incoming webhooks from:
 * - WhatsApp Cloud API (message status, incoming messages)
 * - WooCommerce (orders, customers, cart updates)
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { whatsappService } from '../services/whatsapp.service';
import { wooCommerceService } from '../services/woocommerce.service';
import { automationService } from '../services/automation.service';
import { abandonedCartService } from '../services/abandoned-cart.service';
import {
  scheduleOrderConfirmation,
  scheduleShippingNotification,
  scheduleDeliveryNotification,
  scheduleReviewRequest,
} from '../queues/order-notification.queue';
import { AutomationTrigger, MessageDirection, MessageType, MessageStatus } from '@prisma/client';

const router = Router();

// ===========================================
// WhatsApp Webhooks
// ===========================================

/**
 * WhatsApp webhook verification (GET)
 * Meta sends this to verify your webhook URL
 */
router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.webhookVerifyToken) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * WhatsApp webhook handler (POST)
 * Receives message status updates and incoming messages
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    // Always respond quickly to avoid timeout
    res.sendStatus(200);

    const body = req.body;

    // Log webhook for debugging
    await prisma.webhookLog.create({
      data: {
        source: 'whatsapp',
        event: body.entry?.[0]?.changes?.[0]?.field || 'unknown',
        payload: body,
      },
    });

    // Process webhook asynchronously
    processWhatsAppWebhook(body).catch((error) => {
      logger.error({ error }, 'Error processing WhatsApp webhook');
    });
  } catch (error) {
    logger.error({ error }, 'WhatsApp webhook error');
    res.sendStatus(500);
  }
});

async function processWhatsAppWebhook(body: Record<string, unknown>): Promise<void> {
  const entries = body.entry as Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { phone_number_id: string };
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string }>;
        }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string };
          };
        }>;
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
      };
    }>;
  }>;

  if (!entries) return;

  for (const entry of entries) {
    for (const change of entry.changes) {
      const value = change.value;

      // Handle message status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await whatsappService.updateMessageStatus(
            status.id,
            status.status === 'sent' ? 'delivered' : status.status,
            new Date(parseInt(status.timestamp) * 1000),
            status.errors?.[0]
          );
        }
      }

      // Handle incoming messages
      if (value.messages) {
        for (const message of value.messages) {
          await handleIncomingMessage(
            message,
            value.contacts?.[0]
          );
        }
      }
    }
  }
}

async function handleIncomingMessage(
  message: {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    interactive?: {
      type: string;
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string };
    };
  },
  contact?: { profile: { name: string }; wa_id: string }
): Promise<void> {
  const phone = `+${message.from}`;

  // Find or create customer
  let customer = await prisma.customer.findUnique({
    where: { phone },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        phone,
        name: contact?.profile?.name,
        optedIn: true,
        optInDate: new Date(),
        optInSource: 'whatsapp_message',
      },
    });

    // Trigger welcome automation
    await automationService.processTrigger(AutomationTrigger.CUSTOMER_OPTED_IN, {
      customerId: customer.id,
      phone: customer.phone,
      customerName: customer.name || undefined,
    });
  }

  // Log incoming message
  let messageContent: Record<string, unknown> = {};
  let messageType = MessageType.TEXT;

  if (message.type === 'text' && message.text) {
    messageContent = { text: message.text.body };
    messageType = MessageType.TEXT;
  } else if (message.type === 'interactive' && message.interactive) {
    const reply = message.interactive.button_reply || message.interactive.list_reply;
    messageContent = {
      type: message.interactive.type,
      reply,
    };
    messageType = MessageType.INTERACTIVE;
  }

  await prisma.message.create({
    data: {
      whatsappMessageId: message.id,
      direction: MessageDirection.INBOUND,
      customerId: customer.id,
      type: messageType,
      content: messageContent,
      status: MessageStatus.DELIVERED,
      deliveredAt: new Date(parseInt(message.timestamp) * 1000),
    },
  });

  // Update customer last interaction
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      lastInteraction: new Date(),
    },
  });

  // Handle keywords and auto-replies
  if (message.type === 'text' && message.text) {
    await automationService.handleKeywordTrigger(
      customer.id,
      customer.phone,
      message.text.body
    );
  }

  // Handle interactive button replies
  if (message.interactive?.button_reply) {
    const buttonId = message.interactive.button_reply.id;

    // Handle specific button actions
    switch (buttonId) {
      case 'reorder':
        // TODO: Handle reorder
        break;
      case 'need_help':
        await whatsappService.sendTextMessage(
          phone,
          'Our team is here to help! Please describe your issue and we\'ll get back to you shortly.\n\nFor urgent inquiries, call us at ' + config.business.phone,
          { customerId: customer.id }
        );
        break;
    }
  }

  // Mark message as read
  await whatsappService.markMessageAsRead(message.id);
}

// ===========================================
// WooCommerce Webhooks
// ===========================================

/**
 * Verify WooCommerce webhook signature
 */
function verifyWooCommerceSignature(req: Request): boolean {
  const signature = req.headers['x-wc-webhook-signature'] as string;
  if (!signature || !config.woocommerce.webhookSecret) {
    return true; // Skip if no secret configured
  }

  const payload = JSON.stringify(req.body);
  return wooCommerceService.verifyWebhookSignature(payload, signature);
}

/**
 * WooCommerce order webhook
 */
router.post('/woocommerce/order', async (req: Request, res: Response) => {
  try {
    if (!verifyWooCommerceSignature(req)) {
      logger.warn('Invalid WooCommerce webhook signature');
      return res.sendStatus(401);
    }

    res.sendStatus(200);

    const order = req.body;
    const topic = req.headers['x-wc-webhook-topic'] as string;

    // Log webhook
    await prisma.webhookLog.create({
      data: {
        source: 'woocommerce',
        event: topic || 'order',
        payload: order,
      },
    });

    // Process order webhook
    await processWooCommerceOrder(order, topic);
  } catch (error) {
    logger.error({ error }, 'WooCommerce order webhook error');
    res.sendStatus(500);
  }
});

async function processWooCommerceOrder(
  wooOrder: {
    id: number;
    number: string;
    status: string;
    total: string;
    billing: {
      first_name: string;
      last_name: string;
      phone: string;
      email: string;
    };
    line_items: Array<{ name: string }>;
    meta_data?: Array<{ key: string; value: string }>;
  },
  topic?: string
): Promise<void> {
  // Sync order to database
  const orderId = await wooCommerceService.syncOrder(wooOrder as never);

  // Get the synced order with customer
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });

  if (!order || !order.customer.optedIn) {
    logger.info({ orderId: wooOrder.id }, 'Customer not opted-in, skipping notification');
    return;
  }

  const customerName = order.customer.name || `${wooOrder.billing.first_name}`;

  // Handle different order statuses
  switch (wooOrder.status) {
    case 'processing':
    case 'pending':
      // New order - send confirmation
      if (!order.confirmationSent) {
        await scheduleOrderConfirmation(
          order.id,
          order.customer.id,
          order.customer.phone,
          order.orderNumber,
          customerName,
          order.total.toString()
        );

        // Check if this was an abandoned cart recovery
        const cartToken = wooOrder.meta_data?.find((m) => m.key === 'cart_token')?.value;
        if (cartToken) {
          const cart = await prisma.abandonedCart.findFirst({
            where: { cartToken },
          });
          if (cart) {
            await abandonedCartService.markCartRecovered(cart.id, order.id);
          }
        }

        // Trigger automation
        await automationService.processTrigger(AutomationTrigger.ORDER_CREATED, {
          customerId: order.customer.id,
          phone: order.customer.phone,
          customerName,
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderTotal: order.total,
        });
      }
      break;

    case 'shipped':
      // Order shipped - send tracking info
      if (!order.shippingSent) {
        const trackingNumber = wooOrder.meta_data?.find(
          (m) => m.key === '_tracking_number' || m.key === 'tracking_number'
        )?.value || '';

        const trackingUrl = wooOrder.meta_data?.find(
          (m) => m.key === '_tracking_url' || m.key === 'tracking_url'
        )?.value || `https://treatfortails.com/track?order=${order.orderNumber}`;

        await scheduleShippingNotification(
          order.id,
          order.customer.id,
          order.customer.phone,
          order.orderNumber,
          trackingNumber,
          trackingUrl
        );

        await automationService.processTrigger(AutomationTrigger.ORDER_SHIPPED, {
          customerId: order.customer.id,
          phone: order.customer.phone,
          customerName,
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
      }
      break;

    case 'completed':
    case 'delivered':
      // Order delivered - send confirmation and schedule review request
      if (!order.deliverySent) {
        await scheduleDeliveryNotification(
          order.id,
          order.customer.id,
          order.customer.phone,
          order.orderNumber
        );

        // Schedule review request for 3 days later
        const firstProductName = wooOrder.line_items[0]?.name || 'your order';
        await scheduleReviewRequest(
          order.id,
          order.customer.id,
          order.customer.phone,
          order.orderNumber,
          customerName,
          firstProductName
        );

        await automationService.processTrigger(AutomationTrigger.ORDER_DELIVERED, {
          customerId: order.customer.id,
          phone: order.customer.phone,
          customerName,
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
      }
      break;
  }
}

/**
 * WooCommerce cart update webhook (for abandoned cart tracking)
 */
router.post('/woocommerce/cart', async (req: Request, res: Response) => {
  try {
    res.sendStatus(200);

    const { customer_id, phone, items, subtotal, cart_token } = req.body;

    if (!phone || !items || items.length === 0) {
      return;
    }

    // Find customer
    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone },
          { wooCustomerId: customer_id },
        ],
      },
    });

    if (!customer || !customer.optedIn) {
      return;
    }

    // Track abandoned cart
    await abandonedCartService.trackAbandonedCart(
      customer.id,
      items,
      subtotal,
      cart_token
    );
  } catch (error) {
    logger.error({ error }, 'WooCommerce cart webhook error');
    res.sendStatus(500);
  }
});

/**
 * WooCommerce customer webhook (for opt-in tracking)
 */
router.post('/woocommerce/customer', async (req: Request, res: Response) => {
  try {
    res.sendStatus(200);

    const wooCustomer = req.body;

    // Log webhook
    await prisma.webhookLog.create({
      data: {
        source: 'woocommerce',
        event: 'customer',
        payload: wooCustomer,
      },
    });

    // Format phone
    const phone = wooCustomer.billing?.phone;
    if (!phone) return;

    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^0/, '')}`;

    // Check if opted in via marketing consent
    const marketingConsent = wooCustomer.meta_data?.find(
      (m: { key: string }) => m.key === 'whatsapp_marketing_consent'
    )?.value;

    const optedIn = marketingConsent === 'yes' || marketingConsent === '1' || marketingConsent === true;

    // Create or update customer
    await prisma.customer.upsert({
      where: { phone: formattedPhone },
      create: {
        phone: formattedPhone,
        email: wooCustomer.email,
        name: `${wooCustomer.first_name} ${wooCustomer.last_name}`.trim(),
        wooCustomerId: wooCustomer.id,
        optedIn,
        optInDate: optedIn ? new Date() : null,
        optInSource: optedIn ? 'woocommerce_checkout' : null,
      },
      update: {
        email: wooCustomer.email,
        name: `${wooCustomer.first_name} ${wooCustomer.last_name}`.trim(),
        wooCustomerId: wooCustomer.id,
        ...(optedIn && {
          optedIn: true,
          optInDate: new Date(),
          optInSource: 'woocommerce_checkout',
        }),
      },
    });
  } catch (error) {
    logger.error({ error }, 'WooCommerce customer webhook error');
  }
});

export default router;
