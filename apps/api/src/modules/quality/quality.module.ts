import { Hono } from 'hono';
import type { Bindings } from '../../common/types';
import { QualityController } from './quality.controller';

const qualityModule = new Hono<{ Bindings: Bindings }>();

qualityModule.get('/', QualityController.getLatest);
qualityModule.get('/years', QualityController.getYears);

export default qualityModule;