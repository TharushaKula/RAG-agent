"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { ProfileMenu } from "./profile-menu";
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
    const { token, logout } = useAuth();
    const [sources, setSources] = useState<Source[]>([]);
    const [isSourcesOpen, setIsSourcesOpen] = useState(false);

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
            const res = await fetch("http://localhost:8000/api/ingest/text", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ text: ingestText, source: "user-paste" }),
            });

            if (res.status === 401) { logout(); return; }
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
            const res = await fetch("http://localhost:8000/api/ingest/file", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                // Note: Do NOT set Content-Type header for FormData, browser sets it with boundary
                body: formData,
            });

            if (res.status === 401) { // Handle 401 Unauthorized
                logout();
                toast.error("Session expired. Please log in again.");
                return;
            }

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

        const userMessage: Message = { role: "user", content: input };
        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const response = await fetch("http://localhost:8000/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                }),
            });

            if (response.status === 401) { logout(); return; }

            if (!response.ok) throw new Error("Network response was not ok");
            if (!response.body) throw new Error("No response body");

            // Handle Sources Header
            const sourcesHeader = response.headers.get("X-Sources");
            let assistantSources: Source[] = [];
            if (sourcesHeader) {
                try {
                    const decoded = atob(sourcesHeader);
                    const parsedSources = JSON.parse(decoded);
                    if (parsedSources && parsedSources.length > 0) {
                        assistantSources = parsedSources;
                        setSources(parsedSources);
                        setIsSourcesOpen(true);
                    }
                } catch (e) {
                    console.error("Failed to parse sources header", e);
                }
            }

            // Initialize assistant message with sources
            setMessages((prev) => [...prev, { role: "assistant", content: "", sources: assistantSources }]);

            const reader = response.body.getReader();
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

    const [activeTab, setActiveTab] = useState<"text" | "file" | "github">("file");

    return (
        <div className="flex bg-background w-full h-screen p-4 gap-4 font-sans">
            {/* Sidebar / Ingestion Area */}
            <Card className="w-1/3 flex flex-col h-full border-none shadow-xl bg-gradient-to-br from-card/50 to-background/50 backdrop-blur-md overflow-hidden">
                <CardHeader className="bg-primary/5 border-b pb-6">
                    <CardTitle className="text-xl flex items-center gap-2 font-bold tracking-tight mt-5">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Database className="w-5 h-5 text-primary" />
                        </div>
                        Knowledge Base
                    </CardTitle>
                    <CardDescription className="text-muted-foreground/80">
                        Feed your agent with custom knowledge.
                    </CardDescription>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col gap-6 pt-6">
                    {/* Tabs */}
                    <div className="grid grid-cols-3 p-1 bg-muted/50 rounded-lg">
                        <button
                            onClick={() => setActiveTab("file")}
                            className={`flex items-center justify-center gap-2 px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ${activeTab === "file"
                                ? "bg-background text-foreground shadow-sm ring-1 ring-black/5"
                                : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                                }`}
                        >
                            <Paperclip className="w-4 h-4" />
                            File
                        </button>
                        <button
                            onClick={() => setActiveTab("text")}
                            className={`flex items-center justify-center gap-2 px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ${activeTab === "text"
                                ? "bg-background text-foreground shadow-sm ring-1 ring-black/5"
                                : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                                }`}
                        >
                            <PlusCircle className="w-4 h-4" />
                            Text
                        </button>
                        <button
                            onClick={() => setActiveTab("github")}
                            className={`flex items-center justify-center gap-2 px-2 py-2 text-sm font-medium rounded-md transition-all duration-200 ${activeTab === "github"
                                ? "bg-background text-foreground shadow-sm ring-1 ring-black/5"
                                : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
                                }`}
                        >
                            <code className="text-xs">&lt;/&gt;</code>
                            GitHub
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col">
                        {activeTab === "text" && (
                            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-2 duration-300">
                                <label className="text-sm font-semibold text-foreground/80">Content</label>
                                <textarea
                                    className="flex-1 min-h-[300px] w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="Paste technical documentation, notes, or articles here..."
                                    value={ingestText}
                                    onChange={(e) => setIngestText(e.target.value)}
                                />
                                <Button
                                    onClick={handleIngest}
                                    disabled={isIngesting || !ingestText.trim()}
                                    className="w-full h-12 bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 rounded-xl font-medium"
                                >
                                    {isIngesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                                    AddTo Vector Store
                                </Button>
                            </div>
                        )}

                        {activeTab === "file" && (
                            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-2 duration-300 h-full">
                                <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl flex-1 flex flex-col items-center justify-center gap-4 bg-muted/5 hover:bg-muted/10 hover:border-primary/50 transition-colors group cursor-pointer relative"
                                    onClick={() => document.getElementById('file-upload')?.click()}>

                                    <input
                                        type="file"
                                        id="file-upload"
                                        className="hidden"
                                        accept=".pdf,.txt,.md"
                                        onChange={handleFileUpload}
                                        disabled={isIngesting}
                                    />

                                    <div className="p-4 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                                        <Paperclip className="w-8 h-8" />
                                    </div>
                                    <div className="text-center px-4">
                                        <p className="text-sm font-semibold text-foreground">Click to upload documents</p>
                                        <p className="text-xs text-muted-foreground mt-1">PDF, TXT, MD (Max 10MB)</p>
                                    </div>
                                    {isIngesting && (
                                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded-xl">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                                <span className="text-sm font-medium">Processing...</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-600 text-xs">
                                    <strong>Note:</strong> Files are parsed securely on the server.
                                </div>
                            </div>
                        )}

                        {activeTab === "github" && (
                            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <label className="text-sm font-semibold text-foreground/80">Repository URL</label>
                                <div className="flex-1 flex flex-col justify-center gap-4">
                                    <input
                                        className="w-full rounded-xl border border-input bg-background/50 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        placeholder="https://github.com/username/repo OR https://github.com/username"
                                        value={ingestText}
                                        onChange={(e) => setIngestText(e.target.value)}
                                        disabled={isIngesting}
                                    />
                                    <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20">
                                        <h4 className="text-xs font-semibold text-blue-600 mb-2">Capabilities</h4>
                                        <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                                            <li>Clones public repositories</li>
                                            <li>Extracts code & text files</li>
                                            <li>User Profiles (Commits/Streaks)</li>
                                            <li>Recursive search</li>
                                        </ul>
                                    </div>

                                    <Button
                                        onClick={handleIngest}
                                        disabled={isIngesting || !ingestText.startsWith("https://github.com/")}
                                        className="w-full h-12 bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 rounded-xl font-medium mt-auto"
                                    >
                                        {isIngesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                                        Import Repository
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-auto pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span>Connected to <strong>MongoDB Atlas</strong></span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Main Chat Area */}
            <Card className="flex-1 flex flex-col h-full border-none shadow-2xl overflow-hidden bg-background">
                {/* Header */}
                <div className="border-b p-4 flex items-center justify-between bg-background/95 backdrop-blur z-10 sticky top-0">
                    <div>
                        <h2 className="text-lg font-bold">RAG Agent</h2>
                        <p className="text-xs text-muted-foreground">Ask questions to your documents</p>
                    </div>
                    <ProfileMenu />
                </div>

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
