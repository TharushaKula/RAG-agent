import { Request, Response } from "express";
import { EmbeddingService } from "../services/embeddingService";
import { SemanticMatcher } from "../services/semanticMatcher";
import pdf from "pdf-parse";
import clientPromise from "../config/db";

export const performSemanticMatch = async (req: Request, res: Response) => {
    try {
        const files = (req as any).files;
        const cvFile = files?.cv ? files.cv[0] : null;
        const jdFile = files?.jdFile ? files.jdFile[0] : null;
        const jdText = req.body.jdText;
        const jdTitle = req.body.jdTitle;

        if (!cvFile) {
            return res.status(400).json({ error: "CV file is required" });
        }

        if (!jdFile && !jdText) {
            return res.status(400).json({ error: "Job description (file or text) is required" });
        }

        const userId = (req as any).user.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("🔍 Starting semantic matching process...");

        // Extract text from CV
        let cvText = "";
        try {
            const cvBuffer = cvFile.buffer;
            const cvData = await pdf(cvBuffer);
            cvText = cvData.text;

            if (!cvText || cvText.trim().length === 0) {
                return res.status(400).json({
                    error: "Could not extract text from CV. Please ensure the PDF is text-selectable."
                });
            }
        } catch (err: any) {
            console.error("Error parsing CV PDF:", err);
            return res.status(500).json({ error: "Failed to parse CV PDF" });
        }

        // Extract text from JD
        let jdTextContent = "";
        let jdSource = "text-input";

        if (jdFile) {
            jdSource = jdFile.originalname;
            const buffer = jdFile.buffer;

            if (jdFile.mimetype === "application/pdf") {
                const data = await pdf(buffer);
                jdTextContent = data.text;
            } else {
                jdTextContent = buffer.toString("utf-8");
            }
        } else if (jdText) {
            jdTextContent = jdText;
            // Use provided title or generate a default one
            if (jdTitle && jdTitle.trim()) {
                jdSource = jdTitle.trim();
            } else {
                jdSource = `Job Description - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
            }
        }

        if (!jdTextContent || jdTextContent.trim().length === 0) {
            return res.status(400).json({ error: "Job description text is empty" });
        }

        // Initialize services
        const embeddingServiceUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8000';
        console.log(`🔧 Using embedding service URL: ${embeddingServiceUrl}`);
        const embeddingService = new EmbeddingService(embeddingServiceUrl);
        
        // Check if embedding service is available
        try {
            await embeddingService.healthCheck();
            console.log("✅ Embedding service is available");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("❌ Embedding service not available:", errorMessage);
            console.error("💡 Make sure to start the embedding service:");
            console.error("   cd embedding-service && docker-compose up");
            return res.status(503).json({
                error: "Embedding service is not available. Please ensure it is running.",
                details: errorMessage,
                help: "Start the embedding service with: cd embedding-service && docker-compose up"
            });
        }

        const matcher = new SemanticMatcher(embeddingService, 0.6);

        // Perform semantic matching
        const matchResult = await matcher.match(
            cvText,
            jdTextContent,
            userId,
            cvFile.originalname,
            jdSource
        );

        // Store match result in database
        const client = await clientPromise;
        const db = client.db("rag-agent");
        const matchResultsCollection = db.collection("match-results");

        await matchResultsCollection.insertOne(matchResult);

        console.log(`✅ Semantic matching complete. Match ID: ${matchResult.matchId}`);

        res.json({
            success: true,
            matchResult,
        });

    } catch (error: any) {
        console.error("Semantic Match Error:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error.message,
        });
    }
};

export const getMatchResult = async (req: Request, res: Response) => {
    try {
        const { matchId } = req.params;
        const userId = (req as any).user.userId;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const client = await clientPromise;
        const db = client.db("rag-agent");
        const matchResultsCollection = db.collection("match-results");

        const matchResult = await matchResultsCollection.findOne({
            matchId,
            userId,
        });

        if (!matchResult) {
            return res.status(404).json({ error: "Match result not found" });
        }

        res.json(matchResult);

    } catch (error: any) {
        console.error("Get Match Result Error:", error);
        res.status(500).json({ error: "Failed to fetch match result" });
    }
};

export const getUserMatchHistory = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const client = await clientPromise;
        const db = client.db("rag-agent");
        const matchResultsCollection = db.collection("match-results");

        const matchHistory = await matchResultsCollection
            .find({ userId })
            .sort({ timestamp: -1 })
            .limit(20)
            .toArray();

        res.json(matchHistory);

    } catch (error: any) {
        console.error("Get Match History Error:", error);
        res.status(500).json({ error: "Failed to fetch match history" });
    }
};
