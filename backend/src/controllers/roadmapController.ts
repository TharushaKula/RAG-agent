import { Request, Response } from "express";
import { RoadmapService } from "../services/roadmapService";
import { RoadmapGenerator } from "../services/roadmapGenerator";
import { getVectorStore } from "../services/ragService";
import pdf from "pdf-parse";

const roadmapService = new RoadmapService();

/**
 * Generate a new roadmap
 */
export const generateRoadmap = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { source, cvSource, jdSource } = req.body;

        if (!source || !["profile", "cv", "jd", "hybrid"].includes(source)) {
            return res.status(400).json({ error: "Invalid source. Must be: profile, cv, jd, or hybrid" });
        }

        console.log(`🛣️ Generating roadmap for user ${userId}, source: ${source}`);

        const embeddingServiceUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8000';
        const generator = new RoadmapGenerator(embeddingServiceUrl);

        // Prepare input data
        const inputData: any = {};

        // Get CV text if needed
        if (source === "cv" || source === "hybrid") {
            if (cvSource) {
                const vectorStore = await getVectorStore();
                const collection = (vectorStore as any).collection;
                const documents = await collection.find({
                    $or: [
                        { "metadata.userId": userId, "metadata.source": cvSource, "metadata.type": "cv" },
                        { "userId": userId, "source": cvSource, "type": "cv" }
                    ]
                }).toArray();

                if (documents.length === 0) {
                    return res.status(404).json({ error: "CV not found" });
                }

                inputData.cvText = documents
                    .map((doc: any) => doc.text || doc.pageContent || "")
                    .filter((text: string) => text.trim().length > 0)
                    .join("\n\n");
                inputData.cvSource = cvSource;
            } else {
                return res.status(400).json({ error: "CV source is required for CV or hybrid roadmap" });
            }
        }

        // Get JD text if needed
        if (source === "jd" || source === "hybrid") {
            if (jdSource) {
                const vectorStore = await getVectorStore();
                const collection = (vectorStore as any).collection;
                const documents = await collection.find({
                    $or: [
                        { "metadata.userId": userId, "metadata.source": jdSource, "metadata.type": "jd" },
                        { "userId": userId, "source": jdSource, "type": "jd" }
                    ]
                }).toArray();

                if (documents.length === 0) {
                    return res.status(404).json({ error: "Job description not found" });
                }

                inputData.jdText = documents
                    .map((doc: any) => doc.text || doc.pageContent || "")
                    .filter((text: string) => text.trim().length > 0)
                    .join("\n\n");
                inputData.jdSource = jdSource;
            } else {
                return res.status(400).json({ error: "JD source is required for JD or hybrid roadmap" });
            }
        }

        // Generate roadmap
        const roadmap = await generator.generateRoadmap(userId, source, inputData);

        // Save to database
        const savedRoadmap = await roadmapService.createRoadmap(roadmap);

        console.log(`✅ Roadmap generated: ${savedRoadmap._id}`);

        res.json({
            success: true,
            roadmap: savedRoadmap
        });

    } catch (error: any) {
        console.error("Roadmap generation error:", error);
        res.status(500).json({
            error: "Failed to generate roadmap",
            message: error.message
        });
    }
};

/**
 * Get all roadmaps for user
 */
export const getUserRoadmaps = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const activeOnly = req.query.activeOnly === "true";
        const roadmaps = await roadmapService.getUserRoadmaps(userId, activeOnly);

        res.json({ roadmaps });

    } catch (error: any) {
        console.error("Get roadmaps error:", error);
        res.status(500).json({ error: "Failed to fetch roadmaps" });
    }
};

/**
 * Get specific roadmap
 */
export const getRoadmap = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { roadmapId } = req.params;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const roadmap = await roadmapService.getRoadmap(roadmapId, userId);

        if (!roadmap) {
            return res.status(404).json({ error: "Roadmap not found" });
        }

        // Recalculate progress
        await roadmapService.calculateProgress(roadmapId, userId);
        const updatedRoadmap = await roadmapService.getRoadmap(roadmapId, userId);

        res.json({ roadmap: updatedRoadmap });

    } catch (error: any) {
        console.error("Get roadmap error:", error);
        res.status(500).json({ error: "Failed to fetch roadmap" });
    }
};

/**
 * Update module status
 */
export const updateModuleStatus = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { roadmapId, moduleId } = req.params;
        const { status, progress } = req.body;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (!status || !["started", "completed"].includes(status)) {
            return res.status(400).json({ error: "Invalid status. Must be 'started' or 'completed'" });
        }

        const roadmap = await roadmapService.updateModuleStatus(
            roadmapId,
            userId,
            moduleId,
            status,
            progress
        );

        if (!roadmap) {
            return res.status(404).json({ error: "Roadmap or module not found" });
        }

        res.json({
            success: true,
            roadmap
        });

    } catch (error: any) {
        console.error("Update module status error:", error);
        res.status(500).json({ error: "Failed to update module status" });
    }
};

/**
 * Update resource status
 */
export const updateResourceStatus = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { roadmapId, moduleId, resourceId } = req.params;
        const { completed } = req.body;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (typeof completed !== "boolean") {
            return res.status(400).json({ error: "completed must be a boolean" });
        }

        const roadmap = await roadmapService.updateResourceStatus(
            roadmapId,
            userId,
            moduleId,
            resourceId,
            completed
        );

        if (!roadmap) {
            return res.status(404).json({ error: "Roadmap, module, or resource not found" });
        }

        res.json({
            success: true,
            roadmap
        });

    } catch (error: any) {
        console.error("Update resource status error:", error);
        res.status(500).json({ error: "Failed to update resource status" });
    }
};

/**
 * Delete roadmap
 */
export const deleteRoadmap = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { roadmapId } = req.params;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const deleted = await roadmapService.deleteRoadmap(roadmapId, userId);

        if (!deleted) {
            return res.status(404).json({ error: "Roadmap not found" });
        }

        res.json({ success: true });

    } catch (error: any) {
        console.error("Delete roadmap error:", error);
        res.status(500).json({ error: "Failed to delete roadmap" });
    }
};

/**
 * Set roadmap as active
 */
export const setActiveRoadmap = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { roadmapId } = req.params;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const roadmap = await roadmapService.updateRoadmap(roadmapId, userId, { isActive: true });

        if (!roadmap) {
            return res.status(404).json({ error: "Roadmap not found" });
        }

        res.json({
            success: true,
            roadmap
        });

    } catch (error: any) {
        console.error("Set active roadmap error:", error);
        res.status(500).json({ error: "Failed to set active roadmap" });
    }
};
