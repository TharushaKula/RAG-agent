import { NextRequest } from "next/server";
import { ChatOllama } from "@langchain/ollama";
import { getVectorStore } from "@/lib/rag-store";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    const question = lastMessage.content;

    // 1. Retrieve context
    const vectorStore = await getVectorStore();
    const retriever = vectorStore.asRetriever(3); // Top 3 results
    const contextDocs = await retriever.invoke(question);

    // Combine docs for the LLM prompt
    const context = contextDocs.map((doc:any) => doc.pageContent).join("\n\n");

    // --- FIX: SAFE SOURCE HEADER ---
    // Only map metadata. LIMIT the size to prevent 431 Header Errors.
    const validSources = contextDocs.map((doc:any) => ({
      source: doc.metadata.source,
      // snippet: doc.pageContent.slice(0, 50) + "..." // Optional: tiny snippet only
    }));

    // Encode safe JSON to Base64
    const encodedSources = Buffer.from(JSON.stringify(validSources)).toString("base64");

    // 2. Setup LLM (Force Local Ollama)
    const llm = new ChatOllama({
      model: "gemini-3-pro-preview:latest",
      baseUrl: "http://127.0.0.1:11434", // Localhost IP
      temperature: 0.7,
    });

    // 3. Prompt
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are a helpful assistant. Use the following context to answer the user's question. 
        If the answer is not in the context, say so.
        
        Context:
        {context}`,
      ],
      ["user", "{question}"],
    ]);

    const chain = RunnableSequence.from([
        prompt, 
        llm, 
        new StringOutputParser()
    ]);

    const stream = await chain.stream({
      context: context,
      question: question,
    });

    // 4. Return stream with Sources in Header
    const encoder = new TextEncoder();
    
    const customStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(customStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Sources": encodedSources, // Safe, lightweight header
      },
    });

  } catch (error: any) {
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json" } 
    });
  }
}