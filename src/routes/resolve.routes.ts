import { Router } from 'express';
import { resolveController } from '../controllers/resolve.controller.js';

const router = Router();

// Preview resolution
router.get('/', (req, res) => resolveController.resolveInput(req, res));
router.post('/', (req, res) => resolveController.resolveInput(req, res));

export default router;
