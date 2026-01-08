/**
 * Customer Management Routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

const createCustomerSchema = z.object({
  phone: z.string().min(10),
  name: z.string().optional(),
  email: z.string().email().optional(),
  petName: z.string().optional(),
  petType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  optedIn: z.boolean().default(false),
});

const updateCustomerSchema = createCustomerSchema.partial();

/**
 * List customers with pagination and filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const optedIn = req.query.optedIn === 'true' ? true : req.query.optedIn === 'false' ? false : undefined;
    const tag = req.query.tag as string;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (optedIn !== undefined) {
      where.optedIn = optedIn;
    }

    if (tag) {
      where.tags = { has: tag };
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          optedIn: true,
          tags: true,
          totalOrders: true,
          totalSpent: true,
          lastOrderDate: true,
          petName: true,
          petType: true,
          createdAt: true,
        },
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({
      customers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list customers');
    res.status(500).json({ error: 'Failed to list customers' });
  }
});

/**
 * Get customer by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        orders: {
          take: 10,
          orderBy: { orderDate: 'desc' },
        },
        messages: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
        carts: {
          take: 5,
          orderBy: { abandonedAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json({ customer });
  } catch (error) {
    logger.error({ error }, 'Failed to get customer');
    res.status(500).json({ error: 'Failed to get customer' });
  }
});

/**
 * Create customer
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createCustomerSchema.parse(req.body);

    // Format phone number
    let phone = data.phone.replace(/[\s\-()]/g, '');
    if (!phone.startsWith('+')) {
      phone = '+91' + phone.replace(/^0/, '');
    }

    const existing = await prisma.customer.findUnique({ where: { phone } });
    if (existing) {
      return res.status(400).json({ error: 'Customer with this phone already exists' });
    }

    const customer = await prisma.customer.create({
      data: {
        phone,
        name: data.name,
        email: data.email,
        petName: data.petName,
        petType: data.petType,
        tags: data.tags || [],
        optedIn: data.optedIn,
        optInDate: data.optedIn ? new Date() : null,
        optInSource: data.optedIn ? 'manual' : null,
      },
    });

    logger.info({ customerId: customer.id }, 'Customer created');

    res.status(201).json({ customer });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    logger.error({ error }, 'Failed to create customer');
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

/**
 * Update customer
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const data = updateCustomerSchema.parse(req.body);

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(data.optedIn === true && {
          optInDate: new Date(),
          optInSource: 'manual_update',
        }),
        ...(data.optedIn === false && {
          optOutDate: new Date(),
        }),
      },
    });

    logger.info({ customerId: customer.id }, 'Customer updated');

    res.json({ customer });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    logger.error({ error }, 'Failed to update customer');
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

/**
 * Delete customer
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.customer.delete({
      where: { id: req.params.id },
    });

    logger.info({ customerId: req.params.id }, 'Customer deleted');

    res.json({ message: 'Customer deleted' });
  } catch (error) {
    logger.error({ error }, 'Failed to delete customer');
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

/**
 * Add tag to customer
 */
router.post('/:id/tags', async (req: Request, res: Response) => {
  try {
    const { tag } = req.body;

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        tags: { push: tag },
      },
    });

    res.json({ customer });
  } catch (error) {
    logger.error({ error }, 'Failed to add tag');
    res.status(500).json({ error: 'Failed to add tag' });
  }
});

/**
 * Remove tag from customer
 */
router.delete('/:id/tags/:tag', async (req: Request, res: Response) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        tags: customer.tags.filter((t) => t !== req.params.tag),
      },
    });

    res.json({ message: 'Tag removed' });
  } catch (error) {
    logger.error({ error }, 'Failed to remove tag');
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

/**
 * Bulk import customers
 */
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { customers } = req.body;

    let imported = 0;
    let failed = 0;

    for (const data of customers) {
      try {
        let phone = data.phone.replace(/[\s\-()]/g, '');
        if (!phone.startsWith('+')) {
          phone = '+91' + phone.replace(/^0/, '');
        }

        await prisma.customer.upsert({
          where: { phone },
          create: {
            phone,
            name: data.name,
            email: data.email,
            petName: data.petName,
            petType: data.petType,
            tags: data.tags || [],
            optedIn: data.optedIn || false,
            optInDate: data.optedIn ? new Date() : null,
            optInSource: data.optedIn ? 'bulk_import' : null,
          },
          update: {
            name: data.name,
            email: data.email,
            petName: data.petName,
            petType: data.petType,
          },
        });
        imported++;
      } catch {
        failed++;
      }
    }

    logger.info({ imported, failed }, 'Bulk import completed');

    res.json({ imported, failed });
  } catch (error) {
    logger.error({ error }, 'Bulk import failed');
    res.status(500).json({ error: 'Bulk import failed' });
  }
});

/**
 * Get all unique tags
 */
router.get('/meta/tags', async (req: Request, res: Response) => {
  try {
    const customers = await prisma.customer.findMany({
      select: { tags: true },
    });

    const allTags = new Set<string>();
    customers.forEach((c) => c.tags.forEach((t) => allTags.add(t)));

    res.json({ tags: Array.from(allTags).sort() });
  } catch (error) {
    logger.error({ error }, 'Failed to get tags');
    res.status(500).json({ error: 'Failed to get tags' });
  }
});

export default router;
