# 🐾 TreatForTails WhatsApp Automation

A **self-hosted** WhatsApp Business API automation platform for e-commerce stores. Built specifically for WooCommerce integration with features like abandoned cart recovery, order notifications, and broadcast campaigns.

**Save money** compared to platforms like AiSensy ($40-200/month) - you only pay WhatsApp's conversation fees (~$0.02-0.05 per conversation).

## ✨ Features

### 📢 Marketing Campaigns
- **Broadcast Messages** - Send offers to your entire customer list
- **Daily/Weekly Offers** - Automated recurring campaigns
- **Customer Segmentation** - Target by tags, order history, spending
- **VIP Campaigns** - Special offers for high-value customers

### 🛒 Abandoned Cart Recovery
- **Smart Timing** - 30min → 4hr → 24hr → 72hr sequence
- **Auto Discount Codes** - Generate unique coupons
- **25-40% Recovery Rate** - Based on industry best practices
- **Cart Recovery Links** - One-click checkout

### 📦 Order Notifications
- Order Confirmation
- Shipping Updates with Tracking
- Delivery Confirmation
- Review Request (3 days after delivery)

### 🤖 Automations
- Welcome messages for new opt-ins
- Keyword auto-replies (STOP, START, etc.)
- Customer tagging rules
- Re-engagement for inactive customers

### 📊 Analytics Dashboard
- Message delivery & read rates
- Campaign performance
- Cart recovery metrics
- Customer growth tracking

## 🚀 Quick Deploy to Railway

