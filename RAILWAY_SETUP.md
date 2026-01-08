# 🚂 Railway Deployment Guide for TreatForTails

This guide walks you through deploying the WhatsApp Automation tool on Railway.

## Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub (recommended) or email
3. Railway offers $5 free credits/month - enough for testing!

## Step 2: Create New Project

1. Click **"New Project"** in Railway dashboard
2. Select **"Deploy from GitHub Repo"**
3. Connect your GitHub account if not already connected
4. Select the repository with this code

## Step 3: Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will automatically create the database
4. The `DATABASE_URL` will be auto-injected

## Step 4: Add Redis

1. Click **"+ New"** again
2. Select **"Database"** → **"Redis"**
3. The `REDIS_URL` will be auto-injected

## Step 5: Configure Environment Variables

Click on your main service → **"Variables"** tab → **"Add Variable"**

### Required Variables:

```
# Generate these (32+ characters each)
APP_SECRET=your-super-secret-app-key-min-32-chars
JWT_SECRET=your-jwt-secret-key-min-32-chars

# WhatsApp API (from Meta Business Suite)
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_BUSINESS_ACCOUNT_ID=987654321
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxx
WHATSAPP_WEBHOOK_VERIFY_TOKEN=myverifytoken123

# WooCommerce API Keys
WOOCOMMERCE_URL=https://treatfortails.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxxxxxxxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxxxxxxxxxx

# Business Info
BUSINESS_NAME=TreatForTails
BUSINESS_TIMEZONE=Asia/Kolkata
```

### Optional Variables:
```
# Admin credentials (for first login)
ADMIN_EMAIL=admin@treatfortails.com
ADMIN_PASSWORD=changethispassword

# Message timing (24-hour format)
MESSAGE_WINDOW_START=9
MESSAGE_WINDOW_END=21

# Rate limiting
MAX_MESSAGES_PER_MINUTE=80
MAX_MESSAGES_PER_DAY=1000
```

## Step 6: Deploy

1. Railway will automatically deploy when you push code
2. Or click **"Deploy"** button manually
3. Wait for build to complete (usually 2-3 minutes)

## Step 7: Get Your Domain

1. Click on your service → **"Settings"**
2. Under **"Domains"**, click **"Generate Domain"**
3. Your app will be available at: `https://your-app.up.railway.app`

## Step 8: Configure WhatsApp Webhook

1. Go to [Meta Developer Console](https://developers.facebook.com)
2. Select your app → WhatsApp → Configuration
3. Under Webhooks, click **"Edit"**
4. **Callback URL**: `https://your-app.up.railway.app/webhooks/whatsapp`
5. **Verify Token**: Same as your `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
6. Subscribe to: `messages`, `message_deliveries`, `message_reads`

## Step 9: Configure WooCommerce Webhooks

In your WooCommerce admin:

1. Go to **WooCommerce → Settings → Advanced → Webhooks**
2. Add webhook for **Order Created**:
   - Delivery URL: `https://your-app.up.railway.app/webhooks/woocommerce/order`
   - Topic: Order created
   - Status: Active

3. Add webhook for **Order Updated**:
   - Delivery URL: `https://your-app.up.railway.app/webhooks/woocommerce/order`
   - Topic: Order updated
   - Status: Active

4. Add webhook for **Customer Created**:
   - Delivery URL: `https://your-app.up.railway.app/webhooks/woocommerce/customer`
   - Topic: Customer created
   - Status: Active

## Step 10: Access Dashboard

1. Open `https://your-app.up.railway.app`
2. Login with your admin credentials
3. Start creating campaigns!

---

## 💰 Estimated Costs

| Service | Cost |
|---------|------|
| Railway Hobby Plan | $5/month |
| PostgreSQL | Included in plan |
| Redis | Included in plan |
| **Total Infrastructure** | **~$5-10/month** |
| WhatsApp Conversations | ~$0.02-0.05 each |

Compare to AiSensy: $40-200/month + higher per-message costs!

---

## 🔧 Troubleshooting

### Build Failed
- Check logs in Railway dashboard
- Ensure all environment variables are set

### Database Connection Error
- Verify PostgreSQL is running in Railway
- Check DATABASE_URL is auto-injected

### Webhook Not Working
- Verify callback URL is correct
- Check verify token matches
- Look at Railway logs for errors

### WhatsApp Messages Not Sending
- Verify access token is valid
- Check phone number ID is correct
- Ensure templates are approved by Meta

---

## 📚 Useful Commands

```bash
# View logs
railway logs

# Open Railway shell
railway shell

# Run database migrations manually
railway run npx prisma migrate deploy

# Seed database
railway run npm run seed
```

---

## 🆘 Need Help?

1. Check Railway [docs](https://docs.railway.app)
2. Check [Meta WhatsApp docs](https://developers.facebook.com/docs/whatsapp)
3. Open an issue on GitHub
