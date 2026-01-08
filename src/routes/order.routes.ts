/**
 * Order Routes
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { wooCommerceService } from '../services/woocommerce.service';
import { OrderStatus } from '@prisma/client';

const router = Router();
router.use(authMiddleware);

/**
 * List orders with pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as OrderStatus;
    const customerId = req.query.customerId as string;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { orderDate: 'desc' },
        include: {
          customer: {
            select: { phone: true, name: true },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list orders');
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

/**
 * Get order by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order });
  } catch (error) {
    logger.error({ error }, 'Failed to get order');
    res.status(500).json({ error: 'Failed to get order' });
  }
});

/**
 * Sync orders from WooCommerce
 */
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const daysBack = parseInt(req.query.days as string) || 30;

    const result = await wooCommerceService.syncAllOrders(daysBack);

    res.json({
      message: 'Order sync completed',
      synced: result.synced,
      failed: result.failed,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to sync orders');
    res.status(500).json({ error: 'Failed to sync orders' });
  }
});

/**
 * Get order statistics
 */
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const [
      totalOrders,
      completedOrders,
      totalRevenue,
      ordersByStatus,
    ] = await Promise.all([
      prisma.order.count({
        where: { orderDate: { gte: cutoff } },
      }),
      prisma.order.count({
        where: {
          orderDate: { gte: cutoff },
          status: OrderStatus.COMPLETED,
        },
      }),
      prisma.order.aggregate({
        where: { orderDate: { gte: cutoff } },
        _sum: { total: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: { orderDate: { gte: cutoff } },
        _count: true,
      }),
    ]);

    res.json({
      period: `Last ${days} days`,
      totalOrders,
      completedOrders,
      totalRevenue: totalRevenue._sum.total || 0,
      averageOrderValue: totalOrders > 0
        ? (totalRevenue._sum.total || 0) / totalOrders
        : 0,
      ordersByStatus: ordersByStatus.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get order stats');
    res.status(500).json({ error: 'Failed to get order stats' });
  }
});

export default router;
