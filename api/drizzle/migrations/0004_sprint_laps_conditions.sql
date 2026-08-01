ALTER TABLE "races" ADD COLUMN "sprint_weather" varchar(30);--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "sprint_safety_car_laps" integer;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "sprint_vsc_laps" integer;--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "sprint_air_temp_avg" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "sprint_track_temp_avg" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "races" ADD COLUMN "sprint_humidity_avg" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "sprint_results" ADD COLUMN "sq1_time_ms" integer;--> statement-breakpoint
ALTER TABLE "sprint_results" ADD COLUMN "sq2_time_ms" integer;--> statement-breakpoint
ALTER TABLE "sprint_results" ADD COLUMN "sq3_time_ms" integer;--> statement-breakpoint
CREATE TABLE "sprint_lap_times" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"lap_number" integer NOT NULL,
	"lap_time_ms" integer,
	"sector1_ms" integer,
	"sector2_ms" integer,
	"sector3_ms" integer,
	"speed_st" numeric(5, 1),
	"compound" varchar(20),
	"tyre_life" integer,
	"fresh_tyre" boolean,
	"is_pit_lap" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sprint_lap_times" ADD CONSTRAINT "sprint_lap_times_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_lap_times" ADD CONSTRAINT "sprint_lap_times_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_lap_times_race_driver_lap_idx" ON "sprint_lap_times" USING btree ("race_id","driver_id","lap_number");--> statement-breakpoint
CREATE INDEX "sprint_lap_times_race_driver_idx" ON "sprint_lap_times" USING btree ("race_id","driver_id");
