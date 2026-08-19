import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { DriversController } from './drivers.controller';

const driversModule = new Hono<{ Bindings: Bindings }>();

driversModule.get('/standings', DriversController.getStandings);
driversModule.get('/', DriversController.getAll);
driversModule.get('/:id/career', DriversController.getCareerStats);
driversModule.get('/:id', DriversController.getById);

export default driversModule;
