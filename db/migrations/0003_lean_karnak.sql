ALTER TABLE "driver_season_stats" ADD COLUMN "sprint_races_entered" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "sprint_wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "sprint_podiums" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "sprint_total_points" numeric(6, 1) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "sprint_avg_finish_position" numeric(4, 2);--> statement-breakpoint
ALTER TABLE "driver_season_stats" ADD COLUMN "sprint_win_rate" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD COLUMN "sprint_wins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD COLUMN "sprint_podiums" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_season_stats" ADD COLUMN "sprint_total_points" numeric(6, 1) DEFAULT '0' NOT NULL;