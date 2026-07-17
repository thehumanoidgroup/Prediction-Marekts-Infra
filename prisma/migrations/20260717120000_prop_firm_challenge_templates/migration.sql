-- Per-prop-firm challenge rule templates (unique per firm + model type)
-- and optional ChallengeConfig → template link for override tracking.

CREATE TABLE IF NOT EXISTS "prop_firm_challenge_templates" (
    "id" TEXT NOT NULL,
    "prop_firm_id" TEXT NOT NULL,
    "model_type" "PropFirmModelType" NOT NULL,
    "profit_target" DECIMAL(8,4) NOT NULL,
    "daily_drawdown" DECIMAL(8,4) NOT NULL,
    "max_drawdown" DECIMAL(8,4) NOT NULL,
    "max_bet_size_per_pick" DECIMAL(14,2) NOT NULL,
    "max_bet_size_mode" "MaxBetSizeMode" NOT NULL DEFAULT 'percent',
    "max_bet_size_rules" JSONB,
    "consistency_score" DECIMAL(8,4),
    "min_trading_days" INTEGER,
    "other_rules" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prop_firm_challenge_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prop_firm_challenge_templates_prop_firm_id_model_type_key"
    ON "prop_firm_challenge_templates"("prop_firm_id", "model_type");

CREATE INDEX IF NOT EXISTS "prop_firm_challenge_templates_prop_firm_id_idx"
    ON "prop_firm_challenge_templates"("prop_firm_id");

CREATE INDEX IF NOT EXISTS "prop_firm_challenge_templates_model_type_idx"
    ON "prop_firm_challenge_templates"("model_type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prop_firm_challenge_templates_prop_firm_id_fkey'
  ) THEN
    ALTER TABLE "prop_firm_challenge_templates"
      ADD CONSTRAINT "prop_firm_challenge_templates_prop_firm_id_fkey"
      FOREIGN KEY ("prop_firm_id") REFERENCES "tenants"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "challenge_configs"
  ADD COLUMN IF NOT EXISTS "template_id" TEXT;

CREATE INDEX IF NOT EXISTS "challenge_configs_template_id_idx"
  ON "challenge_configs"("template_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'challenge_configs_template_id_fkey'
  ) THEN
    ALTER TABLE "challenge_configs"
      ADD CONSTRAINT "challenge_configs_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "prop_firm_challenge_templates"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
