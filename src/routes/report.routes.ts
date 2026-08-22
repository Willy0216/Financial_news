import { Router } from 'express';
import { reportController } from '../controllers/report.controller.js';

const router = Router();

// Batch report generation
router.post('/batch', (req, res) => reportController.generateBatchReports(req, res));

export default router;
