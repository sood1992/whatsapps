/**
 * Smart Message Templates for TreatForTails
 *
 * Pre-built WhatsApp message templates optimized for pet store e-commerce.
 * These templates follow Meta's approval guidelines and best practices.
 *
 * Template Categories:
 * - MARKETING: Promotional messages (offers, new products)
 * - UTILITY: Transactional messages (orders, shipping)
 *
 * Best Practices Implemented:
 * - Personalization (customer name, pet name)
 * - Clear CTAs
 * - Urgency without being pushy
 * - Compliance with WhatsApp policies
 */

export interface TemplateDefinition {
  name: string;
  category: 'MARKETING' | 'UTILITY';
  language: string;
  components: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    text?: string;
    example?: {
      header_text?: string[];
      body_text?: string[][];
    };
    buttons?: Array<{
      type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
      text: string;
      url?: string;
      phone_number?: string;
    }>;
  }>;
}

// ===========================================
// WELCOME & OPT-IN TEMPLATES
// ===========================================

export const welcomeMessage: TemplateDefinition = {
  name: 'welcome_message',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'IMAGE',
    },
    {
      type: 'BODY',
      text: `🐾 Welcome to TreatForTails, {{1}}!

We're thrilled to have you and your furry friend join our family!

As a thank you for subscribing, here's *10% OFF* your first order with code: WELCOME10

Discover our range of:
• Premium treats for dogs & cats
• Healthy snacks & chews
• Natural & organic options

Shop now and make tails wag! 🎉`,
      example: {
        body_text: [['John']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to unsubscribe',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Shop Now',
          url: 'https://treatfortails.com?utm_source=whatsapp&utm_medium=welcome',
        },
        {
          type: 'QUICK_REPLY',
          text: '🐕 Dog Treats',
        },
        {
          type: 'QUICK_REPLY',
          text: '🐈 Cat Treats',
        },
      ],
    },
  ],
};

// ===========================================
// ORDER TEMPLATES
// ===========================================

export const orderConfirmation: TemplateDefinition = {
  name: 'order_confirmation',
  category: 'UTILITY',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'TEXT',
      text: '✅ Order Confirmed!',
    },
    {
      type: 'BODY',
      text: `Hi {{1}}!

Your order #{{2}} has been confirmed.

*Order Total:* ₹{{3}}

We're preparing delicious treats for your pet! You'll receive a shipping update soon.

Thank you for choosing TreatForTails! 🐾`,
      example: {
        body_text: [['John', 'TFT12345', '999']],
      },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Track Order',
          url: 'https://treatfortails.com/my-account/orders/',
        },
      ],
    },
  ],
};

export const orderShipped: TemplateDefinition = {
  name: 'order_shipped',
  category: 'UTILITY',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'TEXT',
      text: '📦 Your Order is On Its Way!',
    },
    {
      type: 'BODY',
      text: `Great news!

Order #{{1}} has been shipped and is on its way to you!

*Tracking Number:* {{2}}
*Carrier:* {{3}}

Expected delivery: {{4}}

Your pet's treats are almost there! 🐾`,
      example: {
        body_text: [['TFT12345', 'AWB123456789', 'Delhivery', '2-3 business days']],
      },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Track Shipment',
          url: 'https://treatfortails.com/track?order={{1}}',
        },
      ],
    },
  ],
};

export const orderDelivered: TemplateDefinition = {
  name: 'order_delivered',
  category: 'UTILITY',
  language: 'en',
  components: [
    {
      type: 'BODY',
      text: `🎉 Your order #{{1}} has been delivered!

We hope your furry friend loves their new treats!

Would you mind sharing your experience? Your review helps other pet parents discover quality treats.

Thank you for being part of the TreatForTails family! 🐾`,
      example: {
        body_text: [['TFT12345']],
      },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '⭐ Leave a Review',
          url: 'https://treatfortails.com/review',
        },
        {
          type: 'QUICK_REPLY',
          text: '🛒 Reorder',
        },
      ],
    },
  ],
};

// ===========================================
// ABANDONED CART TEMPLATES
// Research-backed timing: 30min, 4hr, 24hr, 72hr
// ===========================================

export const cartReminder1: TemplateDefinition = {
  name: 'cart_reminder_1',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'IMAGE', // Will show the product image
    },
    {
      type: 'BODY',
      text: `Hey {{1}}! 👋

Looks like you left some goodies behind!

*{{2}}* is still waiting in your cart.
Cart Value: ₹{{3}}

Your pet deserves these treats! Complete your order before they're gone.`,
      example: {
        body_text: [['John', 'Chicken Jerky Treats (Pack of 3)', '799']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to opt out',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '🛒 Complete Order',
          url: 'https://treatfortails.com/cart?recover={{1}}',
        },
      ],
    },
  ],
};

