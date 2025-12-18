import { Router } from "express";
import { ingestData } from "../controllers/ingestController";
import multer from "multer";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();
const upload = multer();

router.post("/", authenticateToken, upload.single("file"), ingestData);

export default router;
