import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { OllamaEmbeddings } from "@langchain/ollama";
import clientPromise from "./mongodb";

const embeddings = new OllamaEmbeddings({
    model: "nomic-embed-text",
    baseUrl: "http://127.0.0.1:11434",
});

export async function getVectorStore() {
    const client = await clientPromise;
    const collection = client.db("rag-agent").collection("documents");

    return new MongoDBAtlasVectorSearch(embeddings, {
        collection: collection as any,
        indexName: "default",
        textKey: "text",
        embeddingKey: "embedding",
    });
}

// Helper to add documents (Unified interface for ingest route)
// Note: MongoDBAtlasVectorSearch.fromDocuments usually creates a new store, 
// but we can just add documents to the existing collection instance.
export async function addDocuments(documents: any[]) {
    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments(documents);
}
