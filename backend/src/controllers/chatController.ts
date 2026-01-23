import { Request, Response } from "express";
import { ChatOllama } from "@langchain/ollama";
import { getRetrieverForUser } from "../services/ragService";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";

export const chat = async (req: Request, res: Response) => {
    try {
        if (!(req as any).user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const userId = (req as any).user.userId;

        const { messages, activeSources } = req.body;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).send("No messages provided");
        }

        const lastMessage = messages[messages.length - 1];
        const question = lastMessage.content;

        // 1. Retrieve context
        console.log(`🔎 Chat Request: User ${userId}, Sources:`, activeSources);
        const retriever = await getRetrieverForUser(userId, activeSources);
        const contextDocs = await retriever.invoke(question);

        console.log(`🔍 Retrieved ${contextDocs.length} documents for query: "${question}"`);
        if (contextDocs.length > 0) {
            console.log("📄 Top Doc Source:", contextDocs[0].metadata.source);
        } else {
            console.warn("⚠️ No documents retrieved!");
        }
        if (contextDocs.length > 0) {
            console.log("📄 First doc source:", contextDocs[0].metadata.source);
            console.log("📄 First doc preview:", contextDocs[0].pageContent.slice(0, 100));
        }

        // Combine docs for the LLM prompt
        const context = contextDocs.map((doc: any) => {
            const sourceType = doc.metadata.type ? `[${doc.metadata.type.toUpperCase()}]` : "[DOCUMENT]";
            const sourceName = doc.metadata.source ? `(Source: ${doc.metadata.source})` : "";
            return `${sourceType} ${sourceName}\n${doc.pageContent}`;
        }).join("\n\n---\n\n");

        // --- FIX: SAFE SOURCE HEADER ---
        const validSources = contextDocs.map((doc: any) => ({
            source: doc.metadata.source,
        }));

        // Encode safe JSON to Base64
        const encodedSources = Buffer.from(JSON.stringify(validSources)).toString("base64");

        // 2. Setup LLM (Force Local Ollama)
        const llm = new ChatOllama({
            model: "gpt-oss:20b-cloud",
            baseUrl: "http://127.0.0.1:11434", // Localhost IP
            temperature: 0.7,
        });

        // 3. Prompt
        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                `You are a helpful AI career assistant. You are provided with context documents that may include a User's CV and a Job Description (JD).
        
        The context format is:
        [CV] ... content ...
        [JD] ... content ...
        
        Instructions:
        1. If the user asks about skill gaps or improvements, compare the skills found in the [CV] sections against the requirements in the [JD] sections.
        2. Identify missing skills or areas where the user's experience (CV) doesn't fully meet the job requirements (JD).
        3. Be encouraging but specific.
        4. If the answer is not in the context, say so.
        
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
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("X-Sources", encodedSources);

        for await (const chunk of stream) {
            res.write(chunk);
        }
        res.end();

    } catch (error: any) {
        console.error("Chat error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.end();
        }
    }
}
