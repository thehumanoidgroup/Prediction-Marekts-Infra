-- Multi-provider S&P 500 dynamic stock prediction markets
-- Compatible with: internal | polymarket | kalshi | sp500_dynamic

CREATE TYPE "MarketProvider" AS ENUM ('internal', 'polymarket', 'kalshi', 'sp500_dynamic');
CREATE TYPE "StockExpirationType" AS ENUM ('0dte', 'weekly');

-- PropFirmAccount
ALTER TABLE "prop_firm_accounts" ADD COLUMN IF NOT EXISTS "provider" "MarketProvider" NOT NULL DEFAULT 'internal';
ALTER TABLE "prop_firm_accounts" ADD COLUMN IF NOT EXISTS "stock_ticker" TEXT;
ALTER TABLE "prop_firm_accounts" ADD COLUMN IF NOT EXISTS "strike_price" DECIMAL(14,4);
ALTER TABLE "prop_firm_accounts" ADD COLUMN IF NOT EXISTS "expiration_type" "StockExpirationType";
ALTER TABLE "prop_firm_accounts" ADD COLUMN IF NOT EXISTS "expiration_date" DATE;
CREATE INDEX IF NOT EXISTS "prop_firm_accounts_provider_idx" ON "prop_firm_accounts"("provider");
CREATE INDEX IF NOT EXISTS "prop_firm_accounts_stock_ticker_idx" ON "prop_firm_accounts"("stock_ticker");

-- ChallengeConfig
ALTER TABLE "challenge_configs" ADD COLUMN IF NOT EXISTS "provider" "MarketProvider" NOT NULL DEFAULT 'internal';
ALTER TABLE "challenge_configs" ADD COLUMN IF NOT EXISTS "sp500_tickers" JSONB;
ALTER TABLE "challenge_configs" ADD COLUMN IF NOT EXISTS "stock_ticker" TEXT;
ALTER TABLE "challenge_configs" ADD COLUMN IF NOT EXISTS "strike_price" DECIMAL(14,4);
ALTER TABLE "challenge_configs" ADD COLUMN IF NOT EXISTS "expiration_type" "StockExpirationType";
ALTER TABLE "challenge_configs" ADD COLUMN IF NOT EXISTS "expiration_date" DATE;
CREATE INDEX IF NOT EXISTS "challenge_configs_provider_idx" ON "challenge_configs"("provider");
CREATE INDEX IF NOT EXISTS "challenge_configs_stock_ticker_idx" ON "challenge_configs"("stock_ticker");

-- TraderDemoAccount
ALTER TABLE "trader_demo_accounts" ADD COLUMN IF NOT EXISTS "provider" "MarketProvider" NOT NULL DEFAULT 'internal';
ALTER TABLE "trader_demo_accounts" ADD COLUMN IF NOT EXISTS "stock_ticker" TEXT;
ALTER TABLE "trader_demo_accounts" ADD COLUMN IF NOT EXISTS "strike_price" DECIMAL(14,4);
ALTER TABLE "trader_demo_accounts" ADD COLUMN IF NOT EXISTS "expiration_type" "StockExpirationType";
ALTER TABLE "trader_demo_accounts" ADD COLUMN IF NOT EXISTS "expiration_date" DATE;
CREATE INDEX IF NOT EXISTS "trader_demo_accounts_provider_idx" ON "trader_demo_accounts"("provider");
CREATE INDEX IF NOT EXISTS "trader_demo_accounts_stock_ticker_idx" ON "trader_demo_accounts"("stock_ticker");
