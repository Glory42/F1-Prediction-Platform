CREATE TABLE "team_radio_clips" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"recording_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_radio_clips" ADD CONSTRAINT "team_radio_clips_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_radio_clips" ADD CONSTRAINT "team_radio_clips_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_radio_clips_race_driver_date_idx" ON "team_radio_clips" USING btree ("race_id","driver_id","date");--> statement-breakpoint
CREATE INDEX "team_radio_clips_race_idx" ON "team_radio_clips" USING btree ("race_id");