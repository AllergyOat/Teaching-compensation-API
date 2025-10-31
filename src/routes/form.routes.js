import { Router } from "express";
import {
  createForm,
  editForm,
  getFormById,
  deleteForm,
  createCompensation,
} from "../controllers/form.controller.js";
import {
  generateScheduleDocx,
  generateDocx,
  generateEvidenceDocx,
  generateCompensationDocx,
  generateSummaryScheduleDocx,
} from "../controllers/docs.controller.js";
import { requireAuth, permit } from "../middlewares/auth.js";

const router = Router();

router.post("/create-form", requireAuth, createForm);
router.post("/create-compensation", requireAuth, createCompensation);

// INPUT SECTION
router.get("/:formId/:sectionId/generate-report", requireAuth, generateScheduleDocx);
// router.get("/:formId/:sectionId/generate-report/:format", requireAuth, generateScheduleDocx);
router.get("/:formId/:sectionId/generate-compensation", requireAuth, generateCompensationDocx);

// OUTPUT SECTION
router.get("/:formId/:sectionId/generate-docx", requireAuth, permit("MAJOR_ADMIN"), generateDocx);
router.get("/:formId/:sectionId/generate-evidence", requireAuth, permit("MAJOR_ADMIN"), generateEvidenceDocx);
router.get("/:formId/:sectionId/generate-sumschedule", requireAuth, permit("MAJOR_ADMIN"), generateSummaryScheduleDocx);

router.get("/:id", requireAuth, getFormById);
router.get("/:id/:sectionId", requireAuth, getFormById);
router.put("/edit-form/:id", requireAuth, editForm);
router.delete("/:id", requireAuth, deleteForm);

export default router;
