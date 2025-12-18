import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { OllamaEmbeddings } from "@langchain/ollama";
import clientPromise from "../config/db";

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

export async function addDocuments(documents: any[]) {
    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments(documents);
}

export async function getRetrieverForUser(userId: string) {
    const vectorStore = await getVectorStore();
    return vectorStore.asRetriever({
        filter: {
            preFilter: {
                userId: {
                    $eq: userId
                }
            }
        }
    });
}
