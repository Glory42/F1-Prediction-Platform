import { Router } from "express";
import { PredictionController } from "./predictions.controller";

const router = Router();
const controller = new PredictionController();

// Define your feature routes here
router.get("/:raceId", (req, res) => controller.getPredictionByRace(req, res));
router.post("/:raceId/generate", (req, res) => controller.generatePrediction(req, res));

export default router;