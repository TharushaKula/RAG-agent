import express from "express";
import { getTrends } from "../controllers/industryController";

const router = express.Router();

router.get("/trends", getTrends);

export default router;
