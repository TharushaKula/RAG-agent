import { Request, Response } from "express";
import { getVectorStore } from "../services/ragService";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import pdf from "pdf-parse";
import clientPromise from "../config/db";

export const uploadCVAndJD = async (req: Request, res: Response) => {
    try {
        const files = (req as any).files;
        const cvFile = files?.cv ? files.cv[0] : null;
        const jdFile = files?.jdFile ? files.jdFile[0] : null;
        const jdText = req.body.jdText;
        const jdTitle = req.body.jdTitle;

        if (!cvFile) {
            return res.status(400).json({ error: "CV file is required" });
        }

        const userId = (req as any).user.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const vectorStore = await getVectorStore();
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        let cvText = "";
        try {
            const cvBuffer = cvFile.buffer;
            const cvData = await pdf(cvBuffer);
            cvText = cvData.text;
            if (!cvText || cvText.trim().length === 0) {
                console.warn(`Extracted text is empty for ${cvFile.originalname}`);
                return res.status(400).json({
                    error: "Could not extract text from CV. Please ensure the PDF is text-selectable and not a scanned image."
                });
            }
        } catch (err: any) {
            console.error("Error parsing CV PDF:", err);
            return res.status(500).json({ error: "Failed to parse CV PDF" });
        }

        const cvDocs = await splitter.createDocuments([cvText], [{
            source: cvFile.originalname,
            type: "cv",
            userId: userId,
            uploadDate: new Date().toISOString()
        }]);


        let jdDocs: Document[] = [];
        let jdSource = "text-input";

        if (jdFile) {
            jdSource = jdFile.originalname;
            let extractedJdText = "";
            const buffer = jdFile.buffer;

            if (jdFile.mimetype === "application/pdf") {
                const data = await pdf(buffer);
                extractedJdText = data.text;
            } else {
                extractedJdText = buffer.toString("utf-8");
            }

            jdDocs = await splitter.createDocuments([extractedJdText], [{
                source: jdSource,
                type: "jd",
                userId: userId,
                uploadDate: new Date().toISOString()
            }]);

        } else if (jdText && jdText.trim()) {
            if (jdTitle && jdTitle.trim()) {
                jdSource = jdTitle.trim();
            } else {
                jdSource = `Job Description - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
            }
            jdDocs = await splitter.createDocuments([jdText], [{
                source: jdSource,
                type: "jd",
                userId: userId,
                uploadDate: new Date().toISOString()
            }]);
        }

        const allDocs = [...cvDocs, ...jdDocs];
        if (allDocs.length > 0) {
            await vectorStore.addDocuments(allDocs);
        }

        res.json({
            success: true,
            message: "CV and JD processed successfully",
            cvChunks: cvDocs.length,
            jdChunks: jdDocs.length,
            jdSource: jdSource
        });

    } catch (error: any) {
        console.error("CV Upload Error:", error);
        res.status(500).json({ error: "Internal server error: " + error.message });
    }
};

export const getUserFiles = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const client = await clientPromise;
        const collection = client.db("rag-agent").collection("documents");


        const userIdStr = String(userId);

        const allDocs = await collection.find({
            $or: [
                { "metadata.userId": userIdStr },
                { "userId": userIdStr }
            ]
        }).toArray();
        
        const files: Record<string, string[]> = {
            cv: [],
            jd: []
        };
        
        const seen: Record<string, Set<string>> = { cv: new Set(), jd: new Set() };
        
        for (const doc of allDocs) {
            const type = doc.metadata?.type || doc.type;
            const source = doc.metadata?.source || doc.source;
            
            if ((type === "cv" || type === "jd") && source && !seen[type].has(source)) {
                seen[type].add(source);
                files[type].push(source);
            }
        }
        
        res.json(files);

    } catch (error: any) {
        console.error("Get User Files Error:", error);
        res.status(500).json({ 
            error: "Failed to fetch user files",
            message: error.message,
            details: process.env.NODE_ENV === "development" ? error.stack : undefined
        });
    }
};

export const getFileText = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { source, type } = req.query;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (!source || !type) {
            return res.status(400).json({ error: "Source and type are required" });
        }

        if (type !== "cv" && type !== "jd") {
            return res.status(400).json({ error: "Type must be 'cv' or 'jd'" });
        }

        const client = await clientPromise;
        const collection = client.db("rag-agent").collection("documents");

        // Find all documents with matching source and type
        const userIdStr = String(userId);
        const documents = await collection.find({
            $or: [
                { "metadata.userId": userIdStr, "metadata.source": source, "metadata.type": type },
                { "userId": userIdStr, "source": source, "type": type }
            ]
        }).toArray();

        if (documents.length === 0) {
            return res.status(404).json({ error: "File not found" });
        }

        // Combine all text chunks
        const text = documents
            .map((doc: any) => doc.text || doc.pageContent || "")
            .filter((text: string) => text.trim().length > 0)
            .join("\n\n");

        if (!text || text.trim().length === 0) {
            return res.status(404).json({ error: "No text content found in file" });
        }

        res.json({
            source,
            type,
            text,
            chunks: documents.length
        });

    } catch (error: any) {
        console.error("Get File Text Error:", error);
        res.status(500).json({ error: "Failed to fetch file text: " + error.message });
    }
};
