import { Router } from 'express';
import { requireAuth, permit } from '../middlewares/auth.js';
import { ListForms, listUsers, updateFormStatus } from '../controllers/admin.controller.js';
import { updateStatusSchema } from '../schemas/form.schemas.js';
import { validate } from '../middlewares/validate.js';

const router = Router();

router.get('/users', requireAuth, permit('MAJOR_ADMIN'), listUsers);
router.get('/forms', requireAuth, permit('MAJOR_ADMIN'), ListForms);
router.put('/forms/:id/status', requireAuth, permit('MAJOR_ADMIN'), validate(updateStatusSchema), updateFormStatus);

export default router;
