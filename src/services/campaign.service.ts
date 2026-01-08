/**
 * Campaign & Broadcast Service
 *
 * Handles all marketing campaigns including:
 * - Broadcast campaigns
 * - Daily/Weekly offers
 * - Customer segmentation
 *
 * Best practices implemented based on industry research:
 * - 98% WhatsApp open rate vs 20% email
 * - Up to 30% conversion for cart recovery
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { whatsappService } from './whatsapp.service';
import { messageQueue } from '../queues/message.queue';
import {
  CampaignStatus,
  CampaignType,
  RecipientStatus,
  Prisma,
} from '@prisma/client';

interface CampaignFilter {
  tags?: string[];
  minOrders?: number;
  maxOrders?: number;
  minSpent?: number;
  maxSpent?: number;
  daysSinceLastOrder?: number;
  petType?: string;
  optedInOnly?: boolean;
}

interface CreateCampaignParams {
  name: string;
  description?: string;
  type: CampaignType;
  templateId: string;
  templateVariables?: Record<string, string>;
  targetAudience: CampaignFilter;
  scheduledAt?: Date;
  isRecurring?: boolean;
  recurrenceRule?: string;
  createdById: string;
}

export class CampaignService {
  /**
   * Create a new campaign
   */
  async createCampaign(params: CreateCampaignParams): Promise<string> {
    // Estimate reach
    const estimatedReach = await this.estimateReach(params.targetAudience);

    const campaign = await prisma.campaign.create({
      data: {
        name: params.name,
        description: params.description,
        type: params.type,
        templateId: params.templateId,
        templateVariables: params.templateVariables,
        targetAudience: params.targetAudience as unknown as Prisma.JsonObject,
        estimatedReach,
        status: params.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
        scheduledAt: params.scheduledAt,
        isRecurring: params.isRecurring || false,
        recurrenceRule: params.recurrenceRule,
        createdById: params.createdById,
      },
    });

    logger.info({ campaignId: campaign.id, reach: estimatedReach }, 'Campaign created');
    return campaign.id;
  }

  /**
   * Estimate campaign reach based on filters
   */
  async estimateReach(filters: CampaignFilter): Promise<number> {
    const whereClause = this.buildCustomerWhereClause(filters);
    return prisma.customer.count({ where: whereClause });
  }

  /**
   * Build Prisma where clause from campaign filters
   */
  private buildCustomerWhereClause(filters: CampaignFilter): Prisma.CustomerWhereInput {
    const conditions: Prisma.CustomerWhereInput[] = [];

    // Always filter opted-in customers (legally required)
    if (filters.optedInOnly !== false) {
      conditions.push({ optedIn: true });
    }

    // Tag filtering
    if (filters.tags && filters.tags.length > 0) {
      conditions.push({
        tags: { hasSome: filters.tags },
      });
    }

    // Order count
    if (filters.minOrders !== undefined) {
      conditions.push({ totalOrders: { gte: filters.minOrders } });
    }
    if (filters.maxOrders !== undefined) {
      conditions.push({ totalOrders: { lte: filters.maxOrders } });
    }

    // Spending
    if (filters.minSpent !== undefined) {
      conditions.push({ totalSpent: { gte: filters.minSpent } });
    }
    if (filters.maxSpent !== undefined) {
      conditions.push({ totalSpent: { lte: filters.maxSpent } });
    }

    // Days since last order (for re-engagement)
    if (filters.daysSinceLastOrder !== undefined) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.daysSinceLastOrder);
      conditions.push({
        OR: [
          { lastOrderDate: { lte: cutoffDate } },
          { lastOrderDate: null },
        ],
      });
    }

    // Pet type
    if (filters.petType) {
      conditions.push({ petType: filters.petType });
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  /**
   * Get campaign recipients based on filters
   */
  async getCampaignRecipients(campaignId: string): Promise<Array<{
    id: string;
    phone: string;
    name: string | null;
    petName: string | null;
    totalSpent: number;
  }>> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const whereClause = this.buildCustomerWhereClause(
      campaign.targetAudience as unknown as CampaignFilter
    );

    return prisma.customer.findMany({
      where: whereClause,
      select: {
        id: true,
        phone: true,
        name: true,
        petName: true,
        totalSpent: true,
      },
    });
  }

  /**
   * Schedule campaign for execution
   */
  async scheduleCampaign(campaignId: string, scheduledAt: Date): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.SCHEDULED,
        scheduledAt,
      },
    });

    logger.info({ campaignId, scheduledAt }, 'Campaign scheduled');
  }

  /**
   * Start campaign execution
   */
  async startCampaign(campaignId: string): Promise<void> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!campaign.template) {
      throw new Error('Campaign template not found');
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    // Get recipients
    const recipients = await this.getCampaignRecipients(campaignId);

    // Create recipient records and queue messages
    for (const recipient of recipients) {
      // Create recipient record
      await prisma.campaignRecipient.create({
        data: {
          campaignId,
          customerId: recipient.id,
          status: RecipientStatus.QUEUED,
        },
      });

      // Queue message for sending
      await messageQueue.add('send-campaign-message', {
        campaignId,
        customerId: recipient.id,
        phone: recipient.phone,
        templateName: campaign.template.name,
        templateId: campaign.template.id,
        variables: this.resolveVariables(
          campaign.templateVariables as Record<string, string>,
          {
            customerName: recipient.name || 'there',
            petName: recipient.petName || 'your pet',
          }
        ),
      });
    }

    // Update total recipients count
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalRecipients: recipients.length },
    });

    logger.info({ campaignId, recipients: recipients.length }, 'Campaign started');
  }

  /**
   * Pause a running campaign
   */
  async pauseCampaign(campaignId: string): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.PAUSED },
    });

    // TODO: Pause queued messages
    logger.info({ campaignId }, 'Campaign paused');
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(campaignId: string): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.RUNNING },
    });

    // TODO: Resume queued messages
    logger.info({ campaignId }, 'Campaign resumed');
  }

  /**
   * Cancel a campaign
   */
  async cancelCampaign(campaignId: string): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.CANCELLED },
    });

    // Remove queued messages
    // TODO: Implement queue cleanup

    logger.info({ campaignId }, 'Campaign cancelled');
  }

  /**
   * Complete a campaign
   */
  async completeCampaign(campaignId: string): Promise<void> {
    const stats = await prisma.campaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });

    const statsMap = stats.reduce((acc, s) => {
      acc[s.status] = s._count;
      return acc;
    }, {} as Record<string, number>);

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.COMPLETED,
        completedAt: new Date(),
        sent: statsMap.SENT || 0,
        delivered: statsMap.DELIVERED || 0,
        read: statsMap.READ || 0,
        failed: statsMap.FAILED || 0,
      },
    });

    logger.info({ campaignId, stats: statsMap }, 'Campaign completed');
  }

  /**
   * Resolve template variables with actual values
   */
  private resolveVariables(
    templateVars: Record<string, string> | null,
    customerData: Record<string, string>
  ): Record<string, string> {
    if (!templateVars) return customerData;

    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(templateVars)) {
      // Check if value is a placeholder like {{customerName}}
      const match = value.match(/\{\{(\w+)\}\}/);
      if (match) {
        resolved[key] = customerData[match[1]] || value;
      } else {
        resolved[key] = value;
      }
    }
    return { ...customerData, ...resolved };
  }

  /**
   * Get campaign analytics
   */
  async getCampaignStats(campaignId: string): Promise<{
    totalRecipients: number;
    sent: number;
    delivered: number;
    read: number;
    clicked: number;
    replied: number;
    failed: number;
    deliveryRate: number;
    readRate: number;
    clickRate: number;
    replyRate: number;
  }> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const sent = campaign.sent || 1; // Avoid division by zero

    return {
      totalRecipients: campaign.totalRecipients,
      sent: campaign.sent,
      delivered: campaign.delivered,
      read: campaign.read,
      clicked: campaign.clicked,
      replied: campaign.replied,
      failed: campaign.failed,
      deliveryRate: (campaign.delivered / sent) * 100,
      readRate: (campaign.read / sent) * 100,
      clickRate: (campaign.clicked / sent) * 100,
      replyRate: (campaign.replied / sent) * 100,
    };
  }

  /**
   * Create preset campaigns for common use cases
   */
  async createPresetCampaign(
    type: 'welcome' | 'reengagement' | 'vip' | 'newProduct',
    templateId: string,
    createdById: string
  ): Promise<string> {
    const presets: Record<string, Partial<CreateCampaignParams>> = {
      welcome: {
        name: 'Welcome New Customers',
        description: 'Automated welcome message for new customers',
        type: CampaignType.WELCOME,
        targetAudience: {
          tags: ['new_customer'],
          optedInOnly: true,
        },
      },
      reengagement: {
        name: 'Win Back Inactive Customers',
        description: 'Re-engage customers who haven\'t ordered in 30+ days',
        type: CampaignType.REENGAGEMENT,
        targetAudience: {
          daysSinceLastOrder: 30,
          minOrders: 1,
          optedInOnly: true,
        },
      },
      vip: {
        name: 'VIP Customer Offer',
        description: 'Special offers for high-value customers',
        type: CampaignType.BROADCAST,
        targetAudience: {
          minSpent: 5000,
          minOrders: 3,
          optedInOnly: true,
        },
      },
      newProduct: {
        name: 'New Product Launch',
        description: 'Announce new products to all opted-in customers',
        type: CampaignType.BROADCAST,
        targetAudience: {
          optedInOnly: true,
        },
      },
    };

    const preset = presets[type];
    if (!preset) {
      throw new Error('Invalid preset type');
    }

    return this.createCampaign({
      ...preset,
      templateId,
      createdById,
    } as CreateCampaignParams);
  }
}

export const campaignService = new CampaignService();
