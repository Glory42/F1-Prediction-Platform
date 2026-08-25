ALTER TABLE "driver_prediction_features" ADD COLUMN "long_run_used_fp2" boolean;--> statement-breakpoint
CREATE TABLE "data_quality_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"race_id" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"health_score" numeric(5, 2) NOT NULL,
	"summary" jsonb NOT NULL
);--> statement-breakpoint
CREATE TABLE "data_quality_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"race_id" integer,
	"round_number" integer,
	"year" integer NOT NULL,
	"table_name" varchar(40),
	"check_name" varchar(60) NOT NULL,
	"severity" varchar(10) NOT NULL,
	"detail" varchar(500),
	"fixable" boolean DEFAULT false NOT NULL,
	"is_sprint" boolean DEFAULT false NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "data_quality_runs_year_idx" ON "data_quality_runs" USING btree ("year");--> statement-breakpoint
CREATE INDEX "data_quality_runs_race_idx" ON "data_quality_runs" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "data_quality_issues_run_idx" ON "data_quality_issues" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "data_quality_issues_race_idx" ON "data_quality_issues" USING btree ("race_id");--> statement-breakpoint
ALTER TABLE "data_quality_runs" ADD CONSTRAINT "data_quality_runs_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_run_id_data_quality_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "data_quality_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "races"("id") ON DELETE no action ON UPDATE no action;