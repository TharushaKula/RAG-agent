import { Router } from "express";
import {
    generateRoadmap,
    getUserRoadmaps,
    getRoadmap,
    updateModuleStatus,
    updateResourceStatus,
    deleteRoadmap,
    setActiveRoadmap
} from "../controllers/roadmapController";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Generate new roadmap
router.post("/generate", generateRoadmap);

// Get user's roadmaps
router.get("/", getUserRoadmaps);

// Get specific roadmap
router.get("/:roadmapId", getRoadmap);

// Update module status
router.patch("/:roadmapId/module/:moduleId", updateModuleStatus);

// Update resource status
router.patch("/:roadmapId/module/:moduleId/resource/:resourceId", updateResourceStatus);

// Set roadmap as active
router.patch("/:roadmapId/activate", setActiveRoadmap);

// Delete roadmap
router.delete("/:roadmapId", deleteRoadmap);

export default router;
