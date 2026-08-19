import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { SeasonsController } from './seasons.controller';

const seasonsModule = new Hono<{ Bindings: Bindings }>();

seasonsModule.get('/', SeasonsController.getAll);

export default seasonsModule;
