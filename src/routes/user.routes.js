import { Router } from "express";
import {
  getUserProfile,
  listMyForms,
  updateUserProfile,
} from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { userSchema } from "../schemas/auth.schemas.js";

const router = Router();

router.get("/home", requireAuth, listMyForms);
router.get("/profile", requireAuth, getUserProfile);
router.post("/profile", requireAuth, validate(userSchema), updateUserProfile);

/* # Filter by month only
GET /api/users/home?month=กุมภาพันธ์

# Filter by month and year
GET /api/users/home?month=กุมภาพันธ์&year=2567

# Filter by month, year, and semester
GET /api/users/home?month=กุมภาพันธ์&year=2567&semester=ภาคปลาย */


export default router;
