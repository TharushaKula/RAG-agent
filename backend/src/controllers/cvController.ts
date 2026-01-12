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
