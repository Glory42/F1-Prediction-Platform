import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { RacesController } from './races.controller';

const racesModule = new Hono<{ Bindings: Bindings }>();

racesModule.get('/', RacesController.getAll);
racesModule.get('/circuit/:circuitKey', RacesController.getCircuitHistory);
racesModule.get('/:id', RacesController.getById);

export default racesModule;
