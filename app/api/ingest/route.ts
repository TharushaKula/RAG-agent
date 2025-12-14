import { NextRequest, NextResponse } from "next/server";
import { getVectorStore } from "@/lib/rag-store";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get("content-type") || "";

        let text = "";
        let source = "user-upload";

        if (contentType.includes("application/json")) {
            const body = await req.json();
            text = body.text;
            source = body.source || "user-paste";
        } else if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File;

            if (!file) {
                return NextResponse.json({ error: "No file provided" }, { status: 400 });
            }

            source = file.name;
            const buffer = Buffer.from(await file.arrayBuffer());

            if (file.type === "application/pdf") {
                const pdf = await import("pdf-parse/lib/pdf-parse.js");
                const data = await pdf.default(buffer);
                text = data.text;
            } else {
                // Assume text/plain or markdown
                text = buffer.toString("utf-8");
            }
        } else {
            return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
        }

        if (!text) {
            return NextResponse.json({ error: "No text extracted" }, { status: 400 });
        }

        const vectorStore = await getVectorStore();

        // Split text into chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const docs = await splitter.createDocuments([text], [{ source }]);

        // Add to vector store
        await vectorStore.addDocuments(docs);

        return NextResponse.json({ success: true, chunks: docs.length });
    } catch (error: any) {
        console.error("Ingestion error:", error);
        return NextResponse.json({ error: "Failed to ingest data: " + error.message }, { status: 500 });
    }
}
