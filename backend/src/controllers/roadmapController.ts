import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { RoadmapService } from "../services/roadmapService";
import { RoadmapGenerator } from "../services/roadmapGenerator";
import { getVectorStore } from "../services/ragService";
import { Roadmap } from "../models/Roadmap";
import pdf from "pdf-parse";

const roadmapService = new RoadmapService();

/** Convert roadmap (and nested BSON types) to a plain JSON-safe object for HTTP response */
function roadmapToJSON(roadmap: Roadmap): Record<string, unknown> {
    const id = roadmap._id instanceof ObjectId ? roadmap._id.toString() : roadmap._id;
    const userId = roadmap.userId instanceof ObjectId ? roadmap.userId.toString() : roadmap.userId;
    const createdAt = roadmap.createdAt instanceof Date ? roadmap.createdAt.toISOString() : roadmap.createdAt;
    const updatedAt = roadmap.updatedAt instanceof Date ? roadmap.updatedAt.toISOString() : roadmap.updatedAt;
    const stages = (roadmap.stages || []).map((stage) => ({
        id: stage.id,
        name: stage.name,
        description: stage.description,
        order: stage.order,
        prerequisites: stage.prerequisites,
        modules: (stage.modules || []).map((mod) => ({
            id: mod.id,
            title: mod.title,
            description: mod.description,
            status: mod.status,
            order: mod.order,
            estimatedTime: mod.estimatedTime,
            estimatedHours: mod.estimatedHours,
            prerequisites: mod.prerequisites,
            progress: mod.progress,
            completedAt: mod.completedAt instanceof Date ? mod.completedAt.toISOString() : mod.completedAt,
            startedAt: mod.startedAt instanceof Date ? mod.startedAt.toISOString() : mod.startedAt,
            resources: (mod.resources || []).map((r) => ({
                id: r.id,
                type: r.type,
                title: r.title,
                url: r.url,
                description: r.description,
                duration: r.duration,
                difficulty: r.difficulty,
                completed: r.completed,
                completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : r.completedAt,
            })),
        })),
    }));
    const sourceData =
        roadmap.sourceData && typeof roadmap.sourceData === "object"
            ? {
                ...(typeof roadmap.sourceData.cvSource === "string" && { cvSource: roadmap.sourceData.cvSource }),
                ...(typeof roadmap.sourceData.jdSource === "string" && { jdSource: roadmap.sourceData.jdSource }),
                ...(typeof roadmap.sourceData.semanticMatchScore === "number" && { semanticMatchScore: roadmap.sourceData.semanticMatchScore }),
            }
            : undefined;

    return {
        _id: id,
        userId,
        title: roadmap.title,
        description: roadmap.description,
        category: roadmap.category,
        source: roadmap.source,
        sourceData,
        stages,
        overallProgress: roadmap.overallProgress,
        estimatedCompletionTime: roadmap.estimatedCompletionTime,
        createdAt,
        updatedAt,
        isActive: roadmap.isActive,
    };
}

/**
 * Generate a new roadmap
 */
export const generateRoadmap = async (req: Request, res: Response) => {
    let userId: string | undefined;
    let source: string | undefined;
    
    try {
        userId = (req as any).user?.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const reqSource = req.body.source;
        source = reqSource;

        if (!source || !["cv", "jd", "hybrid"].includes(source)) {
            return res.status(400).json({ error: "Invalid source. Must be: cv, jd, or hybrid" });
        }

        console.log(`🛣️ Generating roadmap for user ${userId}, source: ${source}`);

        const embeddingServiceUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8000';
        const generator = new RoadmapGenerator(embeddingServiceUrl);

        // Prepare input data
        const inputData: any = {};
        const cvSource = req.body.cvSource;
        const jdSource = req.body.jdSource;

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
        console.log(`⚙️ Starting roadmap generation...`);
        const roadmap = await generator.generateRoadmap(userId, source as "cv" | "jd" | "hybrid", inputData);
        console.log(`📋 Roadmap generated, saving to database...`);

        // Save to database
        const savedRoadmap = await roadmapService.createRoadmap(roadmap);

        console.log(`✅ Roadmap saved: ${savedRoadmap._id}`);

        // Serialize and send; use manual JSON.stringify so we catch serialization errors and always send JSON
        if (res.headersSent) return;
        try {
            const roadmapJson = roadmapToJSON(savedRoadmap);
            const payload = { success: true, roadmap: roadmapJson };
            const body = JSON.stringify(payload);
            res.setHeader("Content-Type", "application/json");
            res.status(200).end(body);
        } catch (sendErr: any) {
            console.error("Failed to serialize/send roadmap response:", sendErr?.message);
            if (!res.headersSent) {
                const idStr = savedRoadmap._id instanceof ObjectId ? savedRoadmap._id.toString() : String(savedRoadmap._id);
                res.setHeader("Content-Type", "application/json");
                res.status(200).end(
                    JSON.stringify({
                        success: true,
                        roadmap: { _id: idStr, message: "Roadmap saved; refresh the page to load it." },
                    })
                );
            }
        }

    } catch (error: any) {
        console.error("Roadmap generation error:", error);
        console.error("Error details:", {
            message: error?.message,
            stack: error?.stack,
            userId,
            source
        });

        // Provide more specific error messages; always return JSON so client gets a parseable body
        let errorMessage = "Failed to generate roadmap";
        try {
            errorMessage = typeof error?.message === "string" ? error.message : String(error) || errorMessage;
        } catch (_) {}
        let statusCode = 500;

        if (errorMessage.includes("Ollama service is not available")) {
            statusCode = 503;
            errorMessage = "Ollama AI service is not running. Please start Ollama (ollama serve) and ensure the model is available.";
        } else if (errorMessage.includes("No JSON found in LLM response")) {
            errorMessage = "AI model did not return valid roadmap data. Please check Ollama model configuration.";
        } else if (errorMessage.toLowerCase().includes("timeout")) {
            errorMessage = "Roadmap generation timed out. The AI model may be too slow. Try a faster model or increase timeout.";
        } else if (errorMessage.includes("CV not found") || errorMessage.includes("Job description not found")) {
            statusCode = 404;
        } else if (errorMessage.includes("Unauthorized") || errorMessage.includes("user not found")) {
            statusCode = 401;
        }

        try {
            const details = process.env.NODE_ENV === "development" && error?.stack ? String(error.stack) : undefined;
            res.status(statusCode).json({
                error: "Failed to generate roadmap",
                message: errorMessage,
                ...(details ? { details } : {}),
                userId: userId ?? undefined,
                source: source ?? undefined
            });
        } catch (sendErr: any) {
            console.error("Failed to send error response:", sendErr?.message);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to generate roadmap", message: errorMessage });
            }
        }
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
