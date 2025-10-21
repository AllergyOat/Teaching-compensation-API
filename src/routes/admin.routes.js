import { Router } from 'express';
import { requireAuth, permit } from '../middlewares/auth.js';
import { ListForms, listUsers, listHome, updateFormStatus } from '../controllers/admin.controller.js';
import { getFormById } from '../controllers/form.controller.js';
import { updateStatusSchema } from '../schemas/form.schemas.js';
import { validate } from '../middlewares/validate.js';

const router = Router();

router.get('/forms', requireAuth, permit('MAJOR_ADMIN'), ListForms);
router.get('/home', requireAuth, listHome);
router.get('/forms/:id', requireAuth, getFormById);
router.get('/users', requireAuth, listUsers);
router.put('/forms/:id/status', requireAuth, permit('MAJOR_ADMIN'), validate(updateStatusSchema), updateFormStatus);

export default router;
