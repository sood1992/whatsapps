/**
 * Analytics Routes
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { abandonedCartService } from '../services/abandoned-cart.service';

const router = Router();
router.use(authMiddleware);

/**
 * Get dashboard overview
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalCustomers,
      optedInCustomers,
      todayMessages,
      totalOrders,
      cartRecoveryStats,
      recentCampaigns,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { optedIn: true } }),
      prisma.message.count({
        where: { createdAt: { gte: today } },
      }),
      prisma.order.count({
        where: { orderDate: { gte: thirtyDaysAgo } },
      }),
      abandonedCartService.getRecoveryStats(30),
      prisma.campaign.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          sent: true,
          delivered: true,
          read: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({
      overview: {
        totalCustomers,
        optedInCustomers,
        optInRate: totalCustomers > 0 ? (optedInCustomers / totalCustomers) * 100 : 0,
        todayMessages,
        totalOrders,
      },
      cartRecovery: cartRecoveryStats,
      recentCampaigns,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get dashboard');
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
});

/**
 * Get daily stats
 */
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const stats = await prisma.dailyStats.findMany({
      orderBy: { date: 'desc' },
      take: days,
    });

    res.json({ stats: stats.reverse() });
  } catch (error) {
    logger.error({ error }, 'Failed to get daily stats');
    res.status(500).json({ error: 'Failed to get daily stats' });
  }
});

/**
 * Get message statistics
 */
router.get('/messages', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const [statusStats, typeStats, dailyVolume] = await Promise.all([
      prisma.message.groupBy({
        by: ['status'],
        where: { createdAt: { gte: cutoff } },
        _count: true,
      }),
      prisma.message.groupBy({
        by: ['type'],
        where: { createdAt: { gte: cutoff } },
        _count: true,
      }),
      prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM "Message"
        WHERE created_at >= ${cutoff}
        GROUP BY DATE(created_at)
        ORDER BY date
      `,
    ]);

    res.json({
      period: `Last ${days} days`,
      byStatus: statusStats.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {} as Record<string, number>),
      byType: typeStats.reduce((acc, s) => {
        acc[s.type] = s._count;
        return acc;
      }, {} as Record<string, number>),
      dailyVolume,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get message stats');
    res.status(500).json({ error: 'Failed to get message stats' });
  }
});

/**
 * Get campaign performance
 */
router.get('/campaigns', async (req: Request, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: { in: ['COMPLETED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        totalRecipients: true,
        sent: true,
        delivered: true,
        read: true,
        clicked: true,
        replied: true,
        failed: true,
        createdAt: true,
        completedAt: true,
      },
    });

    // Calculate rates
    const campaignsWithRates = campaigns.map((c) => {
      const sent = c.sent || 1;
      return {
        ...c,
        deliveryRate: ((c.delivered / sent) * 100).toFixed(1),
        readRate: ((c.read / sent) * 100).toFixed(1),
        clickRate: ((c.clicked / sent) * 100).toFixed(1),
        replyRate: ((c.replied / sent) * 100).toFixed(1),
      };
    });

    res.json({ campaigns: campaignsWithRates });
  } catch (error) {
    logger.error({ error }, 'Failed to get campaign performance');
    res.status(500).json({ error: 'Failed to get campaign performance' });
  }
});

/**
 * Get cart recovery analytics
 */
router.get('/cart-recovery', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const stats = await abandonedCartService.getRecoveryStats(days);

    // Get daily recovery data
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const dailyData = await prisma.abandonedCart.groupBy({
      by: ['recoveryStatus'],
      where: { abandonedAt: { gte: cutoff } },
      _count: true,
      _sum: { subtotal: true },
    });

    res.json({
      period: `Last ${days} days`,
      stats,
      byStatus: dailyData.reduce((acc, d) => {
        acc[d.recoveryStatus] = {
          count: d._count,
          value: d._sum.subtotal || 0,
        };
        return acc;
      }, {} as Record<string, { count: number; value: number }>),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get cart recovery analytics');
    res.status(500).json({ error: 'Failed to get cart recovery analytics' });
  }
});

/**
 * Get customer growth
 */
router.get('/customers', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const [newCustomers, newOptIns, topCustomers] = await Promise.all([
      prisma.customer.count({
        where: { createdAt: { gte: cutoff } },
      }),
      prisma.customer.count({
        where: {
          optInDate: { gte: cutoff },
          optedIn: true,
        },
      }),
      prisma.customer.findMany({
        where: { optedIn: true },
        orderBy: { totalSpent: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          phone: true,
          totalOrders: true,
          totalSpent: true,
          lastOrderDate: true,
        },
      }),
    ]);

    res.json({
      period: `Last ${days} days`,
      newCustomers,
      newOptIns,
      topCustomers,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get customer analytics');
    res.status(500).json({ error: 'Failed to get customer analytics' });
  }
});

/**
 * Export analytics data
 */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string;
    const days = parseInt(req.query.days as string) || 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    let data;

    switch (type) {
      case 'customers':
        data = await prisma.customer.findMany({
          where: { createdAt: { gte: cutoff } },
          select: {
            phone: true,
            name: true,
            email: true,
            optedIn: true,
            totalOrders: true,
            totalSpent: true,
            createdAt: true,
          },
        });
        break;

      case 'messages':
        data = await prisma.message.findMany({
          where: { createdAt: { gte: cutoff } },
          include: {
            customer: { select: { phone: true } },
          },
        });
        break;

      case 'campaigns':
        data = await prisma.campaign.findMany({
          where: { createdAt: { gte: cutoff } },
        });
        break;

      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    res.json({ data });
  } catch (error) {
    logger.error({ error }, 'Failed to export data');
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
