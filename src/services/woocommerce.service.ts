/**
 * WooCommerce Integration Service
 *
 * Handles all WooCommerce REST API interactions:
 * - Order synchronization
 * - Customer data sync
 * - Abandoned cart detection
 * - Real-time webhook processing
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { OrderStatus } from '@prisma/client';

interface WooCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  billing: {
    phone: string;
    email: string;
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  date_created: string;
  orders_count: number;
  total_spent: string;
}

interface WooOrder {
  id: number;
  number: string;
  status: string;
  total: string;
  currency: string;
  customer_id: number;
  billing: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  line_items: Array<{
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    subtotal: string;
    total: string;
    price: number;
    sku: string;
    image: { src: string };
  }>;
  date_created: string;
  date_completed: string | null;
  meta_data: Array<{ key: string; value: string }>;
}

interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  price: string;
  regular_price: string;
  sale_price: string;
  images: Array<{ src: string; alt: string }>;
  categories: Array<{ id: number; name: string }>;
  stock_status: string;
}

export class WooCommerceService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.woocommerce.url}/wp-json/wc/v3`,
      auth: {
        username: config.woocommerce.consumerKey,
        password: config.woocommerce.consumerSecret,
      },
      timeout: 30000,
    });
  }

  /**
   * Verify webhook signature from WooCommerce
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!config.woocommerce.webhookSecret) {
      logger.warn('WooCommerce webhook secret not configured');
      return true; // Skip verification if no secret
    }

    const computedSignature = crypto
      .createHmac('sha256', config.woocommerce.webhookSecret)
      .update(payload, 'utf8')
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  }

  /**
   * Fetch a single order by ID
   */
  async getOrder(orderId: number): Promise<WooOrder> {
    const response = await this.client.get<WooOrder>(`/orders/${orderId}`);
    return response.data;
  }

  /**
   * Fetch orders with filters
   */
  async getOrders(params?: {
    status?: string;
    after?: string;
    before?: string;
    per_page?: number;
    page?: number;
    customer?: number;
  }): Promise<WooOrder[]> {
    const response = await this.client.get<WooOrder[]>('/orders', { params });
    return response.data;
  }

  /**
   * Fetch a customer by ID
   */
  async getCustomer(customerId: number): Promise<WooCustomer> {
    const response = await this.client.get<WooCustomer>(`/customers/${customerId}`);
    return response.data;
  }

  /**
   * Search customers
   */
  async searchCustomers(params?: {
    email?: string;
    search?: string;
    per_page?: number;
    page?: number;
  }): Promise<WooCustomer[]> {
    const response = await this.client.get<WooCustomer[]>('/customers', { params });
    return response.data;
  }

  /**
   * Fetch products
   */
  async getProducts(params?: {
    category?: number;
    tag?: number;
    on_sale?: boolean;
    featured?: boolean;
    per_page?: number;
    page?: number;
  }): Promise<WooProduct[]> {
    const response = await this.client.get<WooProduct[]>('/products', { params });
    return response.data;
  }

  /**
   * Get abandoned carts (requires WooCommerce plugin or custom endpoint)
   * This uses the standard session/cart tracking approach
   */
  async getAbandonedCarts(): Promise<Array<{
    cart_token: string;
    customer_email: string;
    customer_phone: string;
    items: unknown[];
    subtotal: number;
    abandoned_at: string;
  }>> {
    try {
      // Try custom endpoint first (if you have a cart abandonment plugin)
      const response = await this.client.get('/abandoned-carts');
      return response.data;
    } catch {
      // Fall back to tracking via our own system
      logger.info('Using internal abandoned cart tracking');
      return [];
    }
  }

  /**
   * Create/update a coupon for recovery
   */
  async createRecoveryCoupon(params: {
    code: string;
    discountType: 'percent' | 'fixed_cart';
    amount: string;
    expiryDays: number;
    usageLimit: number;
    customerEmail?: string;
  }): Promise<{ id: number; code: string }> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + params.expiryDays);

    const response = await this.client.post('/coupons', {
      code: params.code,
      discount_type: params.discountType,
      amount: params.amount,
      date_expires: expiryDate.toISOString(),
      usage_limit: params.usageLimit,
      individual_use: true,
      email_restrictions: params.customerEmail ? [params.customerEmail] : [],
    });

    return { id: response.data.id, code: response.data.code };
  }

  /**
   * Map WooCommerce order status to our OrderStatus enum
   */
  mapOrderStatus(wooStatus: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      pending: OrderStatus.PENDING,
      processing: OrderStatus.PROCESSING,
      'on-hold': OrderStatus.ON_HOLD,
      completed: OrderStatus.COMPLETED,
      cancelled: OrderStatus.CANCELLED,
      refunded: OrderStatus.REFUNDED,
      failed: OrderStatus.FAILED,
      shipped: OrderStatus.SHIPPED,
      delivered: OrderStatus.DELIVERED,
    };
    return statusMap[wooStatus] || OrderStatus.PENDING;
  }

  /**
   * Sync a WooCommerce order to our database
   */
  async syncOrder(wooOrder: WooOrder): Promise<string> {
    const phone = this.formatPhone(wooOrder.billing.phone);
    if (!phone) {
      logger.warn({ orderId: wooOrder.id }, 'Order has no valid phone number');
      throw new Error('No valid phone number');
    }

    // Create or update customer
    let customer = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone },
          { wooCustomerId: wooOrder.customer_id > 0 ? wooOrder.customer_id : undefined },
        ],
      },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          phone,
          email: wooOrder.billing.email || undefined,
          name: `${wooOrder.billing.first_name} ${wooOrder.billing.last_name}`.trim() || undefined,
          wooCustomerId: wooOrder.customer_id > 0 ? wooOrder.customer_id : undefined,
          optedIn: true, // Assume opt-in from purchase
          optInDate: new Date(),
          optInSource: 'woocommerce_order',
          customerSince: new Date(wooOrder.date_created),
        },
      });
    }

    // Create or update order
    const orderData = {
      orderNumber: wooOrder.number,
      status: this.mapOrderStatus(wooOrder.status),
      total: parseFloat(wooOrder.total),
      currency: wooOrder.currency,
      customerId: customer.id,
      items: wooOrder.line_items.map((item) => ({
        productId: item.product_id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: parseFloat(item.total),
        image: item.image?.src,
      })),
      shippingAddress: wooOrder.shipping,
      billingAddress: wooOrder.billing,
      orderDate: new Date(wooOrder.date_created),
      completedDate: wooOrder.date_completed ? new Date(wooOrder.date_completed) : null,
    };

    const order = await prisma.order.upsert({
      where: { wooOrderId: wooOrder.id },
      create: {
        wooOrderId: wooOrder.id,
        ...orderData,
      },
      update: orderData,
    });

    // Update customer stats
    const customerOrders = await prisma.order.aggregate({
      where: { customerId: customer.id },
      _count: true,
      _sum: { total: true },
    });

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: customerOrders._count,
        totalSpent: customerOrders._sum.total || 0,
        lastOrderDate: new Date(wooOrder.date_created),
      },
    });

    logger.info({ orderId: order.id, wooOrderId: wooOrder.id }, 'Order synced');
    return order.id;
  }

  /**
   * Initial sync of all orders from WooCommerce
   */
  async syncAllOrders(daysBack: number = 30): Promise<{ synced: number; failed: number }> {
    const after = new Date();
    after.setDate(after.getDate() - daysBack);

    let page = 1;
    let synced = 0;
    let failed = 0;

    while (true) {
      const orders = await this.getOrders({
        after: after.toISOString(),
        per_page: 100,
        page,
      });

      if (orders.length === 0) break;

      for (const order of orders) {
        try {
          await this.syncOrder(order);
          synced++;
        } catch (error) {
          logger.error({ error, orderId: order.id }, 'Failed to sync order');
          failed++;
        }
      }

      page++;
    }

    logger.info({ synced, failed }, 'Order sync completed');
    return { synced, failed };
  }

  /**
   * Format phone number with country code
   */
  private formatPhone(phone: string): string | null {
    if (!phone) return null;

    // Remove all non-numeric characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Ensure it starts with country code
    if (!cleaned.startsWith('+')) {
      // Assume India if no country code (customize based on your market)
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
      }
      if (cleaned.length === 10) {
        cleaned = '+91' + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }

    // Validate length (minimum 10 digits + country code)
    if (cleaned.length < 12) {
      return null;
    }

    return cleaned;
  }

  /**
   * Get order recovery URL (cart with items pre-filled)
   */
  getCartRecoveryUrl(items: Array<{ productId: number; quantity: number }>, couponCode?: string): string {
    let url = `${config.woocommerce.url}/cart/?`;

    // Add items to cart
    items.forEach((item, index) => {
      url += `add-to-cart[]=${item.productId}&quantity[]=${item.quantity}`;
      if (index < items.length - 1) url += '&';
    });

    // Apply coupon if provided
    if (couponCode) {
      url += `&coupon_code=${couponCode}`;
    }

    return url;
  }
}

export const wooCommerceService = new WooCommerceService();
