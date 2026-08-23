import { Router } from 'express';
import { macroController } from '../controllers/macro.controller.js';

const router = Router();

// GET /api/macro-dashboard
router.get('/', (req, res) => macroController.getDashboard(req, res));

// POST /api/macro-dashboard/refresh
router.post('/refresh', (req, res) => macroController.refreshDashboard(req, res));

export default router;
