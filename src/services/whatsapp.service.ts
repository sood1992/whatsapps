/**
 * WhatsApp Business Cloud API Service
 *
 * Official Meta WhatsApp Cloud API integration
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * This service handles:
 * - Sending template messages
 * - Sending regular messages
 * - Media uploads
 * - Message status tracking
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config/environment';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { MessageStatus, MessageType, MessageDirection } from '@prisma/client';

// Types for WhatsApp Cloud API
interface WhatsAppTextMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: {
    preview_url?: boolean;
    body: string;
  };
}

interface WhatsAppTemplateMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: TemplateComponent[];
  };
}

interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: TemplateParameter[];
  sub_type?: 'quick_reply' | 'url';
  index?: number;
}

interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  image?: { link: string };
  document?: { link: string; filename?: string };
  video?: { link: string };
}

interface WhatsAppMediaMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'image' | 'document' | 'video' | 'audio';
  image?: { link: string; caption?: string };
  document?: { link: string; caption?: string; filename?: string };
  video?: { link: string; caption?: string };
  audio?: { link: string };
}

interface WhatsAppInteractiveMessage {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'interactive';
  interactive: {
    type: 'button' | 'list' | 'product' | 'product_list';
    header?: { type: 'text' | 'image'; text?: string; image?: { link: string } };
    body: { text: string };
    footer?: { text: string };
    action: InteractiveAction;
  };
}

interface InteractiveAction {
  buttons?: Array<{
    type: 'reply';
    reply: { id: string; title: string };
  }>;
  button?: string;
  sections?: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}

interface SendMessageResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

interface TemplateInfo {
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    format?: string;
    text?: string;
    buttons?: Array<{ type: string; text: string; url?: string }>;
  }>;
}

export class WhatsAppService {
  private client: AxiosInstance;
  private phoneNumberId: string;
  private businessAccountId: string;

  constructor() {
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.businessAccountId = config.whatsapp.businessAccountId;

    this.client = axios.create({
      baseURL: config.whatsapp.apiUrl,
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const errorData = error.response?.data as Record<string, unknown>;
        logger.error({
          status: error.response?.status,
          data: errorData,
          url: error.config?.url,
        }, 'WhatsApp API error');
        throw error;
      }
    );
  }

  /**
   * Format phone number to WhatsApp format (remove + and spaces)
   */
  formatPhoneNumber(phone: string): string {
    return phone.replace(/[\s+\-()]/g, '');
  }

  /**
   * Send a text message
   */
  async sendTextMessage(
    to: string,
    text: string,
    options?: {
      previewUrl?: boolean;
      customerId?: string;
      campaignId?: string;
    }
  ): Promise<{ messageId: string; success: boolean }> {
    const formattedPhone = this.formatPhoneNumber(to);

    const payload: WhatsAppTextMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: {
        preview_url: options?.previewUrl ?? false,
        body: text,
      },
    };

    try {
      const response = await this.client.post<SendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      const messageId = response.data.messages[0].id;

      // Log message to database
      if (options?.customerId) {
        await this.logMessage({
          whatsappMessageId: messageId,
          customerId: options.customerId,
          campaignId: options.campaignId,
          type: MessageType.TEXT,
          content: { text },
          status: MessageStatus.SENT,
        });
      }

      logger.info({ to: formattedPhone, messageId }, 'Text message sent');

      return { messageId, success: true };
    } catch (error) {
      logger.error({ error, to: formattedPhone }, 'Failed to send text message');
      throw error;
    }
  }

  /**
   * Send a template message (required for business-initiated conversations)
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'en',
    components?: TemplateComponent[],
    options?: {
      customerId?: string;
      campaignId?: string;
      orderId?: string;
      cartId?: string;
      templateId?: string;
    }
  ): Promise<{ messageId: string; success: boolean }> {
    const formattedPhone = this.formatPhoneNumber(to);

    const payload: WhatsAppTemplateMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components,
      },
    };

    try {
      const response = await this.client.post<SendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      const messageId = response.data.messages[0].id;

      // Log message to database
      if (options?.customerId) {
        await this.logMessage({
          whatsappMessageId: messageId,
          customerId: options.customerId,
          campaignId: options.campaignId,
          orderId: options.orderId,
          cartId: options.cartId,
          templateId: options.templateId,
          type: MessageType.TEMPLATE,
          content: { templateName, languageCode, components },
          status: MessageStatus.SENT,
        });
      }

      logger.info({ to: formattedPhone, messageId, templateName }, 'Template message sent');

      return { messageId, success: true };
    } catch (error) {
      logger.error({ error, to: formattedPhone, templateName }, 'Failed to send template message');
      throw error;
    }
  }

  /**
   * Send an image message
   */
  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
    options?: { customerId?: string; campaignId?: string }
  ): Promise<{ messageId: string; success: boolean }> {
    const formattedPhone = this.formatPhoneNumber(to);

    const payload: WhatsAppMediaMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'image',
      image: {
        link: imageUrl,
        caption,
      },
    };

    try {
      const response = await this.client.post<SendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      const messageId = response.data.messages[0].id;

      if (options?.customerId) {
        await this.logMessage({
          whatsappMessageId: messageId,
          customerId: options.customerId,
          campaignId: options.campaignId,
          type: MessageType.IMAGE,
          content: { imageUrl, caption },
          status: MessageStatus.SENT,
        });
      }

      return { messageId, success: true };
    } catch (error) {
      logger.error({ error, to: formattedPhone }, 'Failed to send image message');
      throw error;
    }
  }

  /**
   * Send an interactive button message
   */
  async sendInteractiveButtonMessage(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    options?: {
      headerText?: string;
      headerImageUrl?: string;
      footerText?: string;
      customerId?: string;
      campaignId?: string;
    }
  ): Promise<{ messageId: string; success: boolean }> {
    const formattedPhone = this.formatPhoneNumber(to);

    const payload: WhatsAppInteractiveMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((btn) => ({
            type: 'reply' as const,
            reply: { id: btn.id, title: btn.title.slice(0, 20) },
          })),
        },
      },
    };

    // Add optional header
    if (options?.headerText) {
      payload.interactive.header = { type: 'text', text: options.headerText };
    } else if (options?.headerImageUrl) {
      payload.interactive.header = {
        type: 'image',
        image: { link: options.headerImageUrl },
      };
    }

    // Add optional footer
    if (options?.footerText) {
      payload.interactive.footer = { text: options.footerText };
    }

    try {
      const response = await this.client.post<SendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      const messageId = response.data.messages[0].id;

      if (options?.customerId) {
        await this.logMessage({
          whatsappMessageId: messageId,
          customerId: options.customerId,
          campaignId: options.campaignId,
          type: MessageType.INTERACTIVE,
          content: payload.interactive,
          status: MessageStatus.SENT,
        });
      }

      return { messageId, success: true };
    } catch (error) {
      logger.error({ error, to: formattedPhone }, 'Failed to send interactive message');
      throw error;
    }
  }

  /**
   * Send a list message
   */
  async sendListMessage(
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    options?: {
      headerText?: string;
      footerText?: string;
      customerId?: string;
    }
  ): Promise<{ messageId: string; success: boolean }> {
    const formattedPhone = this.formatPhoneNumber(to);

    const payload: WhatsAppInteractiveMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonText,
          sections,
        },
      },
    };

    if (options?.headerText) {
      payload.interactive.header = { type: 'text', text: options.headerText };
    }
    if (options?.footerText) {
      payload.interactive.footer = { text: options.footerText };
    }

    try {
      const response = await this.client.post<SendMessageResponse>(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      return { messageId: response.data.messages[0].id, success: true };
    } catch (error) {
      logger.error({ error, to: formattedPhone }, 'Failed to send list message');
      throw error;
    }
  }

  /**
   * Mark a message as read
   */
  async markMessageAsRead(messageId: string): Promise<boolean> {
    try {
      await this.client.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
      return true;
    } catch (error) {
      logger.error({ error, messageId }, 'Failed to mark message as read');
      return false;
    }
  }

  /**
   * Get message templates from Meta
   */
  async getTemplates(): Promise<TemplateInfo[]> {
    try {
      const response = await this.client.get(
        `/${this.businessAccountId}/message_templates`,
        {
          params: {
            fields: 'name,status,category,language,components',
            limit: 100,
          },
        }
      );
      return response.data.data;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch templates');
      throw error;
    }
  }

  /**
   * Create a new message template
   */
  async createTemplate(
    name: string,
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    language: string,
    components: Array<{
      type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
      format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
      text?: string;
      example?: { header_text?: string[]; body_text?: string[][] };
      buttons?: Array<{
        type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
        text: string;
        url?: string;
        phone_number?: string;
      }>;
    }>
  ): Promise<{ id: string; status: string }> {
    try {
      const response = await this.client.post(
        `/${this.businessAccountId}/message_templates`,
        {
          name,
          category,
          language,
          components,
        }
      );
      return response.data;
    } catch (error) {
      logger.error({ error, name }, 'Failed to create template');
      throw error;
    }
  }

  /**
   * Delete a message template
   */
  async deleteTemplate(templateName: string): Promise<boolean> {
    try {
      await this.client.delete(
        `/${this.businessAccountId}/message_templates`,
        {
          params: { name: templateName },
        }
      );
      return true;
    } catch (error) {
      logger.error({ error, templateName }, 'Failed to delete template');
      return false;
    }
  }

  /**
   * Upload media to WhatsApp
   */
  async uploadMedia(
    fileBuffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<string> {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename, contentType: mimeType });
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);

    try {
      const response = await this.client.post(
        `/${this.phoneNumberId}/media`,
        formData,
        {
          headers: formData.getHeaders(),
        }
      );
      return response.data.id;
    } catch (error) {
      logger.error({ error, filename }, 'Failed to upload media');
      throw error;
    }
  }

  /**
   * Get phone number info
   */
  async getPhoneNumberInfo(): Promise<{
    verified_name: string;
    display_phone_number: string;
    quality_rating: string;
    messaging_limit_tier: string;
  }> {
    try {
      const response = await this.client.get(`/${this.phoneNumberId}`, {
        params: {
          fields: 'verified_name,display_phone_number,quality_rating,messaging_limit_tier',
        },
      });
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to get phone number info');
      throw error;
    }
  }

  /**
   * Log message to database
   */
  private async logMessage(data: {
    whatsappMessageId: string;
    customerId: string;
    campaignId?: string;
    orderId?: string;
    cartId?: string;
    templateId?: string;
    type: MessageType;
    content: Record<string, unknown>;
    status: MessageStatus;
  }): Promise<void> {
    try {
      await prisma.message.create({
        data: {
          whatsappMessageId: data.whatsappMessageId,
          direction: MessageDirection.OUTBOUND,
          customerId: data.customerId,
          campaignId: data.campaignId,
          orderId: data.orderId,
          cartId: data.cartId,
          templateId: data.templateId,
          type: data.type,
          content: data.content,
          status: data.status,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      logger.error({ error, data }, 'Failed to log message to database');
    }
  }

  /**
   * Update message status
   */
  async updateMessageStatus(
    whatsappMessageId: string,
    status: 'delivered' | 'read' | 'failed',
    timestamp?: Date,
    errorInfo?: { code: number; title: string }
  ): Promise<void> {
    const statusMap: Record<string, MessageStatus> = {
      delivered: MessageStatus.DELIVERED,
      read: MessageStatus.READ,
      failed: MessageStatus.FAILED,
    };

    const updateData: Record<string, unknown> = {
      status: statusMap[status],
    };

    if (status === 'delivered') {
      updateData.deliveredAt = timestamp || new Date();
    } else if (status === 'read') {
      updateData.readAt = timestamp || new Date();
    } else if (status === 'failed') {
      updateData.failedAt = timestamp || new Date();
      updateData.failureReason = errorInfo
        ? `${errorInfo.code}: ${errorInfo.title}`
        : 'Unknown error';
    }

    try {
      await prisma.message.updateMany({
        where: { whatsappMessageId },
        data: updateData,
      });

      // Also update campaign recipient if applicable
      const message = await prisma.message.findFirst({
        where: { whatsappMessageId },
        select: { campaignId: true, customerId: true },
      });

      if (message?.campaignId) {
        const recipientStatusMap: Record<string, string> = {
          delivered: 'DELIVERED',
          read: 'READ',
          failed: 'FAILED',
        };

        await prisma.campaignRecipient.updateMany({
          where: {
            campaignId: message.campaignId,
            customerId: message.customerId,
          },
          data: {
            status: recipientStatusMap[status] as 'DELIVERED' | 'READ' | 'FAILED',
            ...(status === 'delivered' && { deliveredAt: timestamp || new Date() }),
            ...(status === 'read' && { readAt: timestamp || new Date() }),
            ...(status === 'failed' && {
              failedAt: timestamp || new Date(),
              failureReason: errorInfo?.title,
            }),
          },
        });
      }
    } catch (error) {
      logger.error({ error, whatsappMessageId, status }, 'Failed to update message status');
    }
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppService();
