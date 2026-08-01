ALTER TABLE "drivers" ADD COLUMN "headshot_url" varchar(255);--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "safety_car_laps" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "vsc_laps" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "air_temp_avg" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "track_temp_avg" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "humidity_avg" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "qualifying_results" ADD COLUMN "sector1_ms" integer;--> statement-breakpoint
ALTER TABLE "qualifying_results" ADD COLUMN "sector2_ms" integer;--> statement-breakpoint
ALTER TABLE "qualifying_results" ADD COLUMN "sector3_ms" integer;--> statement-breakpoint
ALTER TABLE "qualifying_results" ADD COLUMN "speed_st" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "lap_times" ADD COLUMN "sector1_ms" integer;--> statement-breakpoint
ALTER TABLE "lap_times" ADD COLUMN "sector2_ms" integer;--> statement-breakpoint
ALTER TABLE "lap_times" ADD COLUMN "sector3_ms" integer;--> statement-breakpoint
ALTER TABLE "lap_times" ADD COLUMN "speed_st" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "lap_times" ADD COLUMN "tyre_life" integer;--> statement-breakpoint
ALTER TABLE "lap_times" ADD COLUMN "fresh_tyre" boolean;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "dnf_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "dnf_rate" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "avg_sector1_ms" integer;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "avg_sector2_ms" integer;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "avg_sector3_ms" integer;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "top_speed_avg" numeric(5, 1);--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "teammate_quali_delta" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD COLUMN "dnf_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD COLUMN "reliability_score" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "driver_prediction_features" ADD COLUMN "long_run_pace_score" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "driver_prediction_features" ADD COLUMN "reliability_score" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "driver_prediction_features" ADD COLUMN "qualifying_delta_score" numeric(6, 5);--> statement-breakpoint
ALTER TABLE "driver_prediction_features" ADD COLUMN "sector_strength_score" numeric(6, 5);