import { Router } from "express";
import { RacesController } from "./races.controller";

const router = Router();
const controller = new RacesController();

router.get("/", (req, res) => controller.getAllRaces(req, res));
router.get("/:id", (req, res) => controller.getRaceById(req, res));

export default router;