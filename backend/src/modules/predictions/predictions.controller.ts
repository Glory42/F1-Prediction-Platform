import { Request, Response } from 'express';
import { PredictionService } from './predictions.service';
import { z } from 'zod';

export class PredictionController {
    private predictionService: PredictionService;

    constructor() {
        this.predictionService = new PredictionService();
    }

    async getPredictionByRace(req: Request, res: Response) {
        try {
            const paramsSchema = z.object({
                raceId: z.string().min(1, 'Race ID is required')
            });

            const { raceId } = paramsSchema.parse(req.params);

            const prediction = await this.predictionService.getPredictionByRace(raceId);
            if (!prediction) {
                return res.status(404).json({
                    success: false,
                    message: 'No prediction found for this race'
                });
            }

            return res.status(200).json({
                success: true,
                data: prediction,
            });

        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    success: false,
                    message: error.issues[0].message
                });
            }
            return res.status(500).json({
                succes: false,
                message: 'Internal Server Error',
            });
        }
    }

    async generatePrediction(req: Request, res: Response) {
        try {
            const paramsSchema = z.object({
                raceId: z.string().regex(/^\d+$/, 'Race ID must be a number').transform(Number)
            });

            const { raceId } = paramsSchema.parse(req.params);

            const prediction = await this.predictionService.calculateWinner(raceId);

            return res.status(201).json({
                success: true,
                data: prediction,
                message: 'Prediction generated successfully'
            });

        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    success: false,
                    message: error.issues[0].message
                });
            }
            
            console.error("Prediction Generation Error:", error);
            
            return res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : 'Internal Server Error',
            });
        }
    }
}