import { Router } from 'express';
import { requireAuth, permit } from '../middlewares/auth.js';
import { listForms, listUsers, listHome, updateFormStatus, userDashboard, createSubjectSectionRate, editSubjectSectionRate } from '../controllers/admin.controller.js';
import { getFormById } from '../controllers/form.controller.js';
import { updateStatusSchema } from '../schemas/form.schemas.js';
import { validate } from '../middlewares/validate.js';

const router = Router();

router.get('/forms', requireAuth, permit('MAJOR_ADMIN'), listForms);
router.get('/home', requireAuth, listHome);
router.get('/forms/:id', requireAuth, getFormById);
router.get('/users', requireAuth, listUsers);
// Subject section rate
router.post('/subject-section-rates', requireAuth, permit('MAJOR_ADMIN'), createSubjectSectionRate);
router.put('/subject-section-rates/:id', requireAuth, permit('MAJOR_ADMIN'), editSubjectSectionRate);
router.get('/users-dashboard/:year/:id', requireAuth, permit('MAJOR_ADMIN'), userDashboard);
router.put('/forms/:id/status', requireAuth, permit('MAJOR_ADMIN'), validate(updateStatusSchema), updateFormStatus);

export default router;