export const cartReminder2: TemplateDefinition = {
  name: 'cart_reminder_2',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'BODY',
      text: `Hi {{1}}, your cart misses you! 🐾

Still thinking about *{{2}}*?

Here's what other pet parents say:
⭐⭐⭐⭐⭐ "My dog absolutely loves these!"

*Cart Value:* ₹{{3}}

Don't let your furry friend miss out! Items are selling fast.`,
      example: {
        body_text: [['John', 'Chicken Jerky Treats', '799']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to opt out',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Complete Purchase',
          url: 'https://treatfortails.com/cart?recover={{1}}',
        },
        {
          type: 'QUICK_REPLY',
          text: '❓ Need Help?',
        },
      ],
    },
  ],
};

export const cartReminder3: TemplateDefinition = {
  name: 'cart_reminder_3',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'TEXT',
      text: '🎁 Special Offer Just For You!',
    },
    {
      type: 'BODY',
      text: `{{1}}, we don't want you to miss out!

Here's an exclusive *{{4}}% OFF* on your cart:

*{{2}}*
~~₹{{3}}~~ → *₹{{5}}*

Use code: *{{6}}*
Valid for 48 hours only!

Your pet will thank you! 🐕`,
      example: {
        body_text: [['John', 'Chicken Jerky Treats', '799', '10', '719', 'SAVE10']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to opt out',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '🛒 Claim Offer',
          url: 'https://treatfortails.com/cart?recover={{1}}&coupon={{6}}',
        },
      ],
    },
  ],
};

export const cartReminderFinal: TemplateDefinition = {
  name: 'cart_reminder_final',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'TEXT',
      text: '⏰ Last Chance!',
    },
    {
      type: 'BODY',
      text: `{{1}}, this is your final reminder!

Your cart with *{{2}}* expires soon.

We've got your *BIGGEST discount* ready:
*{{4}}% OFF* with code: *{{6}}*

After this, regular prices apply.

Make your pet happy today! 🐾`,
      example: {
        body_text: [['John', 'Chicken Jerky Treats', '799', '15', '679', 'FINAL15']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to opt out',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '💰 Get 15% OFF Now',
          url: 'https://treatfortails.com/cart?recover={{1}}&coupon={{6}}',
        },
      ],
    },
  ],
};

// ===========================================
// PROMOTIONAL TEMPLATES
// ===========================================

export const dailyOffer: TemplateDefinition = {
  name: 'daily_offer',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'IMAGE',
    },
    {
      type: 'BODY',
      text: `🌟 Today's Special at TreatForTails!

*{{1}}*

{{2}}

🏷️ *{{3}}% OFF* - Today Only!
~~₹{{4}}~~ → *₹{{5}}*

Limited stock available. Order now before it's gone!`,
      example: {
        body_text: [['Salmon Bites for Dogs', 'Premium salmon treats packed with Omega-3 for a healthy coat!', '20', '599', '479']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to unsubscribe',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '🛒 Shop Now',
          url: 'https://treatfortails.com/product/{{1}}',
        },
      ],
    },
  ],
};

export const weeklyNewsletter: TemplateDefinition = {
  name: 'weekly_newsletter',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'IMAGE',
    },
    {
      type: 'BODY',
      text: `🐾 This Week at TreatForTails!

Hi {{1}}!

Here's what's new for your furry friend:

🆕 *New Arrivals:* {{2}}
🔥 *Trending:* {{3}}
💰 *Weekly Deal:* {{4}}% off on {{5}}

Plus, free shipping on orders over ₹499!

Explore now 👇`,
      example: {
        body_text: [['John', 'Organic Pumpkin Biscuits', 'Dental Chews', '15', 'all cat treats']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to unsubscribe',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Shop This Week',
          url: 'https://treatfortails.com/shop',
        },
        {
          type: 'QUICK_REPLY',
          text: '🐕 For Dogs',
        },
        {
          type: 'QUICK_REPLY',
          text: '🐈 For Cats',
        },
      ],
    },
  ],
};

export const flashSale: TemplateDefinition = {
  name: 'flash_sale',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'TEXT',
      text: '⚡ FLASH SALE - {{1}} Hours Only!',
    },
    {
      type: 'BODY',
      text: `{{2}}, this won't last long!

🔥 *{{3}}% OFF EVERYTHING* 🔥

No code needed - discount auto-applied at checkout!

Best sellers going fast:
• {{4}}
• {{5}}
• {{6}}

Sale ends at midnight! ⏰`,
      example: {
        body_text: [['24', 'John', '25', 'Chicken Strips', 'Dental Bones', 'Training Treats']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to unsubscribe',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '🛒 Shop Sale',
          url: 'https://treatfortails.com/sale',
        },
      ],
    },
  ],
};