### Prerequisites
1. [Railway Account](https://railway.app) (free tier available)
2. [Meta Business Account](https://business.facebook.com)
3. [WhatsApp Business API Access](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
4. WooCommerce store

### One-Click Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

### Manual Railway Setup

1. **Create Railway Project**
   ```bash
   # Install Railway CLI
   npm i -g @railway/cli

   # Login
   railway login

   # Create new project
   railway init
   ```

2. **Add Services**
   - Click "New" → "Database" → "PostgreSQL"
   - Click "New" → "Database" → "Redis"

3. **Deploy Application**
   ```bash
   railway up
   ```

4. **Set Environment Variables**

   Go to your Railway project → Variables, and add:

   ```env
   # Required
   APP_SECRET=generate-a-32-char-secret
   JWT_SECRET=generate-another-32-char-secret

   # WhatsApp (from Meta Business Suite)
   WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
   WHATSAPP_BUSINESS_ACCOUNT_ID=your-business-account-id
   WHATSAPP_ACCESS_TOKEN=your-permanent-token
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=create-a-verify-token

   # WooCommerce
   WOOCOMMERCE_URL=https://treatfortails.com
   WOOCOMMERCE_CONSUMER_KEY=ck_xxx
   WOOCOMMERCE_CONSUMER_SECRET=cs_xxx

   # Business
   BUSINESS_NAME=TreatForTails
   BUSINESS_TIMEZONE=Asia/Kolkata
   ```

5. **Get Your Webhook URL**

   After deployment, your webhook URL will be:
   ```
   https://your-app.railway.app/webhooks/whatsapp
   ```

## 🔧 WhatsApp Business API Setup

### Step 1: Create Meta Business Account
1. Go to [business.facebook.com](https://business.facebook.com)
2. Create or use existing business account
3. Verify your business

### Step 2: Set Up WhatsApp Business
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a new app (Business type)
3. Add WhatsApp product
4. Get your Phone Number ID and Business Account ID

### Step 3: Configure Webhooks
1. In Meta Developer Console → WhatsApp → Configuration
2. Add webhook URL: `https://your-app.railway.app/webhooks/whatsapp`
3. Verify token: Use your `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
4. Subscribe to: `messages`, `message_deliveries`, `message_reads`

### Step 4: Create Message Templates
1. Go to WhatsApp Manager → Message Templates
2. Create templates for:
   - Order confirmation
   - Shipping notification
   - Cart recovery
   - Promotional messages

## 🛒 WooCommerce Setup

### Step 1: Generate API Keys
1. WooCommerce → Settings → Advanced → REST API
2. Add Key → Read/Write permissions
3. Copy Consumer Key and Secret

### Step 2: Add Webhooks
1. WooCommerce → Settings → Advanced → Webhooks
2. Add webhooks:
   - **Order Created**: `https://your-app.railway.app/webhooks/woocommerce/order`
   - **Order Updated**: `https://your-app.railway.app/webhooks/woocommerce/order`
   - **Customer Created**: `https://your-app.railway.app/webhooks/woocommerce/customer`

### Step 3: Cart Tracking (Optional)
For abandoned cart tracking, add to your theme's `functions.php`:

```php
// Send cart data to WhatsApp automation
add_action('woocommerce_cart_updated', 'send_cart_to_whatsapp');
function send_cart_to_whatsapp() {
    $cart = WC()->cart;
    if ($cart->is_empty()) return;

    $items = array();
    foreach ($cart->get_cart() as $item) {
        $product = $item['data'];
        $items[] = array(
            'productId' => $product->get_id(),
            'name' => $product->get_name(),
            'quantity' => $item['quantity'],
            'price' => $product->get_price(),
            'image' => wp_get_attachment_url($product->get_image_id())
        );
    }

    $phone = WC()->customer->get_billing_phone();
    if (!$phone) return;

    wp_remote_post('https://your-app.railway.app/webhooks/woocommerce/cart', array(
        'body' => json_encode(array(
            'phone' => $phone,
            'customer_id' => get_current_user_id(),
            'items' => $items,
            'subtotal' => $cart->get_subtotal(),
            'cart_token' => WC()->session->get_customer_id()
        )),
        'headers' => array('Content-Type' => 'application/json')
    ));
}
```

## 📱 Admin Dashboard

Access your dashboard at: `https://your-app.railway.app`

Default login:
- Create your first admin at `/api/auth/register`

Features:
- 📊 Real-time analytics
- 👥 Customer management
- 📢 Campaign creation
- 📝 Template management
- ⚙️ Automation rules
- 💬 Message logs

## 💰 Pricing Comparison

| Feature | TreatForTails (Self-hosted) | AiSensy | Interakt |
|---------|---------------------------|---------|----------|
| Monthly Cost | **$0** + Railway ($5-20) | $40-200 | $49-199 |
| Per Message | WhatsApp fees only (~$0.02) | Higher markup | Higher markup |
| API Access | Full control | Limited | Limited |
| Customization | Unlimited | Limited | Limited |
| Data Ownership | 100% yours | Third party | Third party |

## 🔒 Compliance & Best Practices

### Opt-in Requirements
- Always get explicit consent before messaging
- Add WhatsApp checkbox at checkout
- Honor opt-out requests immediately (STOP keyword)

### Message Timing
- Default: 9 AM - 9 PM (configurable)
- Cart recovery: 30min → 4hr → 24hr → 72hr
- Respect customer timezone

### Rate Limiting
- Built-in: 80 messages/minute
- Daily limit: Configurable per your needs

## 🛠️ Local Development

```bash
# Clone repository
git clone <repo-url>
cd treatfortails-whatsapp

# Install dependencies
npm install
cd dashboard && npm install && cd ..

# Copy environment file
cp .env.example .env
# Edit .env with your values

# Start PostgreSQL and Redis (Docker)
docker-compose up -d db redis

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev

# In another terminal, start dashboard
npm run dashboard:dev
```

## 📁 Project Structure

```
├── src/
│   ├── config/          # Configuration files
│   ├── middleware/      # Express middleware
│   ├── queues/          # BullMQ job processors
│   ├── routes/          # API routes
│   ├── scheduler/       # Cron jobs
│   ├── services/        # Business logic
│   ├── templates/       # Smart message templates
│   └── utils/           # Utilities
├── dashboard/           # React admin dashboard
├── prisma/              # Database schema
└── docker-compose.yml   # Local development
```

## 📞 Support

- **Documentation**: Check this README
- **Issues**: Open a GitHub issue
- **WhatsApp API**: [Meta Developer Docs](https://developers.facebook.com/docs/whatsapp)

## 📄 License

MIT License - Use freely for your business!

---

Built with ❤️ for pet store owners who want to save money on WhatsApp marketing.

**Research Sources:**
- [WhatsApp Business - Cart Recovery Guide](https://business.whatsapp.com/blog/shopping-cart-recovery-seasonal-sales)
- [AiSensy - Abandoned Cart Recovery](https://m.aisensy.com/blog/recover-abandoned-carts-with-whatsapp/)
- [Zixflow - WhatsApp Cart Recovery](https://zixflow.com/blog/whatsapp-abandoned-cart-recovery/)
