# 📧 Email Alert System Setup Guide

This guide walks you through setting up the automated email notification system for price alerts in your Crypto Exit Planner.

## 🏗️ System Architecture

The email system consists of:
- **Supabase Edge Function** (`price-monitor`) - Monitors prices and sends emails
- **Resend API** - Handles email delivery 
- **GitHub Actions** - Runs the monitoring job every 5 minutes
- **Price Alerts Database** - Stores alert configurations

## 📋 Prerequisites

1. **Supabase Project** (you already have this)
2. **Resend Account** (free tier available)
3. **GitHub Repository** (you already have this)

## 🚀 Step-by-Step Setup

### Step 1: Update Your Supabase Database

1. Go to your Supabase project dashboard
2. Navigate to **Database** → **SQL Editor**
3. Run the database upgrade commands from `database-schema.sql`:

```sql
-- Add new columns to existing price_alerts table
ALTER TABLE price_alerts 
ADD COLUMN IF NOT EXISTS percentage_to_sell decimal(5,2),
ADD COLUMN IF NOT EXISTS current_price decimal,
ADD COLUMN IF NOT EXISTS is_triggered boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS user_email text,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;

-- Update alert_type default value
ALTER TABLE price_alerts ALTER COLUMN alert_type SET DEFAULT 'exit_level';

-- Add new indexes for email system performance
CREATE INDEX IF NOT EXISTS idx_price_alerts_triggered ON price_alerts(is_triggered, email_sent);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active_exit_levels ON price_alerts(is_active, alert_type) WHERE is_active = true AND alert_type = 'exit_level';

-- Add trigger for updated_at column
CREATE TRIGGER update_price_alerts_updated_at BEFORE UPDATE ON price_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Step 2: Set Up Resend Email Service

1. **Create Resend Account**:
   - Go to [resend.com](https://resend.com)
   - Sign up for a free account (100 emails/day)

2. **Get API Key**:
   - Go to **API Keys** in your Resend dashboard
   - Click **Create API Key**
   - Give it a name like "Crypto Exit Planner"
   - Copy the API key (starts with `re_`)

3. **Add Your Domain** (Optional but recommended):
   - Go to **Domains** in Resend dashboard
   - Add your domain or use Resend's sandbox domain for testing

### Step 3: Deploy Supabase Edge Function

1. **Install Supabase CLI** (if not already installed):
```bash
npm install -g supabase
```

2. **Login to Supabase**:
```bash
supabase login
```

3. **Link Your Project**:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

4. **Deploy the Edge Function**:
```bash
supabase functions deploy price-monitor
```

5. **Set Environment Variables**:
```bash
# Set the Resend API key
supabase secrets set RESEND_API_KEY=re_your_resend_api_key_here

# Verify secrets are set
supabase secrets list
```

### Step 4: Configure GitHub Actions

1. **Add Repository Secrets**:
   - Go to your GitHub repository
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Add these secrets:
     - `SUPABASE_URL`: Your Supabase project URL
     - `SUPABASE_ANON_KEY`: Your Supabase anon/public key

2. **Enable GitHub Actions** (if not already enabled):
   - The workflow file `.github/workflows/price-monitor.yml` is already in your repo
   - It will automatically run every 5 minutes

### Step 5: Test the System

1. **Manual Function Test**:
```bash
# Test the function directly
supabase functions invoke price-monitor --env-file supabase/.env.local
```

2. **Create a Test Alert**:
   - Add an exit level in your app with a very low target price
   - The system should detect it and send an email

3. **Check GitHub Actions**:
   - Go to **Actions** tab in your GitHub repo
   - Monitor the "Price Monitor" workflow runs

## 🔧 Configuration Options

### Email Frequency
The system runs every 5 minutes. To change this:
- Edit `.github/workflows/price-monitor.yml`
- Modify the cron expression: `'*/5 * * * *'`

### Email Template
To customize the email template:
- Edit `supabase/functions/price-monitor/index.ts`
- Modify the `emailHtml` section in `sendPriceAlertEmail()`

### Alert Triggers
Currently alerts trigger when:
- Price goes **above** the target (for exit levels)
- You can modify the logic in the price monitoring function

## 🐛 Troubleshooting

### Common Issues

1. **"Edge Function not found"**:
   - Ensure you've deployed the function: `supabase functions deploy price-monitor`
   - Check the function name matches in GitHub Actions

2. **"RESEND_API_KEY not set"**:
   - Verify secret is set: `supabase secrets list`
   - Re-run: `supabase secrets set RESEND_API_KEY=your_key`

3. **GitHub Actions failing**:
   - Check repository secrets are set correctly
   - Verify Supabase URL and anon key are correct

4. **No emails received**:
   - Check spam folder
   - Verify Resend account is active
   - Check function logs in Supabase dashboard

### Monitoring

1. **Function Logs**:
   - Supabase Dashboard → **Edge Functions** → **price-monitor** → **Logs**

2. **GitHub Actions Logs**:
   - GitHub Repository → **Actions** → Click on individual workflow runs

3. **Resend Logs**:
   - Resend Dashboard → **Logs** to see email delivery status

## 💰 Costs

- **Supabase**: Edge Functions included in free tier (500K invocations/month)
- **Resend**: Free tier includes 100 emails/day
- **GitHub Actions**: 2000 minutes/month free (this uses ~1 minute/day)

## 🔒 Security Notes

- API keys are stored securely in Supabase and GitHub secrets
- Row Level Security (RLS) ensures users only see their own alerts
- Email addresses are cached for performance but not exposed

## 📊 How It Works

1. **User adds exit level** → Frontend creates price alert in database
2. **GitHub Actions runs every 5 minutes** → Calls Supabase Edge Function
3. **Edge Function fetches current prices** → Compares to alert targets
4. **When target reached** → Sends email via Resend API
5. **Alert marked as triggered** → Prevents duplicate emails

## 🎯 Next Steps

Once set up, the system will:
- ✅ Automatically monitor your exit levels
- ✅ Send beautiful HTML emails when targets are reached
- ✅ Include target price, current price, and planned sell percentage
- ✅ Provide direct links back to your strategy page

Your friends can also set up their own alerts by creating accounts in your app!
