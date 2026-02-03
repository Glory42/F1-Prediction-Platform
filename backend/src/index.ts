import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';

import raceRoutes from "./modules/races/races.routes";
import predictionRoutes from "./modules/predictions/predictions.routes";

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());


app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime() });
});

app.use('/api/races', raceRoutes);
app.use('/api/predictions', predictionRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

const port = process.env.PORT;
app.listen(port, () => {
    console.log(`🏎️  F1 Guesser API running on http://localhost:${port}`);
});