// ===========================================
// RE-ENGAGEMENT TEMPLATES
// ===========================================

export const winBack: TemplateDefinition = {
  name: 'win_back',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'BODY',
      text: `Hey {{1}}, we miss you! 🐾

It's been a while since your last visit to TreatForTails.

We've added some amazing new treats your pet will love! Plus, here's a special comeback offer:

*20% OFF* your next order
Code: *COMEBACK20*

Valid for 7 days. Let's make tails wag again!`,
      example: {
        body_text: [['John']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Reply STOP to unsubscribe',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Redeem Offer',
          url: 'https://treatfortails.com?coupon=COMEBACK20',
        },
        {
          type: 'QUICK_REPLY',
          text: "What's New?",
        },
      ],
    },
  ],
};

export const reviewRequest: TemplateDefinition = {
  name: 'review_request',
  category: 'UTILITY',
  language: 'en',
  components: [
    {
      type: 'BODY',
      text: `Hi {{1}}! 👋

How are you and your pet enjoying *{{2}}* from your recent order?

We'd love to hear your feedback! Your review helps other pet parents make informed choices.

As a thank you, get *₹100 OFF* your next order after leaving a review!`,
      example: {
        body_text: [['John', 'Chicken Jerky Treats']],
      },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '⭐ Write Review',
          url: 'https://treatfortails.com/review/{{2}}',
        },
        {
          type: 'QUICK_REPLY',
          text: '😊 Loving it!',
        },
        {
          type: 'QUICK_REPLY',
          text: '😕 Need help',
        },
      ],
    },
  ],
};

// ===========================================
// VIP / LOYALTY TEMPLATES
// ===========================================

export const vipExclusive: TemplateDefinition = {
  name: 'vip_exclusive',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'TEXT',
      text: '👑 VIP Exclusive Access',
    },
    {
      type: 'BODY',
      text: `{{1}}, you're one of our VIP customers! 🌟

As a thank you for your loyalty, you get *early access* to:

*{{2}}*

Plus your exclusive VIP discount:
*{{3}}% OFF* with code: *VIP{{3}}*

This offer is just for you - not available to regular customers!`,
      example: {
        body_text: [['John', 'New Premium Treats Collection', '25']],
      },
    },
    {
      type: 'FOOTER',
      text: 'Exclusive to TreatForTails VIP members',
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '👑 Shop VIP Collection',
          url: 'https://treatfortails.com/vip',
        },
      ],
    },
  ],
};

// ===========================================
// SPECIAL OCCASIONS
// ===========================================

export const petBirthday: TemplateDefinition = {
  name: 'pet_birthday',
  category: 'MARKETING',
  language: 'en',
  components: [
    {
      type: 'HEADER',
      format: 'IMAGE',
    },
    {
      type: 'BODY',
      text: `🎂 Happy Birthday to {{2}}! 🎉

{{1}}, we heard it's your furry friend's special day!

Here's a birthday treat from TreatForTails:
*25% OFF* any order today!

Code: *BDAY25*

Make {{2}}'s day extra special with their favorite treats! 🐾`,
      example: {
        body_text: [['John', 'Max']],
      },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: '🎁 Birthday Shopping',
          url: 'https://treatfortails.com?coupon=BDAY25',
        },
      ],
    },
  ],
};

// Export all templates
export const ALL_TEMPLATES: TemplateDefinition[] = [
  welcomeMessage,
  orderConfirmation,
  orderShipped,
  orderDelivered,
  cartReminder1,
  cartReminder2,
  cartReminder3,
  cartReminderFinal,
  dailyOffer,
  weeklyNewsletter,
  flashSale,
  winBack,
  reviewRequest,
  vipExclusive,
  petBirthday,
];

// Template name to definition map
export const TEMPLATE_MAP: Record<string, TemplateDefinition> = {
  welcome_message: welcomeMessage,
  order_confirmation: orderConfirmation,
  order_shipped: orderShipped,
  order_delivered: orderDelivered,
  cart_reminder_1: cartReminder1,
  cart_reminder_2: cartReminder2,
  cart_reminder_3: cartReminder3,
  cart_reminder_final: cartReminderFinal,
  daily_offer: dailyOffer,
  weekly_newsletter: weeklyNewsletter,
  flash_sale: flashSale,
  win_back: winBack,
  review_request: reviewRequest,
  vip_exclusive: vipExclusive,
  pet_birthday: petBirthday,
};
