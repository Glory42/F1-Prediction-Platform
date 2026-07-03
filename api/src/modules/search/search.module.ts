import { Hono } from 'hono';
import { SearchController } from './search.controller';
import type { Bindings } from '../../common/types';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', SearchController.getAll);

export default app;
