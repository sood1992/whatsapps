/**
 * Automation Rules Routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { automationService } from '../services/automation.service';
import { AutomationTrigger, AutomationAction, Prisma } from '@prisma/client';

const router = Router();
router.use(authMiddleware);

const createRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: z.nativeEnum(AutomationTrigger),
  triggerConfig: z.record(z.unknown()).optional(),
  action: z.nativeEnum(AutomationAction),
  actionConfig: z.record(z.unknown()),
  isActive: z.boolean().default(true),
});

/**
 * List automation rules
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const rules = await prisma.automationRule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({ rules });
  } catch (error) {
    logger.error({ error }, 'Failed to list automation rules');
    res.status(500).json({ error: 'Failed to list automation rules' });
  }
});

/**
 * Get rule by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const rule = await prisma.automationRule.findUnique({
      where: { id: req.params.id },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ rule });
  } catch (error) {
    logger.error({ error }, 'Failed to get rule');
    res.status(500).json({ error: 'Failed to get rule' });
  }
});

/**
 * Create automation rule
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createRuleSchema.parse(req.body);

    const rule = await prisma.automationRule.create({
      data: {
        name: data.name,
        description: data.description,
        trigger: data.trigger,
        triggerConfig: (data.triggerConfig || {}) as Prisma.InputJsonValue,
        action: data.action,
        actionConfig: data.actionConfig as Prisma.InputJsonValue,
        isActive: data.isActive,
      },
    });

    logger.info({ ruleId: rule.id }, 'Automation rule created');

    res.status(201).json({ rule });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    logger.error({ error }, 'Failed to create rule');
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

/**
 * Update rule
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const rule = await prisma.automationRule.update({
      where: { id: req.params.id },
      data: req.body,
    });

    res.json({ rule });
  } catch (error) {
    logger.error({ error }, 'Failed to update rule');
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

/**
 * Delete rule
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.automationRule.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Rule deleted' });
  } catch (error) {
    logger.error({ error }, 'Failed to delete rule');
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

/**
 * Toggle rule active status
 */
router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const rule = await prisma.automationRule.findUnique({
      where: { id: req.params.id },
    });

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const updated = await prisma.automationRule.update({
      where: { id: req.params.id },
      data: { isActive: !rule.isActive },
    });

    res.json({ rule: updated });
  } catch (error) {
    logger.error({ error }, 'Failed to toggle rule');
    res.status(500).json({ error: 'Failed to toggle rule' });
  }
});

/**
 * Create default automation rules
 */
router.post('/setup-defaults', async (req: Request, res: Response) => {
  try {
    await automationService.createDefaultRules();

    const rules = await prisma.automationRule.findMany();

    res.json({
      message: 'Default rules created',
      rules,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to setup default rules');
    res.status(500).json({ error: 'Failed to setup default rules' });
  }
});

/**
 * Test trigger manually
 */
router.post('/test-trigger', async (req: Request, res: Response) => {
  try {
    const { trigger, context } = req.body;

    await automationService.processTrigger(trigger, context);

    res.json({ message: 'Trigger processed' });
  } catch (error) {
    logger.error({ error }, 'Failed to test trigger');
    res.status(500).json({ error: 'Failed to test trigger' });
  }
});

export default router;
