ALTER TYPE "public"."race_status" ADD VALUE 'sprint_qualifying_done' BEFORE 'qualifying_done';--> statement-breakpoint
ALTER TYPE "public"."race_status" ADD VALUE 'sprint_done' BEFORE 'qualifying_done';--> statement-breakpoint
CREATE TABLE "sprint_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"finish_position" integer,
	"grid_position" integer NOT NULL,
	"points" numeric(4, 1) DEFAULT '0' NOT NULL,
	"status" varchar(30) NOT NULL,
	"total_sprint_time_ms" bigint,
	"fastest_lap" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sprint_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"predicted_winner_id" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model_version" varchar(20) DEFAULT 'sprint-v1' NOT NULL,
	CONSTRAINT "sprint_predictions_race_id_unique" UNIQUE("race_id")
);
--> statement-breakpoint
CREATE TABLE "driver_sprint_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"car_performance_score" numeric(6, 5) NOT NULL,
	"starting_position_score" numeric(6, 5) NOT NULL,
	"driver_rating_score" numeric(6, 5) NOT NULL,
	"track_overtake_score" numeric(6, 5) NOT NULL,
	"short_run_pace_score" numeric(6, 5) NOT NULL,
	"weather_impact_score" numeric(6, 5) NOT NULL,
	"win_rate_score" numeric(6, 5) NOT NULL,
	"luck_factor_score" numeric(6, 5) NOT NULL,
	"raw_weighted_score" numeric(8, 6) NOT NULL,
	"win_probability" numeric(6, 5) DEFAULT '0' NOT NULL,
	"predicted_position" integer,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "event_format" varchar(30) DEFAULT 'conventional' NOT NULL;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "qualifying_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "sprint_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "sprint_qualifying_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sprint_results" ADD CONSTRAINT "sprint_results_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_results" ADD CONSTRAINT "sprint_results_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_predictions" ADD CONSTRAINT "sprint_predictions_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_predictions" ADD CONSTRAINT "sprint_predictions_predicted_winner_id_drivers_id_fk" FOREIGN KEY ("predicted_winner_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_sprint_features" ADD CONSTRAINT "driver_sprint_features_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_sprint_features" ADD CONSTRAINT "driver_sprint_features_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_results_race_driver_idx" ON "sprint_results" USING btree ("race_id","driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_sprint_features_race_driver_idx" ON "driver_sprint_features" USING btree ("race_id","driver_id");