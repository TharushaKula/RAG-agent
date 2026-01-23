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

        // Process CV
        let cvText = "";
        try {
            const cvBuffer = cvFile.buffer;
            const cvData = await pdf(cvBuffer);
            cvText = cvData.text;
            console.log(`📄 extracted text length: ${cvText.length}`);

            if (!cvText || cvText.trim().length === 0) {
                console.warn(`⚠️ Warning: Extracted text is empty for ${cvFile.originalname}`);
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

        console.log(`📝 Preparing to save CV: ${cvFile.originalname} for User: ${userId}`);
        console.log(`📄 Generated ${cvDocs.length} chunks for CV.`);

        // Process JD
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
                // Assume text/plain or similar for now. 
                // For DOCX we would need mammoth or similar, but simplified for now as per plan
                extractedJdText = buffer.toString("utf-8");
            }

            jdDocs = await splitter.createDocuments([extractedJdText], [{
                source: jdSource,
                type: "jd",
                userId: userId,
                uploadDate: new Date().toISOString()
            }]);

        } else if (jdText && jdText.trim()) {
            // Use provided title or generate a default one
            if (jdTitle && jdTitle.trim()) {
                jdSource = jdTitle.trim();
            } else {
                // Generate a default name with timestamp if no title provided
                jdSource = `Job Description - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
            }
            jdDocs = await splitter.createDocuments([jdText], [{
                source: jdSource,
                type: "jd",
                userId: userId,
                uploadDate: new Date().toISOString()
            }]);
            console.log(`📝 Created JD from text input with source: ${jdSource}`);
        }

        // Add to Vector Store
        const allDocs = [...cvDocs, ...jdDocs];
        if (allDocs.length > 0) {
            await vectorStore.addDocuments(allDocs);
            console.log(`✅ Successfully added ${allDocs.length} documents to Vector Store.`);
            console.log(`📄 CV chunks: ${cvDocs.length}, JD chunks: ${jdDocs.length}`);
            
            // Log metadata for debugging
            if (cvDocs.length > 0) {
                console.log(`📝 CV metadata sample:`, JSON.stringify(cvDocs[0].metadata, null, 2));
            }
            if (jdDocs.length > 0) {
                console.log(`📝 JD metadata sample:`, JSON.stringify(jdDocs[0].metadata, null, 2));
                console.log(`📝 JD source: ${jdSource}`);
            }
        }

        res.json({
            success: true,
            message: "CV and JD processed successfully",
            cvChunks: cvDocs.length,
            jdChunks: jdDocs.length,
            jdSource: jdSource  // Return the JD source so frontend knows what was saved
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

        // Access the MongoDB collection directly
        const client = await clientPromise;
        const collection = client.db("rag-agent").collection("documents");

        console.log(`🔍 Fetching files for user: ${userId}`);

        // Convert userId to string for comparison
        const userIdStr = String(userId);
        
        // Use a simpler, more reliable query approach
        const allDocs = await collection.find({
            $or: [
                { "metadata.userId": userIdStr },
                { "userId": userIdStr }
            ]
        }).toArray();
        
        console.log(`📋 Found ${allDocs.length} documents for user`);
        
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
        
        console.log(`✅ Returning files - CV: ${files.cv.length}, JD: ${files.jd.length}`);
        console.log(`📄 CV files:`, files.cv);
        console.log(`📄 JD files:`, files.jd);
        
        res.json(files);

    } catch (error: any) {
        console.error("❌ Get User Files Error:", error);
        console.error("Error stack:", error.stack);
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

        // Access the MongoDB collection directly
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
