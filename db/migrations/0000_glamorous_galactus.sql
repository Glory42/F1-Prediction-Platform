CREATE TYPE "public"."race_status" AS ENUM('scheduled', 'qualifying_done', 'completed');--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "circuits" (
	"id" serial PRIMARY KEY NOT NULL,
	"circuit_key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"country" varchar(50) NOT NULL,
	"city" varchar(50) NOT NULL,
	"lap_count" integer NOT NULL,
	"track_length_km" numeric(5, 3) NOT NULL,
	"overtake_rate" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circuits_circuit_key_unique" UNIQUE("circuit_key")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"team_key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"nationality" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"driver_number" integer NOT NULL,
	"code" char(3) NOT NULL,
	"first_name" varchar(50) NOT NULL,
	"last_name" varchar(50) NOT NULL,
	"nationality" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"circuit_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"race_date" date NOT NULL,
	"status" "race_status" DEFAULT 'scheduled' NOT NULL,
	"weather" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualifying_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"q1_time_ms" integer,
	"q2_time_ms" integer,
	"q3_time_ms" integer,
	"grid_position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"finish_position" integer,
	"grid_position" integer NOT NULL,
	"points" numeric(4, 1) DEFAULT '0' NOT NULL,
	"status" varchar(30) NOT NULL,
	"total_race_time_ms" bigint,
	"fastest_lap" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lap_times" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"lap_number" integer NOT NULL,
	"lap_time_ms" integer,
	"compound" varchar(20),
	"is_pit_lap" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_season_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"races_entered" integer DEFAULT 0 NOT NULL,
	"races_finished" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"podiums" integer DEFAULT 0 NOT NULL,
	"poles" integer DEFAULT 0 NOT NULL,
	"total_points" numeric(6, 1) DEFAULT '0' NOT NULL,
	"championship_position" integer,
	"avg_finish_position" numeric(4, 2),
	"win_rate" numeric(5, 4),
	"avg_position_gain" numeric(4, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_season_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"races_completed" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"podiums" integer DEFAULT 0 NOT NULL,
	"total_points" numeric(6, 1) DEFAULT '0' NOT NULL,
	"championship_position" integer,
	"avg_finish_position" numeric(4, 2),
	"car_performance_score" numeric(5, 4),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"predicted_winner_id" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model_version" varchar(20) DEFAULT 'weighted-v1' NOT NULL,
	"notes" text,
	CONSTRAINT "race_predictions_race_id_unique" UNIQUE("race_id")
);
--> statement-breakpoint
CREATE TABLE "driver_prediction_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"car_performance_score" numeric(6, 5) NOT NULL,
	"driver_rating_score" numeric(6, 5) NOT NULL,
	"starting_position_score" numeric(6, 5) NOT NULL,
	"win_rate_score" numeric(6, 5) NOT NULL,
	"luck_factor_score" numeric(6, 5) NOT NULL,
	"weather_impact_score" numeric(6, 5) NOT NULL,
	"track_overtake_score" numeric(6, 5) NOT NULL,
	"position_gain_score" numeric(6, 5) NOT NULL,
	"raw_weighted_score" numeric(8, 6) NOT NULL,
	"win_probability" numeric(6, 5) NOT NULL,
	"predicted_position" integer,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_circuit_id_circuits_id_fk" FOREIGN KEY ("circuit_id") REFERENCES "public"."circuits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifying_results" ADD CONSTRAINT "qualifying_results_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualifying_results" ADD CONSTRAINT "qualifying_results_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_results" ADD CONSTRAINT "race_results_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lap_times" ADD CONSTRAINT "lap_times_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lap_times" ADD CONSTRAINT "lap_times_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD CONSTRAINT "driver_season_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD CONSTRAINT "driver_season_stats_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD CONSTRAINT "team_season_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD CONSTRAINT "team_season_stats_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_predictions" ADD CONSTRAINT "race_predictions_predicted_winner_id_drivers_id_fk" FOREIGN KEY ("predicted_winner_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_prediction_features" ADD CONSTRAINT "driver_prediction_features_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_prediction_features" ADD CONSTRAINT "driver_prediction_features_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teams_season_team_key_idx" ON "teams" USING btree ("season_id","team_key");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_season_number_idx" ON "drivers" USING btree ("season_id","driver_number");--> statement-breakpoint
CREATE UNIQUE INDEX "races_season_round_idx" ON "races" USING btree ("season_id","round_number");--> statement-breakpoint
CREATE UNIQUE INDEX "qualifying_race_driver_idx" ON "qualifying_results" USING btree ("race_id","driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_results_race_driver_idx" ON "race_results" USING btree ("race_id","driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lap_times_race_driver_lap_idx" ON "lap_times" USING btree ("race_id","driver_id","lap_number");--> statement-breakpoint
CREATE INDEX "lap_times_race_driver_idx" ON "lap_times" USING btree ("race_id","driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_season_stats_season_driver_idx" ON "driver_season_stats" USING btree ("season_id","driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_season_stats_season_team_idx" ON "team_season_stats" USING btree ("season_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "driver_prediction_features_race_driver_idx" ON "driver_prediction_features" USING btree ("race_id","driver_id");