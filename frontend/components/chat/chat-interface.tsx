"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { Send, PlusCircle, Database, Loader2, Paperclip, LogOut, User as UserIcon, Bot, Github } from "lucide-react";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    SidebarProvider,
    SidebarTrigger,
    SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";


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
    const { user, token, logout, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Ingestion state
    const [ingestText, setIngestText] = useState("");
    const [isIngesting, setIsIngesting] = useState(false);

    const scrollViewport = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push("/login");
            } else if (!user.onboardingCompleted) {
                router.push("/onboarding");
            }
        }
    }, [user, authLoading, router]);

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
        if (!ingestText.trim() || !token) return;
        setIsIngesting(true);
        try {
            const res = await fetch("/api/ingest", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
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
        if (!file || !token) return;

        setIsIngesting(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/api/ingest", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
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
        if (!input.trim() || isLoading || !token) return;

        const userMsg: Message = { role: "user", content: input };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
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

    const [activeTab, setActiveTab] = useState<"text" | "file" | "github">("file");
    const [activeView, setActiveView] = useState<"chat" | "knowledge">("chat");

    if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!user) return null; // Redirect handled in useEffect

    return (
        <SidebarProvider>
            <AppSidebar
                activeView={activeView}
                setActiveView={setActiveView}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                ingestText={ingestText}
                setIngestText={setIngestText}
                isIngesting={isIngesting}
                handleIngest={handleIngest}
                handleFileUpload={handleFileUpload}
            />
            <SidebarInset className="flex flex-col min-h-0 overflow-hidden">
                {/* Dashboard Header */}
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 bg-background/50 backdrop-blur-md sticky top-0 z-50">
                    <div className="flex items-center gap-2 px-4 flex-1">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="#">
                                        RAG Agent Dashboard
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <BreadcrumbPage className="font-bold tracking-tight uppercase text-xs">
                                        {activeView === "chat" ? "AI Chat Workspace" : "Knowledge Repository"}
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>

                    <div className="flex items-center gap-4 px-4">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-9 w-9 rounded-full ring-2 ring-primary/10 ring-offset-2">
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src={`https://ui-avatars.com/api/?name=${user.name || user.email}&background=random`} />
                                        <AvatarFallback><UserIcon /></AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end" forceMount>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-bold leading-none">{user.name || "My Account"}</p>
                                        <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => router.push("/profile")} className="cursor-pointer font-medium">
                                    <UserIcon className="mr-2 h-4 w-4" />
                                    <span>Profile Settings</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={logout} className="text-red-500 focus:text-red-500 cursor-pointer font-medium">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="flex flex-1 flex-col p-4 md:p-6 overflow-hidden min-h-0">
                    <Card className="flex-1 flex flex-col min-h-0 border-border/40 shadow-sm overflow-hidden bg-card/40">
                        {activeView === "chat" ? (
                            <>
                                <ScrollArea className="flex-1 min-h-0" ref={scrollViewport}>
                                    <div className="p-4 lg:p-8">
                                        <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-10">
                                            {messages.length === 0 && (
                                                <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                                                    <div className="p-6 rounded-[2rem] bg-primary/5 mb-6 border border-primary/10">
                                                        <Bot className="w-16 h-16 text-primary" />
                                                    </div>
                                                    <h2 className="text-3xl font-black text-foreground mb-3 tracking-tighter uppercase">AI Chat Workspace</h2>
                                                    <p className="text-muted-foreground max-w-sm mx-auto text-sm font-medium leading-relaxed">
                                                        Start a conversation with your research agent. Ensure you have ingested documents for contextual grounding.
                                                    </p>
                                                </div>
                                            )}
                                            {messages.map((msg, i) => (
                                                <MessageBubble key={i} {...msg} />
                                            ))}
                                        </div>
                                    </div>
                                </ScrollArea>

                                <div className="p-4 lg:p-6 border-t bg-background/50 backdrop-blur-md">
                                    <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto w-full group">
                                        <Input
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            placeholder="Consult your knowledge base..."
                                            disabled={isLoading}
                                            className="flex-1 h-14 px-6 rounded-2xl bg-background/50 border border-border shadow-inner focus-visible:ring-primary/20 focus-visible:ring-offset-0 transition-all text-base"
                                        />
                                        <Button
                                            type="submit"
                                            disabled={isLoading || !input.trim()}
                                            className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:shadow-primary/20 hover:scale-[1.05] transition-all active:scale-[0.95]"
                                        >
                                            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                                        </Button>
                                    </form>
                                </div>
                            </>
                        ) : (
                            <ScrollArea className="flex-1">
                                <div className="p-6 lg:p-12 max-w-5xl mx-auto w-full flex flex-col gap-10">
                                    <div className="space-y-4">
                                        <h2 className="text-4xl font-black tracking-tighter uppercase">Knowledge Repository</h2>
                                        <p className="text-muted-foreground text-lg">Select a method to feed your agent with specialized knowledge.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {[
                                            { id: "file", icon: Paperclip, title: "Documents", desc: "PDF, TXT, or Markdown files" },
                                            { id: "text", icon: PlusCircle, title: "Raw Text", desc: "Paste snippets or articles" },
                                            { id: "github", icon: Github, title: "Code", desc: "Import from public GitHub repos" }
                                        ].map((tab) => (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveTab(tab.id as any)}
                                                className={`p-6 rounded-[2.5rem] border text-left transition-all group ${activeTab === tab.id
                                                    ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20 border-primary"
                                                    : "bg-background/40 hover:bg-background/60 border-border hover:border-primary/50"}`}
                                            >
                                                <div className={`size-12 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${activeTab === tab.id ? "bg-white/20" : "bg-primary/5 text-primary"}`}>
                                                    <tab.icon className="size-6" />
                                                </div>
                                                <h3 className="font-bold text-lg mb-1">{tab.title}</h3>
                                                <p className={`text-xs font-medium ${activeTab === tab.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{tab.desc}</p>
                                            </button>
                                        ))}
                                    </div>

                                    <Card className="flex-1 bg-background/20 border-dashed border-2 border-border/50 rounded-[3rem] overflow-hidden">
                                        {activeTab === "file" && (
                                            <div className="h-full flex flex-col items-center justify-center p-12 text-center group">
                                                <div
                                                    className="size-32 rounded-full bg-primary/5 flex items-center justify-center mb-6 border border-primary/10 group-hover:bg-primary/10 transition-colors cursor-pointer relative"
                                                    onClick={() => document.getElementById('main-file-upload')?.click()}
                                                >
                                                    <input
                                                        type="file"
                                                        id="main-file-upload"
                                                        className="hidden"
                                                        accept=".pdf,.txt,.md"
                                                        onChange={handleFileUpload}
                                                        disabled={isIngesting}
                                                    />
                                                    {isIngesting ? <Loader2 className="size-12 animate-spin text-primary" /> : <Paperclip className="size-12 text-primary" />}
                                                </div>
                                                <h4 className="text-2xl font-bold mb-2">Upload Files</h4>
                                                <p className="text-muted-foreground max-w-sm mb-6">Drag and drop your files here or click to browse. Supported formats: PDF, TXT, MD.</p>
                                                <Button
                                                    size="lg"
                                                    onClick={() => document.getElementById('main-file-upload')?.click()}
                                                    disabled={isIngesting}
                                                    className="px-8 font-bold rounded-2xl"
                                                >
                                                    SELECT FILES
                                                </Button>
                                            </div>
                                        )}

                                        {activeTab === "text" && (
                                            <div className="h-full flex flex-col p-8 gap-6">
                                                <div className="flex-1">
                                                    <textarea
                                                        className="w-full h-full min-h-[300px] rounded-[2rem] bg-background/50 border-none p-8 text-lg focus:ring-2 ring-primary/20 outline-none resize-none shadow-inner"
                                                        placeholder="Paste your content here..."
                                                        value={ingestText}
                                                        onChange={(e) => setIngestText(e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex justify-end">
                                                    <Button
                                                        size="lg"
                                                        className="h-16 px-12 rounded-2xl font-black tracking-widest uppercase shadow-lg shadow-primary/20"
                                                        onClick={handleIngest}
                                                        disabled={isIngesting || !ingestText.trim()}
                                                    >
                                                        {isIngesting ? <Loader2 className="size-6 animate-spin mr-3" /> : <Database className="size-6 mr-3" />}
                                                        INGEST TEXT
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === "github" && (
                                            <div className="h-full flex flex-col items-center justify-center p-12 text-center gap-8">
                                                <div className="size-24 rounded-[2rem] bg-[#24292f] flex items-center justify-center text-white shadow-xl">
                                                    <Github className="size-12" />
                                                </div>
                                                <div className="w-full max-w-md space-y-4">
                                                    <h4 className="text-2xl font-bold">Import GitHub Repository</h4>
                                                    <p className="text-muted-foreground mb-6">Enter a public GitHub repository URL to index its entire codebase and documentation.</p>
                                                    <Input
                                                        className="h-16 rounded-2xl px-6 text-lg bg-background/50 border-border"
                                                        placeholder="https://github.com/..."
                                                        value={ingestText}
                                                        onChange={(e) => setIngestText(e.target.value)}
                                                    />
                                                    <Button
                                                        size="lg"
                                                        className="w-full h-16 rounded-2xl font-black tracking-widest uppercase shadow-lg shadow-primary/20"
                                                        onClick={handleIngest}
                                                        disabled={isIngesting || !ingestText.startsWith("https://github.com/")}
                                                    >
                                                        {isIngesting ? <Loader2 className="size-6 animate-spin mr-3" /> : <Bot className="size-6 mr-3" />}
                                                        START INDEXING
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                </div>
                            </ScrollArea>
                        )}
                    </Card>
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
