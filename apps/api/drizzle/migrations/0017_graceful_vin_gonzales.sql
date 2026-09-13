CREATE TABLE "race_overtakes" (
	"id" serial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"overtaking_driver_id" integer NOT NULL,
	"overtaken_driver_id" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_overtakes" ADD CONSTRAINT "race_overtakes_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_overtakes" ADD CONSTRAINT "race_overtakes_overtaking_driver_id_drivers_id_fk" FOREIGN KEY ("overtaking_driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_overtakes" ADD CONSTRAINT "race_overtakes_overtaken_driver_id_drivers_id_fk" FOREIGN KEY ("overtaken_driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "race_overtakes_race_date_pair_idx" ON "race_overtakes" USING btree ("race_id","date","overtaking_driver_id","overtaken_driver_id");--> statement-breakpoint
CREATE INDEX "race_overtakes_race_idx" ON "race_overtakes" USING btree ("race_id");