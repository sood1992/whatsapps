/**
 * Settings Routes
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { whatsappService } from '../services/whatsapp.service';

const router = Router();
router.use(authMiddleware);

/**
 * Get all settings
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await prisma.setting.findMany();

    const settingsMap = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, unknown>);

    res.json({ settings: settingsMap });
  } catch (error) {
    logger.error({ error }, 'Failed to get settings');
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * Update settings
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    for (const [key, value] of Object.entries(updates)) {
      await prisma.setting.upsert({
        where: { key },
        create: { key, value: value as object },
        update: { value: value as object },
      });
    }

    res.json({ message: 'Settings updated' });
  } catch (error) {
    logger.error({ error }, 'Failed to update settings');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * Get WhatsApp account info
 */
router.get('/whatsapp', async (req: Request, res: Response) => {
  try {
    const info = await whatsappService.getPhoneNumberInfo();

    res.json({
      whatsapp: {
        verifiedName: info.verified_name,
        phoneNumber: info.display_phone_number,
        qualityRating: info.quality_rating,
        messagingLimit: info.messaging_limit_tier,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get WhatsApp info');
    res.status(500).json({ error: 'Failed to get WhatsApp info' });
  }
});

/**
 * Test WhatsApp connection
 */
router.post('/whatsapp/test', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;

    const result = await whatsappService.sendTextMessage(
      phone,
      '✅ Test message from TreatForTails WhatsApp Automation!\n\nIf you received this, your WhatsApp Business API is configured correctly.'
    );

    res.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    logger.error({ error }, 'WhatsApp test failed');
    res.status(500).json({ error: 'WhatsApp test failed' });
  }
});

/**
 * Get webhook URLs
 */
router.get('/webhooks', async (req: Request, res: Response) => {
  try {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    res.json({
      webhooks: {
        whatsapp: `${appUrl}/webhooks/whatsapp`,
        woocommerceOrder: `${appUrl}/webhooks/woocommerce/order`,
        woocommerceCustomer: `${appUrl}/webhooks/woocommerce/customer`,
        woocommerceCart: `${appUrl}/webhooks/woocommerce/cart`,
      },
      instructions: {
        whatsapp: 'Add this URL in Meta Business Suite > WhatsApp > Configuration > Webhooks',
        woocommerce: 'Add webhooks in WooCommerce > Settings > Advanced > Webhooks',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get webhook URLs');
    res.status(500).json({ error: 'Failed to get webhook URLs' });
  }
});

/**
 * Get recent webhook logs
 */
router.get('/webhook-logs', async (req: Request, res: Response) => {
  try {
    const logs = await prisma.webhookLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ logs });
  } catch (error) {
    logger.error({ error }, 'Failed to get webhook logs');
    res.status(500).json({ error: 'Failed to get webhook logs' });
  }
});

export default router;
