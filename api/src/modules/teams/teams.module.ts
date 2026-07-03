import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { TeamsController } from './teams.controller';

const teamsModule = new Hono<{ Bindings: Bindings }>();

teamsModule.get('/standings/progression', TeamsController.getStandingsProgression);
teamsModule.get('/standings', TeamsController.getStandings);
teamsModule.get('/', TeamsController.getAll);
teamsModule.get('/:id/career', TeamsController.getCareerStats);
teamsModule.get('/:id', TeamsController.getById);

export default teamsModule;
