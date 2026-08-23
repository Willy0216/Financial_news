import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';
import { reportController } from '../controllers/report.controller.js';

const router = Router();

// Asset routes
router.get('/', (req, res) => assetController.listAssets(req, res));
router.post('/', (req, res) => assetController.addAsset(req, res));
router.get('/:symbol', (req, res) => assetController.getAsset(req, res));
router.delete('/:symbol', (req, res) => assetController.deleteAsset(req, res));

// Asset-specific report routes
router.get('/:symbol/prompt', (req, res) => reportController.getPopulatedPrompt(req, res));
router.post('/:symbol/report', (req, res) => reportController.generateReport(req, res));
router.get('/:symbol/reports', (req, res) => reportController.getAssetReports(req, res));

export default router;
