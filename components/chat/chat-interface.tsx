"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { Send, PlusCircle, Database, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

interface Source {
    source: string;
    content: string;
}

interface Message {
    role: "user" | "assistant";
    content: string;
    sources?: Source[];
}

export function ChatInterface() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Ingestion state
    const [ingestText, setIngestText] = useState("");
    const [isIngesting, setIsIngesting] = useState(false);

    const scrollViewport = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (scrollViewport.current) {
            const scrollArea = scrollViewport.current.querySelector('[data-slot="scroll-area-viewport"]');
            if (scrollArea) {
                scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
            }
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleIngest = async () => {
        if (!ingestText.trim()) return;
        setIsIngesting(true);
        try {
            const res = await fetch("/api/ingest", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: ingestText, source: "user-paste" }),
            });

            if (!res.ok) throw new Error("Ingestion failed");

            const data = await res.json();
            toast.success(`Ingested ${data.chunks} chunks successfully.`);
            setIngestText("");
        } catch (err: any) {
            toast.error(err.message || "Failed to ingest text");
        } finally {
            setIsIngesting(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsIngesting(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/ingest", {
                method: "POST",
                // Note: Do NOT set Content-Type header for FormData, browser sets it with boundary
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Ingestion failed");

            toast.success(`Ingested ${file.name} (${data.chunks} chunks).`);
            e.target.value = ""; // Reset input
        } catch (err: any) {
            toast.error(err.message || "Failed to upload file");
        } finally {
            setIsIngesting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg: Message = { role: "user", content: input };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: [...messages, userMsg] }),
            });

            if (!res.ok) throw new Error(res.statusText);

            // Extract sources
            const validSourcesHeader = res.headers.get("x-sources");
            let sources: Source[] = [];
            if (validSourcesHeader) {
                try {
                    sources = JSON.parse(atob(validSourcesHeader));
                } catch (e) {
                    console.error("Failed to parse sources header", e);
                }
            }

            // Initialize assistant message
            setMessages((prev) => [...prev, { role: "assistant", content: "", sources }]);

            if (!res.body) return;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let done = false;

            while (!done) {
                const { value, done: DONE } = await reader.read();
                done = DONE;
                if (value) {
                    const chunk = decoder.decode(value, { stream: true });
                    setMessages((prev) => {
                        const newMsgs = [...prev];
                        const lastMsgIndex = newMsgs.length - 1;
                        const lastMsg = { ...newMsgs[lastMsgIndex] };
                        if (lastMsg.role === "assistant") {
                            lastMsg.content += chunk;
                            newMsgs[lastMsgIndex] = lastMsg;
                        }
                        return newMsgs;
                    });
                }
            }
        } catch (err: any) {
            toast.error("Failed to send message: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex bg-background w-full h-screen p-4 gap-4">
            {/* Sidebar / Ingestion Area */}
            <Card className="w-1/3 flex flex-col h-full border-muted">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        RAG Knowledge Base
                    </CardTitle>
                    <CardDescription>
                        Add text or files to the local vector store.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-4">
                    {/* Manual Text Entry */}
                    <div className="flex flex-col gap-2 flex-grow">
                        <label className="text-sm font-medium">Paste Text</label>
                        <textarea
                            className="flex min-h-[150px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Paste text... (e.g. documentation, articles)"
                            value={ingestText}
                            onChange={(e) => setIngestText(e.target.value)}
                        />
                        <Button onClick={handleIngest} disabled={isIngesting || !ingestText.trim()} className="w-full" variant="secondary">
                            {isIngesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                            Ingest Text
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="h-px bg-border flex-1" />
                        <span className="text-xs uppercase">OR</span>
                        <div className="h-px bg-border flex-1" />
                    </div>

                    {/* File Upload */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium">Upload File (PDF/Text)</label>
                        <input
                            type="file"
                            id="file-upload"
                            className="hidden"
                            accept=".pdf,.txt,.md"
                            onChange={handleFileUpload}
                            disabled={isIngesting}
                        />
                        <Button
                            onClick={() => document.getElementById('file-upload')?.click()}
                            disabled={isIngesting}
                            className="w-full"
                        >
                            {isIngesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
                            Upload Document
                        </Button>
                    </div>

                    <div className="mt-auto text-xs text-muted-foreground p-2 border rounded bg-muted/20">
                        <p><strong>Note:</strong> Supported files: PDF, TXT, MD. Content is stored in MongoDB Atlas.</p>
                    </div>
                </CardContent>
            </Card>

            {/* Main Chat Area */}
            <Card className="flex-1 flex flex-col h-full border-muted shadow-lg overflow-hidden">
                <ScrollArea className="flex-1 min-h-0" ref={scrollViewport}>
                    <div className="p-4">
                        <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full pb-4">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-[50vh] text-center text-muted-foreground opacity-50">
                                    <Database className="w-12 h-12 mb-4" />
                                    <p className="text-lg font-medium">Ready to chat with your data</p>
                                    <p className="text-sm">Ingest some text on the left, then ask questions about it.</p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <MessageBubble key={i} {...msg} />
                            ))}
                        </div>
                    </div>
                </ScrollArea>

                <div className="p-4 border-t bg-background/50 backdrop-blur-sm">
                    <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto w-full">
                        <Input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Ask a question..."
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <Button type="submit" disabled={isLoading || !input.trim()}>
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                    </form>
                </div>
            </Card>
        </div>
    );
}
