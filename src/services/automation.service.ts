/**
 * Automation Rules Service
 *
 * Handles automated message triggers:
 * - Order events (created, shipped, delivered)
 * - Cart abandonment
 * - Customer opt-in welcome
 * - Re-engagement for inactive customers
 * - Keyword auto-replies
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { whatsappService } from './whatsapp.service';
import { orderNotificationQueue } from '../queues/order-notification.queue';
import { abandonedCartService } from './abandoned-cart.service';
import { AutomationTrigger, AutomationAction } from '@prisma/client';

interface TriggerContext {
  customerId: string;
  phone: string;
  customerName?: string;
  orderId?: string;
  orderNumber?: string;
  orderTotal?: number;
  cartId?: string;
  cartItems?: Array<{ name: string; quantity: number; price: number }>;
  keyword?: string;
  messageText?: string;
}

export class AutomationService {
  /**
   * Process an automation trigger
   */
  async processTrigger(
    trigger: AutomationTrigger,
    context: TriggerContext
  ): Promise<void> {
    // Find active automation rules for this trigger
    const rules = await prisma.automationRule.findMany({
      where: {
        trigger,
        isActive: true,
      },
    });

    if (rules.length === 0) {
      logger.debug({ trigger }, 'No automation rules found for trigger');
      return;
    }

    logger.info({
      trigger,
      rulesCount: rules.length,
      customerId: context.customerId,
    }, 'Processing automation trigger');

    for (const rule of rules) {
      try {
        await this.executeRule(rule, context);

        // Update trigger stats
        await prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            timesTriggered: { increment: 1 },
            lastTriggeredAt: new Date(),
          },
        });
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : 'Unknown error',
          ruleId: rule.id,
          trigger,
        }, 'Failed to execute automation rule');
      }
    }
  }

  /**
   * Execute a single automation rule
   */
  private async executeRule(
    rule: { id: string; action: AutomationAction; actionConfig: unknown },
    context: TriggerContext
  ): Promise<void> {
    const config = rule.actionConfig as Record<string, unknown>;

    switch (rule.action) {
      case AutomationAction.SEND_TEMPLATE:
        await this.executeSendTemplate(config, context);
        break;

      case AutomationAction.SEND_MESSAGE:
        await this.executeSendMessage(config, context);
        break;

      case AutomationAction.ADD_TAG:
        await this.executeAddTag(config, context);
        break;

      case AutomationAction.REMOVE_TAG:
        await this.executeRemoveTag(config, context);
        break;

      case AutomationAction.UPDATE_CUSTOMER:
        await this.executeUpdateCustomer(config, context);
        break;

      case AutomationAction.NOTIFY_ADMIN:
        await this.executeNotifyAdmin(config, context);
        break;
    }
  }

  /**
   * Send a template message
   */
  private async executeSendTemplate(
    config: Record<string, unknown>,
    context: TriggerContext
  ): Promise<void> {
    const templateName = config.templateName as string;
    const delay = (config.delayMinutes as number) || 0;

    // Build variables from context
    const variables = this.buildTemplateVariables(
      config.variableMapping as Record<string, string>,
      context
    );

    if (delay > 0) {
      // Queue with delay
      await orderNotificationQueue.add(
        'order-notification',
        {
          type: 'confirmation',
          orderId: context.orderId || '',
          customerId: context.customerId,
          phone: context.phone,
          orderNumber: context.orderNumber || '',
          templateName,
          variables,
        },
        { delay: delay * 60 * 1000 }
      );
    } else {
      // Send immediately
      await whatsappService.sendTemplateMessage(
        context.phone,
        templateName,
        'en',
        [{
          type: 'body',
          parameters: Object.values(variables).map((v) => ({
            type: 'text' as const,
            text: v,
          })),
        }],
        { customerId: context.customerId }
      );
    }
  }

  /**
   * Send a text message
   */
  private async executeSendMessage(
    config: Record<string, unknown>,
    context: TriggerContext
  ): Promise<void> {
    let message = config.message as string;

    // Replace placeholders
    message = this.replacePlaceholders(message, context);

    await whatsappService.sendTextMessage(
      context.phone,
      message,
      { customerId: context.customerId }
    );
  }

  /**
   * Add a tag to customer
   */
  private async executeAddTag(
    config: Record<string, unknown>,
    context: TriggerContext
  ): Promise<void> {
    const tag = config.tag as string;

    await prisma.customer.update({
      where: { id: context.customerId },
      data: {
        tags: { push: tag },
      },
    });
  }

  /**
   * Remove a tag from customer
   */
  private async executeRemoveTag(
    config: Record<string, unknown>,
    context: TriggerContext
  ): Promise<void> {
    const tag = config.tag as string;

    const customer = await prisma.customer.findUnique({
      where: { id: context.customerId },
    });

    if (customer) {
      await prisma.customer.update({
        where: { id: context.customerId },
        data: {
          tags: customer.tags.filter((t) => t !== tag),
        },
      });
    }
  }

  /**
   * Update customer fields
   */
  private async executeUpdateCustomer(
    config: Record<string, unknown>,
    context: TriggerContext
  ): Promise<void> {
    const updates = config.updates as Record<string, unknown>;

    await prisma.customer.update({
      where: { id: context.customerId },
      data: updates,
    });
  }

  /**
   * Notify admin (e.g., for high-value orders)
   */
  private async executeNotifyAdmin(
    config: Record<string, unknown>,
    context: TriggerContext
  ): Promise<void> {
    const adminPhone = config.adminPhone as string;
    let message = config.message as string;

    message = this.replacePlaceholders(message, context);

    // Send to admin phone
    await whatsappService.sendTextMessage(adminPhone, message);
  }

  /**
   * Build template variables from context
   */
  private buildTemplateVariables(
    mapping: Record<string, string> | undefined,
    context: TriggerContext
  ): Record<string, string> {
    if (!mapping) {
      return {
        customerName: context.customerName || 'there',
        orderNumber: context.orderNumber || '',
        orderTotal: context.orderTotal?.toString() || '0',
      };
    }

    const variables: Record<string, string> = {};
    for (const [key, contextKey] of Object.entries(mapping)) {
      variables[key] = ((context as unknown) as Record<string, unknown>)[contextKey]?.toString() || '';
    }
    return variables;
  }

  /**
   * Replace placeholders in message text
   */
  private replacePlaceholders(
    message: string,
    context: TriggerContext
  ): string {
    return message
      .replace(/\{\{customerName\}\}/g, context.customerName || 'there')
      .replace(/\{\{orderNumber\}\}/g, context.orderNumber || '')
      .replace(/\{\{orderTotal\}\}/g, context.orderTotal?.toString() || '0')
      .replace(/\{\{phone\}\}/g, context.phone);
  }

  /**
   * Create default automation rules
   */
  async createDefaultRules(): Promise<void> {
    const defaultRules = [
      {
        name: 'Welcome New Customer',
        description: 'Send welcome message when customer opts in',
        trigger: AutomationTrigger.CUSTOMER_OPTED_IN,
        action: AutomationAction.SEND_TEMPLATE,
        actionConfig: {
          templateName: 'welcome_message',
          variableMapping: {
            '1': 'customerName',
          },
        },
      },
      {
        name: 'Order Confirmation',
        description: 'Send order confirmation when order is created',
        trigger: AutomationTrigger.ORDER_CREATED,
        action: AutomationAction.SEND_TEMPLATE,
        actionConfig: {
          templateName: 'order_confirmation',
          variableMapping: {
            '1': 'customerName',
            '2': 'orderNumber',
            '3': 'orderTotal',
          },
        },
      },
      {
        name: 'Shipping Update',
        description: 'Send shipping notification when order is shipped',
        trigger: AutomationTrigger.ORDER_SHIPPED,
        action: AutomationAction.SEND_TEMPLATE,
        actionConfig: {
          templateName: 'order_shipped',
          variableMapping: {
            '1': 'orderNumber',
            '2': 'trackingNumber',
          },
        },
      },
      {
        name: 'Delivery Confirmation',
        description: 'Send delivery confirmation and request review',
        trigger: AutomationTrigger.ORDER_DELIVERED,
        action: AutomationAction.SEND_TEMPLATE,
        actionConfig: {
          templateName: 'order_delivered',
          delayMinutes: 60, // 1 hour after delivery
          variableMapping: {
            '1': 'customerName',
            '2': 'orderNumber',
          },
        },
      },
      {
        name: 'Tag VIP Customer',
        description: 'Add VIP tag when customer spends over 5000',
        trigger: AutomationTrigger.ORDER_COMPLETED,
        action: AutomationAction.ADD_TAG,
        actionConfig: {
          tag: 'vip',
          condition: {
            totalSpent: { gte: 5000 },
          },
        },
      },
    ];

    for (const rule of defaultRules) {
      await prisma.automationRule.upsert({
        where: { name: rule.name },
        create: {
          name: rule.name,
          description: rule.description,
          trigger: rule.trigger,
          triggerConfig: {},
          action: rule.action,
          actionConfig: rule.actionConfig,
          isActive: true,
        },
        update: {},
      });
    }

    logger.info('Default automation rules created');
  }

  /**
   * Handle incoming keyword triggers
   */
  async handleKeywordTrigger(
    customerId: string,
    phone: string,
    messageText: string
  ): Promise<boolean> {
    const keyword = messageText.toLowerCase().trim();

    // Check for opt-out keywords
    if (['stop', 'unsubscribe', 'opt out', 'optout'].includes(keyword)) {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          optedIn: false,
          optOutDate: new Date(),
        },
      });

      await whatsappService.sendTextMessage(
        phone,
        "You've been unsubscribed from TreatForTails messages. Reply 'START' to subscribe again.",
        { customerId }
      );
      return true;
    }

    // Check for opt-in keywords
    if (['start', 'subscribe', 'opt in', 'optin', 'hi', 'hello'].includes(keyword)) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (customer && !customer.optedIn) {
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            optedIn: true,
            optInDate: new Date(),
            optInSource: 'whatsapp_keyword',
          },
        });

        await this.processTrigger(AutomationTrigger.CUSTOMER_OPTED_IN, {
          customerId,
          phone,
          customerName: customer.name || undefined,
        });
      }
      return true;
    }

    // Check for custom keyword rules
    const keywordRules = await prisma.automationRule.findMany({
      where: {
        trigger: AutomationTrigger.KEYWORD_RECEIVED,
        isActive: true,
      },
    });

    for (const rule of keywordRules) {
      const config = rule.triggerConfig as Record<string, unknown>;
      const keywords = (config.keywords as string[]) || [];

      if (keywords.some((k) => keyword.includes(k.toLowerCase()))) {
        await this.executeRule(rule, {
          customerId,
          phone,
          keyword,
          messageText,
        });
        return true;
      }
    }

    return false;
  }
}

export const automationService = new AutomationService();
