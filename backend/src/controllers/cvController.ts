import { Request, Response } from "express";
import { getVectorStore } from "../services/ragService";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import pdf from "pdf-parse";

export const uploadCVAndJD = async (req: Request, res: Response) => {
    try {
        const files = (req as any).files;
        const cvFile = files?.cv ? files.cv[0] : null;
        const jdFile = files?.jdFile ? files.jdFile[0] : null;
        const jdText = req.body.jdText;

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

        } else if (jdText) {
            jdDocs = await splitter.createDocuments([jdText], [{
                source: "user-input-jd",
                type: "jd",
                userId: userId,
                uploadDate: new Date().toISOString()
            }]);
        }

        // Add to Vector Store
        const allDocs = [...cvDocs, ...jdDocs];
        if (allDocs.length > 0) {
            await vectorStore.addDocuments(allDocs);
            console.log(`✅ Successfully added ${allDocs.length} documents to Vector Store.`);
        }

        res.json({
            success: true,
            message: "CV and JD processed successfully",
            cvChunks: cvDocs.length,
            jdChunks: jdDocs.length
        });

    } catch (error: any) {
        console.error("CV Upload Error:", error);
        res.status(500).json({ error: "Internal server error: " + error.message });
    }
};

export const getUserFiles = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const vectorStore = await getVectorStore();

        // MongoDB aggregation to get unique sources by type
        // Note: vectorStore.collection is typed as any in ragService, but it's a generic Collection.
        // We need to cast it or access the underlying collection.
        // LangChain's MongoDBAtlasVectorSearch exposes `collection`.

        const collection = (vectorStore as any).collection;

        const pipeline = [
            {
                $match: {
                    $or: [
                        { "metadata.userId": userId },
                        { "userId": userId }
                    ]
                }
            },
            {
                $project: {
                    type: { $ifNull: ["$metadata.type", "$type"] },
                    source: { $ifNull: ["$metadata.source", "$source"] }
                }
            },
            {
                $group: {
                    _id: {
                        type: "$type",
                        source: "$source"
                    }
                }
            },
            {
                $group: {
                    _id: "$_id.type",
                    files: { $push: "$_id.source" }
                }
            }
        ];

        const results = await collection.aggregate(pipeline).toArray();

        const files: Record<string, string[]> = {
            cv: [],
            jd: []
        };

        results.forEach((group: any) => {
            if (group._id === "cv") files.cv = group.files;
            if (group._id === "jd") files.jd = group.files;
        });

        res.json(files);

    } catch (error: any) {
        console.error("Get User Files Error:", error);
        res.status(500).json({ error: "Failed to fetch user files" });
    }
};
