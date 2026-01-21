import { Router } from "express";
import { uploadCVAndJD, getUserFiles } from "../controllers/cvController";
import { performSemanticMatch, getMatchResult, getUserMatchHistory } from "../controllers/semanticMatchController";
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

router.get("/files", authenticateToken, getUserFiles);

// Semantic matching routes
router.post(
    "/semantic-match",
    authenticateToken,
    upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'jdFile', maxCount: 1 }]),
    performSemanticMatch
);

router.get("/match/:matchId", authenticateToken, getMatchResult);

router.get("/match-history", authenticateToken, getUserMatchHistory);

export default router;
