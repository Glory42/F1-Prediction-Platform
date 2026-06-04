-- Phase 1: sc_probability on circuits, stint_number on lap tables,
--           fp2_long_run_times table, new feature columns on prediction tables

-- 1a. Safety car probability per circuit
ALTER TABLE "circuits" ADD COLUMN "sc_probability" numeric(4,3);--> statement-breakpoint

-- Populate immediately from historical race data
UPDATE "circuits" c
SET "sc_probability" = (
    SELECT ROUND(
        COUNT(*) FILTER (WHERE r.safety_car_laps > 0)::numeric /
        NULLIF(COUNT(*) FILTER (WHERE r.status = 'completed'), 0),
        3
    )
    FROM races r
    WHERE r.circuit_id = c.id
      AND r.status = 'completed'
);--> statement-breakpoint

-- 1b. Stint number on lap_times
ALTER TABLE "lap_times" ADD COLUMN "stint_number" integer;--> statement-breakpoint

-- 1c. Stint number on sprint_lap_times
ALTER TABLE "sprint_lap_times" ADD COLUMN "stint_number" integer;--> statement-breakpoint

-- 1d. FP2 long-run times table
CREATE TABLE "fp2_long_run_times" (
    "id" serial PRIMARY KEY NOT NULL,
    "race_id" integer NOT NULL,
    "driver_id" integer NOT NULL,
    "compound" varchar(20) NOT NULL,
    "median_lap_ms" integer,
    "stint_length" integer,
    "fp2_best_lap_ms" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "fp2_long_run_times"
    ADD CONSTRAINT "fp2_long_run_times_race_id_races_id_fk"
    FOREIGN KEY ("race_id") REFERENCES "public"."races"("id")
    ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "fp2_long_run_times"
    ADD CONSTRAINT "fp2_long_run_times_driver_id_drivers_id_fk"
    FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id")
    ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "fp2_long_run_times_race_driver_compound_idx"
    ON "fp2_long_run_times" ("race_id", "driver_id", "compound");--> statement-breakpoint

-- 1e. Make track_overtake_score nullable on both feature tables
--     (will be set to NULL by the new compute jobs going forward)
ALTER TABLE "driver_prediction_features" ALTER COLUMN "track_overtake_score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_sprint_features" ALTER COLUMN "track_overtake_score" DROP NOT NULL;--> statement-breakpoint

-- 1f. New feature columns on driver_prediction_features
ALTER TABLE "driver_prediction_features" ADD COLUMN "tyre_deg_score" numeric(6,5);--> statement-breakpoint
ALTER TABLE "driver_prediction_features" ADD COLUMN "circuit_adj_start_pos_score" numeric(6,5);--> statement-breakpoint
ALTER TABLE "driver_prediction_features" ADD COLUMN "circuit_adj_position_gain_score" numeric(6,5);--> statement-breakpoint
