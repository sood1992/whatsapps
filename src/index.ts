/**
 * TreatForTails WhatsApp Automation Tool
 * Main Entry Point
 *
 * A self-hosted WhatsApp Business API automation platform
 * for e-commerce stores running WooCommerce.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/environment';
import { logger } from './utils/logger';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { initializeQueues } from './queues';
import { initializeScheduler } from './scheduler';

// Route imports
import authRoutes from './routes/auth.routes';
import customerRoutes from './routes/customer.routes';
import campaignRoutes from './routes/campaign.routes';
import templateRoutes from './routes/template.routes';
import messageRoutes from './routes/message.routes';
import orderRoutes from './routes/order.routes';
import automationRoutes from './routes/automation.routes';
import analyticsRoutes from './routes/analytics.routes';
import settingsRoutes from './routes/settings.routes';
import webhookRoutes from './routes/webhook.routes';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, 'Incoming request');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'treatfortails-whatsapp',
    version: '1.0.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// Webhook Routes (no auth required)
app.use('/webhooks', webhookRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, url: req.url }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: config.isDev ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down gracefully...');

  await prisma.$disconnect();
  await redis.quit();

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
  try {
    // Connect to database
    await prisma.$connect();
    logger.info('Connected to PostgreSQL database');

    // Connect to Redis
    await redis.ping();
    logger.info('Connected to Redis');

    // Initialize message queues
    await initializeQueues();
    logger.info('Message queues initialized');

    // Initialize scheduler for recurring campaigns
    await initializeScheduler();
    logger.info('Scheduler initialized');

    // Start HTTP server
    app.listen(config.port, () => {
      logger.info(`🚀 TreatForTails WhatsApp Server running on port ${config.port}`);
      logger.info(`📊 Admin Dashboard: ${config.appUrl}/dashboard`);
      logger.info(`🔗 Webhook URL: ${config.appUrl}/webhooks/whatsapp`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();

export default app;
