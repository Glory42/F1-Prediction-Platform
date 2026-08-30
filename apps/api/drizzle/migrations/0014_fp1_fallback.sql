ALTER TABLE "fp2_long_run_times" ADD COLUMN IF NOT EXISTS "session_type" varchar(4) DEFAULT 'FP2' NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'driver_prediction_features' AND column_name = 'long_run_used_fp2') THEN
    ALTER TABLE "driver_prediction_features" RENAME COLUMN "long_run_used_fp2" TO "long_run_used_fp";
  END IF;
END $$;