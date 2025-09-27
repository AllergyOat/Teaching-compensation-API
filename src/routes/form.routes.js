import { Router } from "express";
import {
  createForm,
  editForm,
  getFormById,
  deleteForm,
} from "../controllers/form.controller.js";
import {
  generateScheduleDocx,
  generateCompensationDocx,
  generateDocx,
  generateEvidenceDocx,
} from "../controllers/docs.controller.js";
import { requireAuth, permit } from "../middlewares/auth.js";

const router = Router();

router.post("/create-form", requireAuth, createForm);
router.get("/:id", requireAuth, getFormById);
router.put("/edit-form/:id", requireAuth, editForm);
router.delete("/:id", requireAuth, deleteForm);

// INPUT SECTION
router.get("/:formId/generate-report", requireAuth, generateScheduleDocx);
router.get("/:compensationId/generate-compensation", requireAuth, generateCompensationDocx);

// OUTPUT SECTION
router.post("/generate-docx", requireAuth, permit("MAJOR_ADMIN"), generateDocx);
router.post("/:formId/generate-evidence", requireAuth, generateEvidenceDocx);

export default router;
