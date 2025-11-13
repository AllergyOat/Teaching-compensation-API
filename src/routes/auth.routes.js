import { Router } from 'express';
import { register, login, me, verifyEmail, forgotPassword, resetPassword, verifyResetOtp } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.js';
import { registerSchema, loginSchema } from '../schemas/auth.schemas.js';
import { verifyEmailSchema, forgotPasswordSchema, resetPasswordSchema } from '../schemas/auth.schemas.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.get('/me', requireAuth, me);

router.post('/verify-email', validate(verifyEmailSchema), verifyEmail);

//forgot and reset password routes
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/verify-reset-otp', verifyResetOtp);
router.post('/reset-password',validate(resetPasswordSchema), resetPassword);





export default router;
