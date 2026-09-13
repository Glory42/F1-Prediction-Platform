import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { RaceEventsController } from './race-events.controller';

const raceEventsModule = new Hono<{ Bindings: Bindings }>();

raceEventsModule.get('/:id/race-control', RaceEventsController.getRaceControl);

export default raceEventsModule;
