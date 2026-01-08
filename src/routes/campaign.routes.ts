/**
 * Campaign Management Routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { campaignService } from '../services/campaign.service';
import { CampaignType, CampaignStatus } from '@prisma/client';

const router = Router();
router.use(authMiddleware);

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.nativeEnum(CampaignType),
  templateId: z.string(),
  templateVariables: z.record(z.string()).optional(),
  targetAudience: z.object({
    tags: z.array(z.string()).optional(),
    minOrders: z.number().optional(),
    maxOrders: z.number().optional(),
    minSpent: z.number().optional(),
    maxSpent: z.number().optional(),
    daysSinceLastOrder: z.number().optional(),
    petType: z.string().optional(),
    optedInOnly: z.boolean().optional(),
  }),
  scheduledAt: z.string().datetime().optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
});

/**
 * List campaigns
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as CampaignStatus;
    const type = req.query.type as CampaignType;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          template: {
            select: { name: true, category: true },
          },
          createdBy: {
            select: { name: true },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    res.json({
      campaigns,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list campaigns');
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

/**
 * Get campaign by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        template: true,
        createdBy: {
          select: { name: true, email: true },
        },
        recipients: {
          take: 100,
          include: {
            customer: {
              select: { phone: true, name: true },
            },
          },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (error) {
    logger.error({ error }, 'Failed to get campaign');
    res.status(500).json({ error: 'Failed to get campaign' });
  }
});

/**
 * Create campaign
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createCampaignSchema.parse(req.body);

    const campaignId = await campaignService.createCampaign({
      ...data,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      createdById: req.admin!.id,
    });

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });

    logger.info({ campaignId }, 'Campaign created');

    res.status(201).json({ campaign });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    logger.error({ error }, 'Failed to create campaign');
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

/**
 * Update campaign
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== CampaignStatus.DRAFT) {
      return res.status(400).json({ error: 'Can only edit draft campaigns' });
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: req.body,
    });

    res.json({ campaign: updated });
  } catch (error) {
    logger.error({ error }, 'Failed to update campaign');
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

/**
 * Delete campaign
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status === CampaignStatus.RUNNING) {
      return res.status(400).json({ error: 'Cannot delete running campaign' });
    }

    await prisma.campaignRecipient.deleteMany({
      where: { campaignId: req.params.id },
    });

    await prisma.campaign.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Campaign deleted' });
  } catch (error) {
    logger.error({ error }, 'Failed to delete campaign');
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

/**
 * Schedule campaign
 */
router.post('/:id/schedule', async (req: Request, res: Response) => {
  try {
    const { scheduledAt } = req.body;

    await campaignService.scheduleCampaign(
      req.params.id,
      new Date(scheduledAt)
    );

    res.json({ message: 'Campaign scheduled' });
  } catch (error) {
    logger.error({ error }, 'Failed to schedule campaign');
    res.status(500).json({ error: 'Failed to schedule campaign' });
  }
});

/**
 * Start campaign immediately
 */
router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    await campaignService.startCampaign(req.params.id);

    res.json({ message: 'Campaign started' });
  } catch (error) {
    logger.error({ error }, 'Failed to start campaign');
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

/**
 * Pause campaign
 */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    await campaignService.pauseCampaign(req.params.id);

    res.json({ message: 'Campaign paused' });
  } catch (error) {
    logger.error({ error }, 'Failed to pause campaign');
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

/**
 * Resume campaign
 */
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    await campaignService.resumeCampaign(req.params.id);

    res.json({ message: 'Campaign resumed' });
  } catch (error) {
    logger.error({ error }, 'Failed to resume campaign');
    res.status(500).json({ error: 'Failed to resume campaign' });
  }
});

/**
 * Cancel campaign
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    await campaignService.cancelCampaign(req.params.id);

    res.json({ message: 'Campaign cancelled' });
  } catch (error) {
    logger.error({ error }, 'Failed to cancel campaign');
    res.status(500).json({ error: 'Failed to cancel campaign' });
  }
});

/**
 * Get campaign statistics
 */
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await campaignService.getCampaignStats(req.params.id);

    res.json({ stats });
  } catch (error) {
    logger.error({ error }, 'Failed to get campaign stats');
    res.status(500).json({ error: 'Failed to get campaign stats' });
  }
});

/**
 * Preview campaign recipients
 */
router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const recipients = await campaignService.getCampaignRecipients(req.params.id);

    res.json({
      count: recipients.length,
      sample: recipients.slice(0, 10),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to preview campaign');
    res.status(500).json({ error: 'Failed to preview campaign' });
  }
});

/**
 * Estimate campaign reach
 */
router.post('/estimate-reach', async (req: Request, res: Response) => {
  try {
    const { targetAudience } = req.body;
    const count = await campaignService.estimateReach(targetAudience);

    res.json({ estimatedReach: count });
  } catch (error) {
    logger.error({ error }, 'Failed to estimate reach');
    res.status(500).json({ error: 'Failed to estimate reach' });
  }
});

export default router;
