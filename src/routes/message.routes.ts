/**
 * Message Routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { whatsappService } from '../services/whatsapp.service';
import { queueDirectMessage } from '../queues/message.queue';

const router = Router();
router.use(authMiddleware);

const sendMessageSchema = z.object({
  phone: z.string().min(10),
  type: z.enum(['text', 'template', 'image', 'interactive']),
  content: z.object({
    text: z.string().optional(),
    templateName: z.string().optional(),
    variables: z.record(z.string()).optional(),
    imageUrl: z.string().url().optional(),
    caption: z.string().optional(),
    buttons: z.array(z.object({
      id: z.string(),
      title: z.string(),
    })).optional(),
  }),
});

const bulkSendSchema = z.object({
  phones: z.array(z.string().min(10)),
  type: z.enum(['text', 'template']),
  content: z.object({
    text: z.string().optional(),
    templateName: z.string().optional(),
    variables: z.record(z.string()).optional(),
  }),
});

/**
 * List messages with pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const customerId = req.query.customerId as string;
    const direction = req.query.direction as 'INBOUND' | 'OUTBOUND';

    const where: Record<string, unknown> = {};
    if (customerId) where.customerId = customerId;
    if (direction) where.direction = direction;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { phone: true, name: true },
          },
          template: {
            select: { name: true },
          },
        },
      }),
      prisma.message.count({ where }),
    ]);

    res.json({
      messages,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list messages');
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

/**
 * Get conversation with a customer
 */
router.get('/conversation/:customerId', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string;

    const where: Record<string, unknown> = {
      customerId: req.params.customerId,
    };

    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await prisma.message.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        template: {
          select: { name: true, bodyText: true },
        },
      },
    });

    const customer = await prisma.customer.findUnique({
      where: { id: req.params.customerId },
      select: {
        id: true,
        phone: true,
        name: true,
        optedIn: true,
        lastInteraction: true,
      },
    });

    res.json({
      customer,
      messages: messages.reverse(),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get conversation');
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * Send a direct message
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const data = sendMessageSchema.parse(req.body);

    // Find or create customer
    let phone = data.phone.replace(/[\s\-()]/g, '');
    if (!phone.startsWith('+')) {
      phone = '+91' + phone.replace(/^0/, '');
    }

    let customer = await prisma.customer.findUnique({
      where: { phone },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          phone,
          optedIn: false,
        },
      });
    }

    // Check if customer is opted in for marketing messages
    if (!customer.optedIn && data.type !== 'text') {
      return res.status(400).json({
        error: 'Customer not opted-in. Only reply messages allowed.',
      });
    }

    // Queue the message
    await queueDirectMessage({
      phone,
      customerId: customer.id,
      type: data.type,
      content: data.content,
    });

    res.json({ message: 'Message queued for sending' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    logger.error({ error }, 'Failed to send message');
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * Send immediate message (bypass queue)
 */
router.post('/send-now', async (req: Request, res: Response) => {
  try {
    const data = sendMessageSchema.parse(req.body);

    let phone = data.phone.replace(/[\s\-()]/g, '');
    if (!phone.startsWith('+')) {
      phone = '+91' + phone.replace(/^0/, '');
    }

    let customer = await prisma.customer.findUnique({
      where: { phone },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: { phone, optedIn: false },
      });
    }

    let result;

    switch (data.type) {
      case 'text':
        result = await whatsappService.sendTextMessage(
          phone,
          data.content.text!,
          { customerId: customer.id }
        );
        break;

      case 'template':
        result = await whatsappService.sendTemplateMessage(
          phone,
          data.content.templateName!,
          'en',
          data.content.variables ? [{
            type: 'body',
            parameters: Object.values(data.content.variables).map((v) => ({
              type: 'text' as const,
              text: v,
            })),
          }] : undefined,
          { customerId: customer.id }
        );
        break;

      case 'image':
        result = await whatsappService.sendImageMessage(
          phone,
          data.content.imageUrl!,
          data.content.caption,
          { customerId: customer.id }
        );
        break;

      case 'interactive':
        result = await whatsappService.sendInteractiveButtonMessage(
          phone,
          data.content.text!,
          data.content.buttons!,
          { customerId: customer.id }
        );
        break;
    }

    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    logger.error({ error }, 'Failed to send immediate message');
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * Bulk send messages
 */
router.post('/bulk-send', async (req: Request, res: Response) => {
  try {
    const data = bulkSendSchema.parse(req.body);

    let queued = 0;
    let skipped = 0;

    for (const rawPhone of data.phones) {
      let phone = rawPhone.replace(/[\s\-()]/g, '');
      if (!phone.startsWith('+')) {
        phone = '+91' + phone.replace(/^0/, '');
      }

      const customer = await prisma.customer.findUnique({
        where: { phone },
      });

      if (!customer?.optedIn) {
        skipped++;
        continue;
      }

      await queueDirectMessage({
        phone,
        customerId: customer.id,
        type: data.type,
        content: data.content,
      });

      queued++;
    }

    res.json({
      message: 'Bulk send initiated',
      queued,
      skipped,
      total: data.phones.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    logger.error({ error }, 'Failed to bulk send');
    res.status(500).json({ error: 'Failed to bulk send' });
  }
});

/**
 * Get message by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        template: true,
        campaign: {
          select: { id: true, name: true },
        },
      },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({ message });
  } catch (error) {
    logger.error({ error }, 'Failed to get message');
    res.status(500).json({ error: 'Failed to get message' });
  }
});

export default router;
