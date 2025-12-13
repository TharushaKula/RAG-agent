import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { OllamaEmbeddings } from "@langchain/ollama";

// Initialize embeddings using Ollama
const embeddings = new OllamaEmbeddings({
    model: "nomic-embed-text",
    baseUrl: "http://127.0.0.1:11434",
});

// Use a global variable to maintain the store in-memory across hot reloads in dev
declare global {
    var vectorStore: HNSWLib | undefined;
}

export const getVectorStore = async () => {
    if (!global.vectorStore) {
        // Initialize with a dummy document to set up the index structure
        // HNSWLib requires at least one document to initialize dimensions in some versions,
        // or we can use the constructor if we know dimensions? 
        // Safest is fromTexts.
        global.vectorStore = await HNSWLib.fromTexts(
            ["RAG Agent Initialized"],
            [{ source: "system" }],
            embeddings
        );
    }
    return global.vectorStore!;
};

// Helper to reset
export const clearVectorStore = async () => {
    global.vectorStore = await HNSWLib.fromTexts(
        ["RAG Agent Initialized"],
        [{ source: "system" }],
        embeddings
    );
};
