import { Router } from "express";
import { chat } from "../controllers/chatController";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();

router.post("/", authenticateToken, chat);

export default router;
