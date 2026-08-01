CREATE INDEX "races_circuit_status_idx" ON "races" USING btree ("circuit_id","status");--> statement-breakpoint
CREATE INDEX "races_status_date_idx" ON "races" USING btree ("status","race_date");--> statement-breakpoint
CREATE INDEX "race_results_driver_idx" ON "race_results" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_season_stats_driver_idx" ON "driver_season_stats" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "team_season_stats_team_idx" ON "team_season_stats" USING btree ("team_id");