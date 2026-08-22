import { Router } from 'express';
import { chartController } from '../controllers/chart.controller.js';

const router = Router();

router.get('/:symbol', (req, res) => chartController.getChart(req, res));

export default router;
