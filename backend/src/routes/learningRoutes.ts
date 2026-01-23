import express from "express";
import { getLearningResources, searchLearningResources } from "../controllers/learningController";

const router = express.Router();

router.get("/resources", getLearningResources);
router.get("/search", searchLearningResources);

export default router;
