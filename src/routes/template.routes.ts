/**
 * Message Template Routes
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { whatsappService } from '../services/whatsapp.service';
import { ALL_TEMPLATES, TEMPLATE_MAP } from '../templates/smart-templates';
import { TemplateCategory, TemplateStatus, HeaderType } from '@prisma/client';

const router = Router();
router.use(authMiddleware);

const createTemplateSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9_]+$/, 'Template name must be lowercase with underscores'),
  category: z.nativeEnum(TemplateCategory),
  language: z.string().default('en'),
  headerType: z.nativeEnum(HeaderType).optional(),
  headerContent: z.string().optional(),
  bodyText: z.string().min(1),
  footerText: z.string().optional(),
  buttons: z.array(z.object({
    type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
    text: z.string(),
    url: z.string().optional(),
    phone_number: z.string().optional(),
  })).optional(),
  variables: z.array(z.string()).optional(),
});

/**
 * List templates
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const templates = await prisma.messageTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { name: true },
        },
      },
    });

    res.json({ templates });
  } catch (error) {
    logger.error({ error }, 'Failed to list templates');
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * Get pre-built smart templates (not yet in database)
 */
router.get('/prebuilt', async (req: Request, res: Response) => {
  try {
    res.json({ templates: ALL_TEMPLATES });
  } catch (error) {
    logger.error({ error }, 'Failed to get prebuilt templates');
    res.status(500).json({ error: 'Failed to get prebuilt templates' });
  }
});

/**
 * Get template by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: {
          select: { name: true, email: true },
        },
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ template });
  } catch (error) {
    logger.error({ error }, 'Failed to get template');
    res.status(500).json({ error: 'Failed to get template' });
  }
});

/**
 * Create template (in database, optionally submit to Meta)
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createTemplateSchema.parse(req.body);

    const template = await prisma.messageTemplate.create({
      data: {
        name: data.name,
        category: data.category,
        language: data.language,
        headerType: data.headerType,
        headerContent: data.headerContent,
        bodyText: data.bodyText,
        footerText: data.footerText,
        buttons: data.buttons as object,
        variables: data.variables || [],
        status: TemplateStatus.DRAFT,
        createdById: req.admin!.id,
      },
    });

    logger.info({ templateId: template.id }, 'Template created');

    res.status(201).json({ template });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    logger.error({ error }, 'Failed to create template');
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * Submit template to Meta for approval
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Build components for Meta API
    const components: Array<{
      type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
      format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
      text?: string;
      example?: { header_text?: string[]; body_text?: string[][] };
      buttons?: Array<{
        type: string;
        text: string;
        url?: string;
        phone_number?: string;
      }>;
    }> = [];

    // Header
    if (template.headerType) {
      components.push({
        type: 'HEADER',
        format: template.headerType as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT',
        text: template.headerType === 'TEXT' ? template.headerContent || undefined : undefined,
      });
    }

    // Body
    components.push({
      type: 'BODY',
      text: template.bodyText,
      example: template.variables.length > 0 ? {
        body_text: [template.variables.map((v) => `Sample ${v}`)],
      } : undefined,
    });

    // Footer
    if (template.footerText) {
      components.push({
        type: 'FOOTER',
        text: template.footerText,
      });
    }

    // Buttons
    const buttons = template.buttons as Array<{
      type: string;
      text: string;
      url?: string;
      phone_number?: string;
    }>;
    if (buttons && buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons.map((btn) => ({
          type: btn.type,
          text: btn.text,
          url: btn.url,
          phone_number: btn.phone_number,
        })),
      });
    }

    // Submit to Meta
    const result = await whatsappService.createTemplate(
      template.name,
      template.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
      template.language,
      components
    );

    // Update template status
    await prisma.messageTemplate.update({
      where: { id: template.id },
      data: {
        whatsappTemplateId: result.id,
        status: TemplateStatus.PENDING,
      },
    });

    logger.info({ templateId: template.id, whatsappId: result.id }, 'Template submitted to Meta');

    res.json({ message: 'Template submitted for approval', whatsappTemplateId: result.id });
  } catch (error) {
    logger.error({ error }, 'Failed to submit template');
    res.status(500).json({ error: 'Failed to submit template' });
  }
});

/**
 * Sync templates from Meta
 */
