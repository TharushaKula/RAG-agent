import express from "express";
import { getLearningResources } from "../controllers/learningController";

const router = express.Router();

router.get("/resources", getLearningResources);

export default router;
