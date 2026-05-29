import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { PredictionsController } from './predictions.controller';

const predictionsModule = new Hono<{ Bindings: Bindings }>();

predictionsModule.get('/upcoming', PredictionsController.getUpcoming);
predictionsModule.get('/history', PredictionsController.getHistory);
predictionsModule.get('/standings', PredictionsController.getIntelStandings);
predictionsModule.get('/race/:raceId', PredictionsController.getByRaceId);

export default predictionsModule;
