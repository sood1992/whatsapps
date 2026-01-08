/**
 * Environment Configuration
 * Centralized configuration management with validation
 */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_SECRET: z.string().min(32),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // WhatsApp Business API
  WHATSAPP_PHONE_NUMBER_ID: z.string(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string(),
  WHATSAPP_ACCESS_TOKEN: z.string(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string(),
  WHATSAPP_API_VERSION: z.string().default('v18.0'),

  // WooCommerce
  WOOCOMMERCE_URL: z.string().url(),
  WOOCOMMERCE_CONSUMER_KEY: z.string(),
  WOOCOMMERCE_CONSUMER_SECRET: z.string(),
  WOOCOMMERCE_WEBHOOK_SECRET: z.string().optional(),

  // Business Settings
  BUSINESS_NAME: z.string().default('TreatForTails'),
  BUSINESS_PHONE: z.string().optional(),
  BUSINESS_WEBSITE: z.string().url().optional(),
  BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),

  // Message Settings
  MESSAGE_WINDOW_START: z.string().transform(Number).default('9'),
  MESSAGE_WINDOW_END: z.string().transform(Number).default('21'),
  ABANDONED_CART_DELAY_MINUTES: z.string().transform(Number).default('60'),
  ABANDONED_CART_FOLLOWUP_HOURS: z.string().transform(Number).default('24'),
  MAX_MESSAGES_PER_MINUTE: z.string().transform(Number).default('80'),
  MAX_MESSAGES_PER_DAY: z.string().transform(Number).default('1000'),

  // Admin
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
});

function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => e.path.join('.')).join(', ');
      console.error(`❌ Missing or invalid environment variables: ${missingVars}`);
      console.error('Please check your .env file against .env.example');
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
