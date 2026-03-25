import { CallbackHandler } from "langfuse-langchain";

/**
 * Create a Langfuse callback handler for LangChain tracing.
 * Returns undefined when Langfuse env vars are not set (graceful no-op).
 */
export function createLangfuseHandler(opts: {
    sessionId?: string;
    userId?: string;
    traceName: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
}): CallbackHandler | undefined {
    if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
        return undefined;
    }

    return new CallbackHandler({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
        sessionId: opts.sessionId,
        userId: opts.userId,
        tags: opts.tags || [],
        metadata: { traceName: opts.traceName, ...opts.metadata },
    });
}
