import { NextRequest, NextResponse } from "next/server";
import { getVectorStore } from "@/lib/rag-store";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { text, source } = body;

        if (!text) {
            return NextResponse.json({ error: "No text provided" }, { status: 400 });
        }

        const vectorStore = await getVectorStore();

        // Split text into chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const docs = await splitter.createDocuments([text], [{ source: source || "user-input" }]);

        // Add to vector store
        await vectorStore.addDocuments(docs);

        return NextResponse.json({ success: true, chunks: docs.length });
    } catch (error) {
        console.error("Ingestion error:", error);
        return NextResponse.json({ error: "Failed to ingest data" }, { status: 500 });
    }
}
