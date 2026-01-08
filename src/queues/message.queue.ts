/**
 * Message Queue Processor
 *
 * Handles all WhatsApp message sending with:
 * - Rate limiting (80 msgs/min default)
 * - Retry logic
 * - Time window enforcement
 * - Status tracking
 */

import { Job, Queue } from 'bullmq';
import { redis } from '../config/redis';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { whatsappService } from '../services/whatsapp.service';
import { prisma } from '../config/database';
import { RecipientStatus } from '@prisma/client';

// Queue instance (re-exported from index)
export const messageQueue = new Queue('whatsapp-messages', {
  connection: redis,
});

interface CampaignMessageJob {
  campaignId: string;
  customerId: string;
  phone: string;
  templateName: string;
  templateId: string;
  variables: Record<string, string>;
}

interface DirectMessageJob {
  phone: string;
  customerId?: string;
  type: 'text' | 'template' | 'image' | 'interactive';
  content: {
    text?: string;
    templateName?: string;
    templateId?: string;
    variables?: Record<string, string>;
    imageUrl?: string;
    caption?: string;
    buttons?: Array<{ id: string; title: string }>;
  };
}

type MessageJob = CampaignMessageJob | DirectMessageJob;

/**
 * Check if current time is within messaging window
 */
function isWithinMessagingWindow(): boolean {
  const now = new Date();
  const hour = now.getHours();

  return hour >= config.messaging.windowStart && hour < config.messaging.windowEnd;
}

/**
 * Get delay until messaging window opens
 */
function getDelayUntilWindowOpens(): number {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setHours(config.messaging.windowStart, 0, 0, 0);

  if (now.getHours() >= config.messaging.windowEnd) {
    // Window closed for today, schedule for tomorrow
    windowStart.setDate(windowStart.getDate() + 1);
  }

  return windowStart.getTime() - now.getTime();
}

/**
 * Process campaign message job
 */
async function processCampaignMessage(job: Job<CampaignMessageJob>): Promise<void> {
  const { campaignId, customerId, phone, templateName, templateId, variables } = job.data;

  // Check messaging window
  if (!isWithinMessagingWindow()) {
    const delay = getDelayUntilWindowOpens();
    logger.info({
      jobId: job.id,
      delayMs: delay,
    }, 'Message delayed until messaging window opens');

    // Re-queue with delay
    await messageQueue.add('send-campaign-message', job.data, {
      delay,
      jobId: `${job.id}-delayed`,
    });
    return;
  }

  // Build template components from variables
  const components = Object.entries(variables).map(([key, value]) => ({
    type: 'body' as const,
    parameters: [{ type: 'text' as const, text: value }],
  }));

  try {
    const result = await whatsappService.sendTemplateMessage(
      phone,
      templateName,
      'en',
      components.length > 0 ? components : undefined,
      {
        customerId,
        campaignId,
        templateId,
      }
    );

    // Update campaign recipient status
    await prisma.campaignRecipient.updateMany({
      where: {
        campaignId,
        customerId,
      },
      data: {
        status: RecipientStatus.SENT,
        sentAt: new Date(),
        whatsappMessageId: result.messageId,
      },
    });

    // Update campaign stats
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sent: { increment: 1 },
      },
    });

    logger.info({
      jobId: job.id,
      campaignId,
      customerId,
      messageId: result.messageId,
    }, 'Campaign message sent');
  } catch (error) {
    // Update recipient as failed
    await prisma.campaignRecipient.updateMany({
      where: {
        campaignId,
        customerId,
      },
      data: {
        status: RecipientStatus.FAILED,
        failedAt: new Date(),
        failureReason: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    // Update campaign failed count
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        failed: { increment: 1 },
      },
    });

    throw error;
  }
}

/**
 * Process direct message job
 */
async function processDirectMessage(job: Job<DirectMessageJob>): Promise<void> {
  const { phone, customerId, type, content } = job.data;

  // Check messaging window for marketing messages
  if (!isWithinMessagingWindow() && type !== 'text') {
    const delay = getDelayUntilWindowOpens();
    await messageQueue.add('send-direct-message', job.data, {
      delay,
      jobId: `${job.id}-delayed`,
    });
    return;
  }

  try {
    let messageId: string;

    switch (type) {
      case 'text':
        const textResult = await whatsappService.sendTextMessage(
          phone,
          content.text!,
          { customerId }
        );
        messageId = textResult.messageId;
        break;

      case 'template':
        const templateResult = await whatsappService.sendTemplateMessage(
          phone,
          content.templateName!,
          'en',
          content.variables ? [{
            type: 'body',
            parameters: Object.values(content.variables).map(v => ({
              type: 'text' as const,
              text: v,
            })),
          }] : undefined,
          { customerId, templateId: content.templateId }
        );
        messageId = templateResult.messageId;
        break;

      case 'image':
        const imageResult = await whatsappService.sendImageMessage(
          phone,
          content.imageUrl!,
          content.caption,
          { customerId }
        );
        messageId = imageResult.messageId;
        break;

      case 'interactive':
        const interactiveResult = await whatsappService.sendInteractiveButtonMessage(
          phone,
          content.text!,
          content.buttons!,
          { customerId }
        );
        messageId = interactiveResult.messageId;
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    logger.info({
      jobId: job.id,
      phone,
      type,
      messageId,
    }, 'Direct message sent');
  } catch (error) {
    logger.error({
      jobId: job.id,
      phone,
      type,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Failed to send direct message');
    throw error;
  }
}

/**
 * Main queue processor
 */
export async function messageQueueProcessor(job: Job): Promise<void> {
  logger.debug({ jobId: job.id, name: job.name }, 'Processing message job');

  switch (job.name) {
    case 'send-campaign-message':
      await processCampaignMessage(job as Job<CampaignMessageJob>);
      break;

    case 'send-direct-message':
      await processDirectMessage(job as Job<DirectMessageJob>);
      break;

    default:
      logger.warn({ jobName: job.name }, 'Unknown job type');
  }
}

// Helper functions for adding jobs

export async function queueCampaignMessage(
  data: CampaignMessageJob,
  options?: { delay?: number; priority?: number }
): Promise<void> {
  await messageQueue.add('send-campaign-message', data, {
    delay: options?.delay,
    priority: options?.priority,
  });
}

export async function queueDirectMessage(
  data: DirectMessageJob,
  options?: { delay?: number; priority?: number }
): Promise<void> {
  await messageQueue.add('send-direct-message', data, {
    delay: options?.delay,
    priority: options?.priority,
  });
}
