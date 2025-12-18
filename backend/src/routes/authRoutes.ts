import { Router } from "express";
import { signup, login, updateProfile } from "../controllers/authController";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.patch("/profile", authenticateToken, updateProfile);

export default router;
