-- Crypto Exit Planner Database Schema
-- Run these in your Supabase SQL Editor (Settings > Database > SQL Editor)

-- 1. User Portfolios Table
CREATE TABLE IF NOT EXISTS user_portfolios (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id text NOT NULL,
    asset_name text NOT NULL,
    symbol text NOT NULL,
    amount decimal NOT NULL DEFAULT 0,
    avg_price decimal NOT NULL DEFAULT 0,
    exit_strategy jsonb DEFAULT '[]'::jsonb,
    wallets jsonb DEFAULT '[]'::jsonb,
    sales jsonb DEFAULT '[]'::jsonb,
    purchases jsonb DEFAULT '[]'::jsonb,
    icon_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enhanced Price Alerts Table for Email Notifications
CREATE TABLE IF NOT EXISTS price_alerts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id text NOT NULL,
    asset_name text NOT NULL,
    symbol text NOT NULL,
    target_price decimal NOT NULL,
    direction text NOT NULL CHECK (direction IN ('above', 'below')),
    alert_type text NOT NULL DEFAULT 'exit_level' CHECK (alert_type IN ('price', 'percentage', 'exit_level')),
    percentage_to_sell decimal(5,2), -- For exit level alerts, how much to sell
    current_price decimal, -- Last known price when alert was created/updated
    is_active boolean DEFAULT true,
    is_triggered boolean DEFAULT false,
    email_sent boolean DEFAULT false,
    email_sent_at timestamp with time zone,
    user_email text, -- Cache user email for faster processing
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    triggered_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. User Sales Table
CREATE TABLE IF NOT EXISTS user_sales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id text NOT NULL,
    amount decimal NOT NULL,
    price decimal NOT NULL,
    value decimal NOT NULL,
    date timestamp with time zone NOT NULL,
    wallet_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. User Purchases Table
CREATE TABLE IF NOT EXISTS user_purchases (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id text NOT NULL,
    amount decimal NOT NULL,
    price decimal NOT NULL,
    value decimal NOT NULL,
    purchase_type text DEFAULT 'market',
    date timestamp with time zone NOT NULL,
    wallet_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. User Wallets Table
CREATE TABLE IF NOT EXISTS user_wallets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    asset_id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    amount decimal NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    currency text DEFAULT 'NOK',
    email_notifications boolean DEFAULT true,
    price_alert_frequency text DEFAULT 'immediate' CHECK (price_alert_frequency IN ('immediate', 'hourly', 'daily')),
    theme text DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add Row Level Security (RLS) policies
ALTER TABLE user_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only see their own data
CREATE POLICY "Users can view own portfolios" ON user_portfolios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolios" ON user_portfolios FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolios" ON user_portfolios FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolios" ON user_portfolios FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own alerts" ON price_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON price_alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON price_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON price_alerts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sales" ON user_sales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sales" ON user_sales FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sales" ON user_sales FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sales" ON user_sales FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own purchases" ON user_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own purchases" ON user_purchases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own purchases" ON user_purchases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own purchases" ON user_purchases FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own wallets" ON user_wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wallets" ON user_wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wallets" ON user_wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own wallets" ON user_wallets FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own preferences" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own preferences" ON user_preferences FOR DELETE USING (auth.uid() = user_id);

-- ===== DATABASE UPGRADE COMMANDS =====
-- Run these commands if you have an existing database to upgrade the price_alerts table:

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

-- ===== END UPGRADE COMMANDS =====

-- ===== SCHEDULED JOB SETUP =====
-- Enable the pg_cron extension for scheduled jobs
-- Note: This may require superuser privileges and might not work on all Supabase plans
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the price monitoring job to run every 5 minutes
-- Note: Replace YOUR_EDGE_FUNCTION_URL with your actual deployed function URL
-- SELECT cron.schedule(
--   'price-monitor-job',
--   '*/5 * * * *', -- Every 5 minutes
--   'SELECT net.http_post(
--     url := ''YOUR_EDGE_FUNCTION_URL/functions/v1/price-monitor'',
--     headers := ''{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'',
--     body := ''{}''
--   );'
-- );

-- Alternative: Create a webhook endpoint that can be called by external cron services
-- You can use services like cron-job.org, UptimeRobot, or GitHub Actions to call this endpoint

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_user_portfolios_updated_at BEFORE UPDATE ON user_portfolios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_wallets_updated_at BEFORE UPDATE ON user_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_price_alerts_updated_at BEFORE UPDATE ON price_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_portfolios_user_id ON user_portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_user_portfolios_asset_id ON user_portfolios(asset_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sales_user_id ON user_sales(user_id);
CREATE INDEX IF NOT EXISTS idx_user_purchases_user_id ON user_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_asset_id ON user_wallets(asset_id);
