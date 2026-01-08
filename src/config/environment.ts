/**
 * Environment Configuration
 * Centralized configuration management with validation
 */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Use lenient schema that allows server to start even without all config
const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  APP_URL: z.string().default('http://localhost:3000'),
  APP_SECRET: z.string().default('change-this-to-a-secure-secret-key-32chars'),

  // Database
  DATABASE_URL: z.string().default(''),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // WhatsApp Business API
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('verify-token'),
  WHATSAPP_API_VERSION: z.string().default('v18.0'),

  // WooCommerce
  WOOCOMMERCE_URL: z.string().default(''),
  WOOCOMMERCE_CONSUMER_KEY: z.string().default(''),
  WOOCOMMERCE_CONSUMER_SECRET: z.string().default(''),
  WOOCOMMERCE_WEBHOOK_SECRET: z.string().optional(),

  // Business Settings
  BUSINESS_NAME: z.string().default('TreatForTails'),
  BUSINESS_PHONE: z.string().optional(),
  BUSINESS_WEBSITE: z.string().optional(),
  BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),

  // Message Settings
  MESSAGE_WINDOW_START: z.string().transform(Number).default('9'),
  MESSAGE_WINDOW_END: z.string().transform(Number).default('21'),
  ABANDONED_CART_DELAY_MINUTES: z.string().transform(Number).default('60'),
  ABANDONED_CART_FOLLOWUP_HOURS: z.string().transform(Number).default('24'),
  MAX_MESSAGES_PER_MINUTE: z.string().transform(Number).default('80'),
  MAX_MESSAGES_PER_DAY: z.string().transform(Number).default('1000'),

  // Admin
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().default('change-this-to-a-secure-jwt-secret-32'),
  JWT_EXPIRES_IN: z.string().default('7d'),
});

function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);

    // Log warnings for missing critical config
    const warnings: string[] = [];
    if (!parsed.DATABASE_URL) warnings.push('DATABASE_URL');
    if (!parsed.WHATSAPP_PHONE_NUMBER_ID) warnings.push('WHATSAPP_PHONE_NUMBER_ID');
    if (!parsed.WHATSAPP_ACCESS_TOKEN) warnings.push('WHATSAPP_ACCESS_TOKEN');
    if (!parsed.WOOCOMMERCE_URL) warnings.push('WOOCOMMERCE_URL');

    if (warnings.length > 0) {
      console.warn(`⚠️  Missing environment variables: ${warnings.join(', ')}`);
      console.warn('The server will start but some features will not work.');
      console.warn('Please configure these variables in Railway.');
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => e.path.join('.')).join(', ');
      console.error(`❌ Invalid environment variables: ${missingVars}`);
    }
    throw error;
  }
}

const env = validateEnv();

export const config = {
  // Application
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  appUrl: env.APP_URL,
  appSecret: env.APP_SECRET,
  corsOrigins: env.NODE_ENV === 'development'
    ? ['http://localhost:3000', 'http://localhost:5173']
    : [env.APP_URL],

  // Database
  databaseUrl: env.DATABASE_URL,

  // Redis
  redisUrl: env.REDIS_URL,

  // WhatsApp
  whatsapp: {
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    webhookVerifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    apiVersion: env.WHATSAPP_API_VERSION,
    apiUrl: `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}`,
  },

  // WooCommerce
  woocommerce: {
    url: env.WOOCOMMERCE_URL,
    consumerKey: env.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: env.WOOCOMMERCE_CONSUMER_SECRET,
    webhookSecret: env.WOOCOMMERCE_WEBHOOK_SECRET,
  },

  // Business
  business: {
    name: env.BUSINESS_NAME,
    phone: env.BUSINESS_PHONE,
    website: env.BUSINESS_WEBSITE,
    timezone: env.BUSINESS_TIMEZONE,
  },

  // Messaging
  messaging: {
    windowStart: env.MESSAGE_WINDOW_START,
    windowEnd: env.MESSAGE_WINDOW_END,
    abandonedCartDelayMinutes: env.ABANDONED_CART_DELAY_MINUTES,
    abandonedCartFollowupHours: env.ABANDONED_CART_FOLLOWUP_HOURS,
    maxMessagesPerMinute: env.MAX_MESSAGES_PER_MINUTE,
    maxMessagesPerDay: env.MAX_MESSAGES_PER_DAY,
  },

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },

  // Admin
  admin: {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  },
};

export type Config = typeof config;
