import { Router } from "express";
import {
  addInternalNote,
  createReport,
  getMyReports,
  getPublicDashboardStats,
  getReports,
  getSpamReports,
  updateReportMeta,
  updateReportStatus,
} from "../controllers/reportController.js";
import { adminOnly, protect } from "../middleware/auth.js";

const router = Router();

router.get("/summary", getPublicDashboardStats);
router.get("/", getReports);
router.get("/spam", protect, adminOnly, getSpamReports);
router.get("/my", protect, getMyReports);
router.post("/", createReport);

router.patch("/:id/status", protect, adminOnly, updateReportStatus);
router.patch("/:id/meta", protect, adminOnly, updateReportMeta);
router.patch("/:id/notes", protect, adminOnly, addInternalNote);

export default router;
