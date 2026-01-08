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
import path from 'path';
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

// Track connection status for health checks
const connectionStatus = {
  database: false,
  redis: false,
  queues: false,
  scheduler: false,
};

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for dashboard
}));
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

// Request logging (skip health checks to reduce noise)
app.use((req, res, next) => {
  if (req.url !== '/health') {
    logger.info({
      method: req.method,
      url: req.url,
      ip: req.ip,
    }, 'Incoming request');
  }
  next();
});

// Health check endpoint - always returns 200 for Railway healthchecks
app.get('/health', (req, res) => {
  const allConnected = connectionStatus.database && connectionStatus.redis;
  res.json({
    status: allConnected ? 'healthy' : 'starting',
    timestamp: new Date().toISOString(),
    service: 'treatfortails-whatsapp',
    version: '1.0.0',
    connections: connectionStatus,
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

// Serve dashboard static files in production
if (config.isProd) {
  const dashboardPath = path.join(__dirname, 'dashboard');
  app.use(express.static(dashboardPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/webhooks/') || req.url === '/health') {
      return next();
    }
    res.sendFile(path.join(dashboardPath, 'index.html'));
  });
}

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

  try {
    await prisma.$disconnect();
  } catch (e) {
    logger.error({ error: e }, 'Error disconnecting from database');
  }

  try {
    await redis.quit();
  } catch (e) {
    logger.error({ error: e }, 'Error disconnecting from Redis');
  }

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize connections (non-blocking)
async function initializeConnections() {
  // Connect to database
  try {
    await prisma.$connect();
    connectionStatus.database = true;
    logger.info('Connected to PostgreSQL database');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database - will retry');
    // Retry after 5 seconds
    setTimeout(async () => {
      try {
        await prisma.$connect();
        connectionStatus.database = true;
        logger.info('Connected to PostgreSQL database (retry)');
      } catch (e) {
        logger.error({ error: e }, 'Database connection retry failed');
      }
    }, 5000);
  }

  // Connect to Redis
  try {
    await redis.ping();
    connectionStatus.redis = true;
    logger.info('Connected to Redis');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to Redis - will retry');
    // Redis has built-in retry, just log
  }

  // Initialize message queues (only if Redis is connected)
  if (connectionStatus.redis) {
    try {
      await initializeQueues();
      connectionStatus.queues = true;
      logger.info('Message queues initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize queues');
    }
  }

  // Initialize scheduler
  try {
    await initializeScheduler();
    connectionStatus.scheduler = true;
    logger.info('Scheduler initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize scheduler');
  }
}

// Start server immediately, then initialize connections
app.listen(config.port, () => {
  logger.info(`TreatForTails WhatsApp Server running on port ${config.port}`);
  logger.info(`Admin Dashboard: ${config.appUrl}`);
  logger.info(`Webhook URL: ${config.appUrl}/webhooks/whatsapp`);
  logger.info(`Health Check: ${config.appUrl}/health`);

  // Initialize connections after server starts
  initializeConnections().catch((error) => {
    logger.error({ error }, 'Connection initialization error');
  });
});

export default app;
