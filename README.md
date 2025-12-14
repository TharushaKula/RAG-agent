# RAG Agent: Technical Implementation Guide

This document serves as a comprehensive technical manual for the RAG Agent. It explains not just *what* we built, but *how* and *why* each component was implemented, down to the code level.

---

## 🏗️ 1. Architecture Overview

The system follows a standard **Retrieval-Augmented Generation (RAG)** architecture:

1.  **Ingestion**: `User Input -> Text Splitter -> Embeddings Model -> Vector Database`
2.  **Retrieval**: `User Query -> Embeddings Model -> Vector Search (MongoDB) -> Top Matching Docs`
3.  **Generation**: `Context + Query -> LLM (Ollama) -> Streaming Response`

### Technology Decisions
-   **Next.js 15**: Chosen for its robust API routes (backend) and Server Components (frontend). We use the **App Router** structure.
-   **LangChain.js**: The glue code. It provides standard interfaces for switching between different LLMs and Vector Stores without rewriting logic.
-   **MongoDB Atlas**: We chose this over Pinecone or Chroma because it allows keeping **operational data and vectors in the same database**.
-   **Ollama**: Enables zero-cost, private, local inference.

---

## 💾 2. The Database Layer (`lib/mongodb.ts`)

### The Problem
Next.js in development mode uses "Hot Module Replacement" (HMR). Every time you save a file, it reloads the code. If we simply wrote `const client = new MongoClient()`, every reload would open a new connection to MongoDB. Eventually, this hits the connection limit, and the app crashes.

### The Solution: The Singleton Pattern
We implemented a caching mechanism in `lib/mongodb.ts`:

```typescript
// In Development:
if (process.env.NODE_ENV === "development") {
  // We attach the client promise to the global scope (globalThis)
  // This persists even when the module file is re-executed.
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
}
```
This ensures we reuse the *same* connection across the entire lifecycle of the dev server.

---

## 🧠 3. Vector Storage Logic (`lib/rag-store.ts`)

### Usage of `MongoDBAtlasVectorSearch`
This file acts as the bridge between LangChain and MongoDB.

**Key Configuration:**
-   **Model**: `nomic-embed-text`. We hardcoded this because the index dimensions (768) are tied to the model architecture. Changing the model requires rebuilding the DB index.
-   **Index Name**: `"default"`. This is crucial. MongoDB needs to know *which* index to use for the `$vectorSearch` aggregation stage.

**Code Deep Dive:**
```typescript
export async function getVectorStore() {
  const client = await clientPromise;
  const collection = client.db("rag-agent").collection("documents");

  return new MongoDBAtlasVectorSearch(embeddings, {
    collection: collection,
    indexName: "default", // MUST match Atlas
    textKey: "text",      // The field where the raw text is stored
    embeddingKey: "embedding", // The field where the vector array is stored
  });
}
```

---

## 📥 4. The Ingestion Pipeline (`app/api/ingest/route.ts`)

This API route converts raw text into searchable vectors.

### Step 1: Text Splitting
We don't feed an entire document to the database as one chunk. Why?
1.  **Context Window**: LLMs have a limit on how much text they can read.
2.  **Precision**: Semantic search works better on specific concepts than on a whole book.

We implemented `RecursiveCharacterTextSplitter`:
```typescript
const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, // Characters per chunk
    chunkOverlap: 200, // Overlap to preserve context between chunks
});
```
*Why Overlap?* If a sentence is cut in the middle, the overlap ensures the meaning isn't lost at the boundary.

### Step 2: Vectorization
When we call `vectorStore.addDocuments(docs)`, LangChain behaves as follows:
1.  Sends the text to Ollama (`nomic-embed-text`).
2.  Ollama returns a `[0.01, -0.23, ...]` vector array (768 floats).
3.  LangChain inserts a JSON document into MongoDB:
    ```json
    { "text": "...", "embedding": [ ... ], "source": "user-paste" }
    ```

---

## 💬 5. The Chat Logic (`app/api/chat/route.ts`)

This is the core RAG workflow.

### Step 1: Retrieval
The user asks: *"Is the watch waterproof?"*
1.  We convert this question into a vector.
2.  We perform a Cosine Similarity Search in MongoDB.
3.  We pull the **Top 3** most similar chunks.

### Step 2: Prompt Engineering
We dynamically construct a prompt using `ChatPromptTemplate`.
-   **System Message**: "You are a helpful assistant..."
-   **Context Injection**: We take the retrieved chunks and paste them into the `{context}` variable.
-   **User Message**: The actual question.

### Step 3: Response Streaming
We use `RunnableSequence` to chain the steps:
`Prompt -> LLM -> OutputParser`

Code logic:
```typescript
const stream = await chain.stream({ context, question });
// We create a custom ReadableStream to send this to the frontend.
// We also attach a custom header "X-Sources" containing the metadata
// of the 3 retrieved docs, so the UI can show citations.
```

---

## 🎨 6. Frontend Implementation (`chat-interface.tsx`)

### State Management
We handle a complex state:
-   `messages`: Array of chat objects `{ role, content, sources }`.
-   `isLoading`: Locking the input while generating.

### The "Double Word" Bug Fix
During implementation, we faced an issue where streaming tokens duplicated (e.g., "HelloHello").
-   **Cause**: `React.StrictMode` (in dev) invokes state setters twice to detect side effects. Our original code mutated the message object directly (`msg.content += chunk`).
-   **Fix**: Immutable state updates.
    ```typescript
    // We clone the object first
    const lastMsg = { ...newMsgs[index] };
    lastMsg.content += chunk;
    newMsgs[index] = lastMsg; // Then replace it
    ```

### Scroll Logic
We built a custom `scrollToBottom` function using `useRef`.
-   We had to update the Shadcn `ScrollArea` component to use `React.forwardRef`. This allows the parent `ChatInterface` to access the underlying DOM node and force it to scroll whenever `messages` change.

---

## 🔍 7. Debugging Tools

We created a custom script `verify-db.ts` to debug the "0 results" error.
-   It connects directly to MongoDB (bypassing the app).
-   It performs a raw `$vectorSearch` aggregation.
-   This helped us prove that the issue was the **Atlas Index Name** mismatch, not the code itself.
