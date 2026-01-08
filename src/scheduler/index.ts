/**
 * Campaign Scheduler
 *
 * Handles:
 * - Scheduled campaign execution
 * - Recurring daily/weekly offers
 * - Abandoned cart checks
 * - Analytics aggregation
 */

import { CronJob } from 'cron';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { campaignService } from '../services/campaign.service';
import { abandonedCartService } from '../services/abandoned-cart.service';
import { CampaignStatus } from '@prisma/client';

const scheduledJobs: CronJob[] = [];

/**
 * Initialize all scheduled jobs
 */
export async function initializeScheduler(): Promise<void> {
  logger.info('Initializing scheduler...');

  // Check for scheduled campaigns every minute
  const campaignChecker = new CronJob(
    '* * * * *', // Every minute
    async () => {
      await checkScheduledCampaigns();
    },
    null,
    false,
    config.business.timezone
  );
  scheduledJobs.push(campaignChecker);
  campaignChecker.start();

  // Check for recurring campaigns every hour
  const recurringChecker = new CronJob(
    '0 * * * *', // Every hour
    async () => {
      await checkRecurringCampaigns();
    },
    null,
    false,
    config.business.timezone
  );
  scheduledJobs.push(recurringChecker);
  recurringChecker.start();

  // Check for abandoned carts every 15 minutes
  const cartChecker = new CronJob(
    '*/15 * * * *', // Every 15 minutes
    async () => {
      await abandonedCartService.checkForAbandonedCarts();
    },
    null,
    false,
    config.business.timezone
  );
  scheduledJobs.push(cartChecker);
  cartChecker.start();

  // Aggregate daily stats at midnight
  const statsAggregator = new CronJob(
    '0 0 * * *', // Midnight
    async () => {
      await aggregateDailyStats();
    },
    null,
    false,
    config.business.timezone
  );
  scheduledJobs.push(statsAggregator);
  statsAggregator.start();

  // Clean up old webhook logs weekly
  const logCleaner = new CronJob(
    '0 3 * * 0', // Sunday at 3 AM
    async () => {
      await cleanupOldLogs();
    },
    null,
    false,
    config.business.timezone
  );
  scheduledJobs.push(logCleaner);
  logCleaner.start();

  logger.info(`Scheduler initialized with ${scheduledJobs.length} jobs`);
}

/**
 * Check and execute scheduled campaigns
 */
async function checkScheduledCampaigns(): Promise<void> {
  const now = new Date();

  const scheduledCampaigns = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.SCHEDULED,
      scheduledAt: {
        lte: now,
      },
    },
  });

  for (const campaign of scheduledCampaigns) {
    logger.info({ campaignId: campaign.id, name: campaign.name }, 'Starting scheduled campaign');

    try {
      await campaignService.startCampaign(campaign.id);
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        campaignId: campaign.id,
      }, 'Failed to start scheduled campaign');
    }
  }
}

/**
 * Check and schedule recurring campaigns
 */
async function checkRecurringCampaigns(): Promise<void> {
  const now = new Date();

  const recurringCampaigns = await prisma.campaign.findMany({
    where: {
      isRecurring: true,
      status: {
        in: [CampaignStatus.COMPLETED, CampaignStatus.SCHEDULED],
      },
      nextRunAt: {
        lte: now,
      },
    },
  });

  for (const campaign of recurringCampaigns) {
    logger.info({
      campaignId: campaign.id,
      name: campaign.name,
    }, 'Processing recurring campaign');

    try {
      // Calculate next run time based on recurrence rule
      const nextRun = calculateNextRun(campaign.recurrenceRule || '');

      // Reset campaign for new run
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.SCHEDULED,
          scheduledAt: now,
          nextRunAt: nextRun,
          sent: 0,
          delivered: 0,
          read: 0,
          clicked: 0,
          replied: 0,
          failed: 0,
        },
      });

      // Clear old recipients
      await prisma.campaignRecipient.deleteMany({
        where: { campaignId: campaign.id },
      });

      // Start the campaign
      await campaignService.startCampaign(campaign.id);
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        campaignId: campaign.id,
      }, 'Failed to process recurring campaign');
    }
  }
}

/**
 * Calculate next run time from cron expression
 */
function calculateNextRun(cronExpression: string): Date {
  // Simple implementation for common patterns
  // For production, use a proper cron parser like 'cron-parser'

  const now = new Date();

  // Daily at same time
  if (cronExpression.includes('daily')) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return next;
  }

  // Weekly
  if (cronExpression.includes('weekly')) {
    const next = new Date(now);
    next.setDate(next.getDate() + 7);
    return next;
  }

  // Default: next day
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Aggregate daily statistics
 */
async function aggregateDailyStats(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  logger.info({ date: yesterday }, 'Aggregating daily stats');

  try {
    // Count messages by status
    const messageStats = await prisma.message.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: yesterday,
          lt: today,
        },
      },
      _count: true,
    });

    // Count opt-ins/outs
    const optInCount = await prisma.customer.count({
      where: {
        optInDate: {
          gte: yesterday,
          lt: today,
        },
      },
    });

    const optOutCount = await prisma.customer.count({
      where: {
        optOutDate: {
          gte: yesterday,
          lt: today,
        },
      },
    });

    // Cart recovery stats
    const cartStats = await prisma.abandonedCart.groupBy({
      by: ['recoveryStatus'],
      where: {
        abandonedAt: {
          gte: yesterday,
          lt: today,
        },
      },
      _count: true,
      _sum: {
        subtotal: true,
      },
    });

    // Calculate totals
    let messagesSent = 0;
    let messagesDelivered = 0;
    let messagesRead = 0;
    let messagesFailed = 0;

    for (const stat of messageStats) {
      if (stat.status === 'SENT') messagesSent = stat._count;
      if (stat.status === 'DELIVERED') messagesDelivered = stat._count;
      if (stat.status === 'READ') messagesRead = stat._count;
      if (stat.status === 'FAILED') messagesFailed = stat._count;
    }

    let cartsAbandoned = 0;
    let cartsRecovered = 0;
    let recoveryRevenue = 0;

    for (const stat of cartStats) {
      cartsAbandoned += stat._count;
      if (stat.recoveryStatus === 'RECOVERED') {
        cartsRecovered = stat._count;
        recoveryRevenue = stat._sum.subtotal || 0;
      }
    }

    // Save daily stats
    await prisma.dailyStats.upsert({
      where: { date: yesterday },
      create: {
        date: yesterday,
        messagesSent,
        messagesDelivered,
        messagesRead,
        messagesFailed,
        newOptIns: optInCount,
        optOuts: optOutCount,
        cartsAbandoned,
        cartsRecovered,
        recoveryRevenue,
      },
      update: {
        messagesSent,
        messagesDelivered,
        messagesRead,
        messagesFailed,
        newOptIns: optInCount,
        optOuts: optOutCount,
        cartsAbandoned,
        cartsRecovered,
        recoveryRevenue,
      },
    });

    logger.info({
      date: yesterday,
      messagesSent,
      cartsRecovered,
    }, 'Daily stats aggregated');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Failed to aggregate daily stats');
  }
}

/**
 * Clean up old webhook logs
 */
async function cleanupOldLogs(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30); // Keep 30 days

  try {
    const deleted = await prisma.webhookLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });

    logger.info({ deleted: deleted.count }, 'Old webhook logs cleaned up');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Failed to clean up webhook logs');
  }
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduler(): void {
  for (const job of scheduledJobs) {
    job.stop();
  }
  logger.info('Scheduler stopped');
}
