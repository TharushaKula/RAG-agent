import { Request, Response } from "express";
import { EmbeddingService } from "../services/embeddingService";
import { SemanticMatcher } from "../services/semanticMatcher";
import { getVectorStore } from "../services/ragService";
import pdf from "pdf-parse";
import clientPromise from "../config/db";

export const performSemanticMatch = async (req: Request, res: Response) => {
    try {
        const files = (req as any).files;
        const cvFile = files?.cv ? files.cv[0] : null;
        const jdFile = files?.jdFile ? files.jdFile[0] : null;
        const jdText = req.body.jdText;
        const jdTitle = req.body.jdTitle;
        const cvSource = req.body.cvSource; // From database
        const jdSource = req.body.jdSource; // From database

        const userId = (req as any).user.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("🔍 Starting semantic matching process...");

        // Get CV text - from database or file
        let cvText = "";
        let cvSourceName = "";

        if (cvSource) {
            // Get CV from database
            try {
                const vectorStore = await getVectorStore();
                const collection = (vectorStore as any).collection;
                const documents = await collection.find({
                    $or: [
                        { "metadata.userId": userId, "metadata.source": cvSource, "metadata.type": "cv" },
                        { "userId": userId, "source": cvSource, "type": "cv" }
                    ]
                }).toArray();

                if (documents.length === 0) {
                    return res.status(404).json({ error: "CV not found in database" });
                }

                cvText = documents
                    .map((doc: any) => doc.text || doc.pageContent || "")
                    .filter((text: string) => text.trim().length > 0)
                    .join("\n\n");
                cvSourceName = cvSource;
                console.log(`📄 Retrieved CV from database: ${cvSource} (${documents.length} chunks)`);
            } catch (err: any) {
                console.error("Error retrieving CV from database:", err);
                return res.status(500).json({ error: "Failed to retrieve CV from database" });
            }
        } else if (cvFile) {
            // Extract text from uploaded CV file
            try {
                const cvBuffer = cvFile.buffer;
                const cvData = await pdf(cvBuffer);
                cvText = cvData.text;
                cvSourceName = cvFile.originalname;

                if (!cvText || cvText.trim().length === 0) {
                    return res.status(400).json({
                        error: "Could not extract text from CV. Please ensure the PDF is text-selectable."
                    });
                }
            } catch (err: any) {
                console.error("Error parsing CV PDF:", err);
                return res.status(500).json({ error: "Failed to parse CV PDF" });
            }
        } else {
            return res.status(400).json({ error: "CV is required (select from database or upload file)" });
        }

        // Get JD text - from database, file, or text input
        let jdTextContent = "";
        let jdSourceName = "text-input";

        if (jdSource) {
            // Get JD from database
            try {
                const vectorStore = await getVectorStore();
                const collection = (vectorStore as any).collection;
                const documents = await collection.find({
                    $or: [
                        { "metadata.userId": userId, "metadata.source": jdSource, "metadata.type": "jd" },
                        { "userId": userId, "source": jdSource, "type": "jd" }
                    ]
                }).toArray();

                if (documents.length === 0) {
                    return res.status(404).json({ error: "Job description not found in database" });
                }

                jdTextContent = documents
                    .map((doc: any) => doc.text || doc.pageContent || "")
                    .filter((text: string) => text.trim().length > 0)
                    .join("\n\n");
                jdSourceName = jdSource;
                console.log(`📄 Retrieved JD from database: ${jdSource} (${documents.length} chunks)`);
            } catch (err: any) {
                console.error("Error retrieving JD from database:", err);
                return res.status(500).json({ error: "Failed to retrieve Job Description from database" });
            }
        } else if (jdFile) {
            // Extract text from uploaded JD file
            jdSourceName = jdFile.originalname;
            const buffer = jdFile.buffer;

            if (jdFile.mimetype === "application/pdf") {
                const data = await pdf(buffer);
                jdTextContent = data.text;
            } else {
                jdTextContent = buffer.toString("utf-8");
            }
        } else if (jdText) {
            // Use provided text
            jdTextContent = jdText;
            // Use provided title or generate a default one
            if (jdTitle && jdTitle.trim()) {
                jdSourceName = jdTitle.trim();
            } else {
                jdSourceName = `Job Description - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
            }
        } else {
            return res.status(400).json({ error: "Job description is required (select from database, upload file, or enter text)" });
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

        // Lower threshold to 0.5 to be more inclusive, but still use best similarity for scoring
        const matcher = new SemanticMatcher(embeddingService, 0.5);

        // Perform semantic matching
        const matchResult = await matcher.match(
            cvText,
            jdTextContent,
            userId,
            cvSourceName,
            jdSourceName
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
