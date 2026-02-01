import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware";
import { getPodcasts } from "../controllers/podcastsController";

const router = Router();

// All routes require authentication
router.use(authenticateToken);

router.get("/", getPodcasts);

export default router;
