import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { SprintController } from './sprint.controller';

const sprint = new Hono<{ Bindings: Bindings }>();

sprint.get('/upcoming', SprintController.getUpcoming);
sprint.get('/race/:raceId', SprintController.getByRaceId);
sprint.get('/race/:raceId/detail', SprintController.getDetailByRaceId);

export default sprint;
