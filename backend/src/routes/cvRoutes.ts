import { Router } from "express";
import { uploadCVAndJD } from "../controllers/cvController";
import multer from "multer";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();
const upload = multer();

router.post(
    "/analyze",
    authenticateToken,
    upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'jdFile', maxCount: 1 }]),
    uploadCVAndJD
);

export default router;
