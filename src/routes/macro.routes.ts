import { Router } from 'express';
import { macroController } from '../controllers/macro.controller.js';

const router = Router();

// GET /api/macro-dashboard
router.get('/', (req, res) => macroController.getDashboard(req, res));

// POST /api/macro-dashboard/refresh
router.post('/refresh', (req, res) => macroController.refreshDashboard(req, res));

// GET /api/macro-dashboard/prompt
router.get('/prompt', (req, res) => macroController.getMacroPrompt(req, res));

// POST /api/macro-dashboard/report
router.post('/report', (req, res) => macroController.generateMacroReport(req, res));

export default router;
