CREATE TABLE "track_locations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "track_locations" ADD CONSTRAINT "track_locations_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_locations" ADD CONSTRAINT "track_locations_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "track_locations_race_driver_date_idx" ON "track_locations" USING btree ("race_id","driver_id","date");--> statement-breakpoint
CREATE INDEX "track_locations_race_driver_idx" ON "track_locations" USING btree ("race_id","driver_id");