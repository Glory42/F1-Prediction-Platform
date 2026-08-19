-- Phase 1 (cont.): new feature columns on driver_sprint_features
ALTER TABLE "driver_sprint_features" ADD COLUMN "circuit_adj_start_pos_score" numeric(6,5);--> statement-breakpoint
ALTER TABLE "driver_sprint_features" ADD COLUMN "sq_qualifying_delta_score" numeric(6,5);--> statement-breakpoint