router.post('/sync', async (req: AuthRequest, res: Response) => {
  try {
    const metaTemplates = await whatsappService.getTemplates();

    for (const metaTemplate of metaTemplates) {
      // Find matching local template
      const localTemplate = await prisma.messageTemplate.findUnique({
        where: { name: metaTemplate.name },
      });

      const statusMap: Record<string, TemplateStatus> = {
        APPROVED: TemplateStatus.APPROVED,
        REJECTED: TemplateStatus.REJECTED,
        PENDING: TemplateStatus.PENDING,
      };

      if (localTemplate) {
        await prisma.messageTemplate.update({
          where: { id: localTemplate.id },
          data: {
            status: statusMap[metaTemplate.status] || TemplateStatus.PENDING,
          },
        });
      } else {
        // Create local record for Meta template
        const bodyComponent = metaTemplate.components.find((c) => c.type === 'BODY');

        await prisma.messageTemplate.create({
          data: {
            name: metaTemplate.name,
            category: metaTemplate.category as TemplateCategory,
            language: metaTemplate.language,
            bodyText: bodyComponent?.text || '',
            status: statusMap[metaTemplate.status] || TemplateStatus.PENDING,
            createdById: req.admin!.id,
          },
        });
      }
    }

    logger.info({ count: metaTemplates.length }, 'Templates synced from Meta');

    res.json({ message: 'Templates synced', count: metaTemplates.length });
  } catch (error) {
    logger.error({ error }, 'Failed to sync templates');
    res.status(500).json({ error: 'Failed to sync templates' });
  }
});

/**
 * Create prebuilt template from smart templates
 */
router.post('/prebuilt/:name', async (req: AuthRequest, res: Response) => {
  try {
    const templateDef = TEMPLATE_MAP[req.params.name];
    if (!templateDef) {
      return res.status(404).json({ error: 'Prebuilt template not found' });
    }

    // Check if already exists
    const existing = await prisma.messageTemplate.findUnique({
      where: { name: templateDef.name },
    });

    if (existing) {
      return res.status(400).json({ error: 'Template already exists' });
    }

    // Extract components
    const headerComponent = templateDef.components.find((c) => c.type === 'HEADER');
    const bodyComponent = templateDef.components.find((c) => c.type === 'BODY');
    const footerComponent = templateDef.components.find((c) => c.type === 'FOOTER');
    const buttonsComponent = templateDef.components.find((c) => c.type === 'BUTTONS');

    // Extract variables from body text
    const variableMatches = bodyComponent?.text?.match(/\{\{\d+\}\}/g) || [];
    const variables = variableMatches.map((v) => `var${v.replace(/[{}]/g, '')}`);

    const template = await prisma.messageTemplate.create({
      data: {
        name: templateDef.name,
        category: templateDef.category as TemplateCategory,
        language: templateDef.language,
        headerType: headerComponent?.format as HeaderType || null,
        headerContent: headerComponent?.text,
        bodyText: bodyComponent?.text || '',
        footerText: footerComponent?.text,
        buttons: buttonsComponent?.buttons as object,
        variables,
        status: TemplateStatus.DRAFT,
        createdById: req.admin!.id,
      },
    });

    logger.info({ templateId: template.id, name: template.name }, 'Prebuilt template created');

    res.status(201).json({ template });
  } catch (error) {
    logger.error({ error }, 'Failed to create prebuilt template');
    res.status(500).json({ error: 'Failed to create prebuilt template' });
  }
});

/**
 * Delete template
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Delete from Meta if exists
    if (template.whatsappTemplateId) {
      await whatsappService.deleteTemplate(template.name);
    }

    await prisma.messageTemplate.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Template deleted' });
  } catch (error) {
    logger.error({ error }, 'Failed to delete template');
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
