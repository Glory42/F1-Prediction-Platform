import { Request, Response } from "express";
import { RacesService } from "./races.service";
import { z } from "zod";

export class RacesController {
    private racesService: RacesService;

    constructor() {
        this.racesService = new RacesService();
    }

    async getAllRaces(req: Request, res: Response) {
        try {
            const querySchema = z.object({
                year: z.string({ message: 'Year is required' })
                .min(1, "Year is required")
                .transform((val) => parseInt(val))
                .refine((val) => !isNaN(val), { message: "Year must be a valid number" }),
            });

            const { year } = querySchema.parse(req.query);

            const races = await this.racesService.getAllRaces(year);

            return res.status(200).json({
                success: true,
                data: races,
            });

        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ 
                    success: false, 
                    message: error.issues[0].message 
                });
            }
            return res.status(500).json({ 
                success: false, 
                message: "Internal Server Error" 
            });
        }
    }
    
    async getRaceById(req: Request, res: Response) {
        try {
            const paramsSchema = z.object({
                id: z.string({ 
                    message: 'Race ID must be a string' 
                })
                .min(1, 'Race ID is required')
            });

            const { id } = paramsSchema.parse(req.params);

            const race = await this.racesService.getRaceById(id);
            if (!race) {
                return res.status(404).json({ success: false, message: "Race not found" });
            }

            return res.status(200).json({
                success: true,
                data: race,
            });

        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ 
                    success: false, 
                    message: error.issues[0].message 
                });
            }
            return res.status(500).json({ 
                success: false, 
                message: "Internal Server Error" 
            });
        }
    }
}