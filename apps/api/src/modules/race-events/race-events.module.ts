import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { RaceEventsController } from './race-events.controller';

const raceEventsModule = new Hono<{ Bindings: Bindings }>();

raceEventsModule.get('/:id/race-control', RaceEventsController.getRaceControl);
raceEventsModule.get('/:id/overtakes', RaceEventsController.getOvertakes);
raceEventsModule.get('/:id/team-radio', RaceEventsController.getTeamRadio);

export default raceEventsModule;
