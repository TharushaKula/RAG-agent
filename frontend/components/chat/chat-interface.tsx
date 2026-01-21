"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { Send, PlusCircle, Database, Loader2, Paperclip, LogOut, User as UserIcon, Bot, Github, Activity, X } from "lucide-react";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
import { GitHubAgentUI } from "../github-agent/GitHubAgentUI";
import { LiveView } from "../github-agent/LiveView";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { CVAnalyzer } from "../cv-analyzer/CVAnalyzer";
import { IndustryInfo } from "@/components/industry/IndustryInfo";
import { LearningMaterials } from "@/components/learning/LearningMaterials";
import { ProfilePanel } from "@/components/profile/ProfilePanel";
import { RoadmapView } from "@/components/roadmap/RoadmapView";


interface Source {
    source: string;
    content: string;
}

interface Message {
    role: "user" | "assistant";
    content: string;
    sources?: Source[];
}

export function ChatInterface({ initialView = "chat" }: { initialView?: "chat" | "knowledge" | "github-agent" | "cv-analyzer" | "industry-info" | "learning-materials" | "profile" | "roadmap" } = {}) {
    const { user, token, logout, isLoading: authLoading } = useAuth();
    const router = useRouter();

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [activeView, setActiveView] = useState<"chat" | "knowledge" | "github-agent" | "cv-analyzer" | "industry-info" | "learning-materials" | "profile" | "roadmap">(initialView);

    // Ingestion state
    const [ingestText, setIngestText] = useState("");
    const [isIngesting, setIsIngesting] = useState(false);

    // Context Selection State
    const [availableFiles, setAvailableFiles] = useState<{ cv: string[], jd: string[] }>({ cv: [], jd: [] });
    const [selectedCV, setSelectedCV] = useState<string>("");
    const [selectedJD, setSelectedJD] = useState<string>("");

    // Fetch available files
    const fetchFiles = async () => {
        if (!token) return;
        try {
            console.log("🔄 Fetching user files...");
            const res = await fetch("/api/cv/files", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                console.log("✅ Files fetched:", data);
                setAvailableFiles(data);
                // Auto-select first available if not selected
                if (data.cv.length > 0 && !selectedCV) {
                    console.log("🔹 Auto-selecting CV:", data.cv[0]);
                    setSelectedCV(data.cv[0]);
                }
                if (data.jd.length > 0 && !selectedJD) {
                    console.log("🔹 Auto-selecting JD:", data.jd[0]);
                    setSelectedJD(data.jd[0]);
                }
            } else {
                console.error("❌ Failed to fetch files, status:", res.status);
            }
        } catch (err) {
            console.error("❌ Failed to fetch files", err);
        }
    };

    useEffect(() => {
        if (activeView === "cv-analyzer" || activeView === "chat") {
            fetchFiles();
        }
    }, [activeView, token]);

    // Also fetch files when token changes (user logs in)
    useEffect(() => {
        if (token && (activeView === "cv-analyzer" || activeView === "chat")) {
            fetchFiles();
        }
    }, [token]);

    // Send active sources logic needs to be updated too? 
    // Wait, the handleSubmit logic checked `if (activeView === "cv-analyzer")`.
    // I need to update that too.

    // GitHub Agent State
    const [isAgentAnalyzing, setIsAgentAnalyzing] = useState(false);
    const [showLivePanel, setShowLivePanel] = useState(false);
    const [liveFrame, setLiveFrame] = useState<string | null>(null);
    const [liveStatus, setLiveStatus] = useState("Idle");

    // Trigger panel when analysis starts
    useEffect(() => {
        if (isAgentAnalyzing) {
            setShowLivePanel(true);
        }
    }, [isAgentAnalyzing]);

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
            const activeSources = [];
            // Send selected context if in CV Uploader OR Chat view
            if (activeView === "cv-analyzer" || activeView === "chat") {
                if (selectedCV) activeSources.push(selectedCV);
                if (selectedJD) activeSources.push(selectedJD);
            }

            const res = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    messages: [...messages, userMsg],
                    activeSources: activeSources.length > 0 ? activeSources : undefined
                }),
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
            <SidebarInset className="bg-transparent text-white">
                {/* Dashboard Header */}
                <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="#">
                                        RAG Agent
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>
                                        {activeView === "chat"
                                            ? "AI Chat"
                                            : activeView === "knowledge"
                                                ? "Knowledge Base"
                                                : activeView === "cv-analyzer"
                                                    ? "CV Uploader"
                                                    : activeView === "industry-info"
                                                        ? "Industry Info"
                                                        : activeView === "learning-materials"
                                                            ? "Learning Materials"
                                                            : activeView === "roadmap"
                                                                ? "Roadmap"
                                                                : activeView === "profile"
                                                                    ? "Profile"
                                                                    : "GitHub Explorer Agent"}
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>

                    <div className="ml-auto flex items-center gap-2 px-4">
                        {(activeView === "cv-analyzer" || activeView === "chat") && (
                            <div className="flex items-center gap-2 mr-2">
                                <Select value={selectedCV} onValueChange={setSelectedCV}>
                                    <SelectTrigger className="w-[180px] h-8 text-xs bg-white/5 border-white/10 text-white">
                                        <SelectValue placeholder="Select CV" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-black border-white/20 text-white">
                                        <SelectItem value="placeholder" disabled className="text-muted-foreground">Select your CV</SelectItem>
                                        {availableFiles.cv.map((file) => (
                                            <SelectItem key={file} value={file}>{file}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select value={selectedJD} onValueChange={setSelectedJD}>
                                    <SelectTrigger className="w-[180px] h-8 text-xs bg-white/5 border-white/10 text-white">
                                        <SelectValue placeholder="Select JD" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-black border-white/20 text-white">
                                        <SelectItem value="placeholder" disabled className="text-muted-foreground">Select Job Description</SelectItem>
                                        {availableFiles.jd.map((file) => (
                                            <SelectItem key={file} value={file}>{file}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={`https://ui-avatars.com/api/?name=${user.name || user.email}&background=random`} />
                                        <AvatarFallback><UserIcon className="h-4 w-4" /></AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end" forceMount>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">{user.name || "My Account"}</p>
                                        <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => router.push("/profile")} className="cursor-pointer">
                                    <UserIcon className="mr-2 h-4 w-4" />
                                    <span>Profile</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={logout} className="cursor-pointer">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Log out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                {/* Main Content Area */}
                <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                    {activeView === "chat" ? (
                        <div className="flex flex-1 flex-col rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden text-white">
                            <ScrollArea className="flex-1" ref={scrollViewport}>
                                <div className="p-4">
                                    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
                                        {messages.length === 0 && (
                                            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                                                <div className="rounded-full bg-primary/10 p-4 mb-4">
                                                    <Bot className="h-8 w-8 text-primary" />
                                                </div>
                                                <h2 className="text-xl font-semibold mb-2">AI Chat</h2>
                                                <p className="text-muted-foreground text-sm max-w-sm">
                                                    Start a conversation with your AI assistant. Make sure to add documents to your knowledge base first.
                                                </p>
                                            </div>
                                        )}
                                        {messages.map((msg, i) => (
                                            <MessageBubble key={i} {...msg} />
                                        ))}
                                    </div>
                                </div>
                            </ScrollArea>

                            <div className="p-4 border-t">
                                <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto">
                                    <Input
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        placeholder="Ask something..."
                                        disabled={isLoading}
                                        className="flex-1 "
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={isLoading || !input.trim()}
                                    >
                                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </Button>
                                </form>
                            </div>
                        </div>
                    ) : activeView === "knowledge" ? (
                        <div className="flex flex-1 flex-col gap-4">
                            <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                                {[
                                    { id: "file", icon: Paperclip, title: "Documents", desc: "PDF, TXT, MD files" },
                                    { id: "text", icon: PlusCircle, title: "Text", desc: "Paste content" },
                                    { id: "github", icon: Github, title: "GitHub", desc: "Import repos" }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`aspect-video rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-colors ${activeTab === tab.id
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-black/20 backdrop-blur-md border border-white/10 hover:bg-white/5"}`}
                                    >
                                        <tab.icon className="h-6 w-6" />
                                        <span className="font-medium">{tab.title}</span>
                                        <span className={`text-xs ${activeTab === tab.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{tab.desc}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="min-h-[50vh] flex-1 rounded-xl bg-black/20 backdrop-blur-md border border-white/10 p-6">
                                {activeTab === "file" && (
                                    <div className="h-full flex flex-col items-center justify-center text-center">
                                        <div
                                            className="rounded-full bg-muted p-6 mb-4 cursor-pointer hover:bg-muted/80 transition-colors"
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
                                            {isIngesting ? <Loader2 className="h-8 w-8 animate-spin" /> : <Paperclip className="h-8 w-8" />}
                                        </div>
                                        <h3 className="font-semibold mb-1">Upload Files</h3>
                                        <p className="text-muted-foreground text-sm mb-4">Supported: PDF, TXT, MD</p>
                                        <Button
                                            onClick={() => document.getElementById('main-file-upload')?.click()}
                                            disabled={isIngesting}
                                        >
                                            Select Files
                                        </Button>
                                    </div>
                                )}

                                {activeTab === "text" && (
                                    <div className="h-full flex flex-col gap-4">
                                        <textarea
                                            className="flex-1 w-full rounded-lg bg-background p-4 text-sm border resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                                            placeholder="Paste your content here..."
                                            value={ingestText}
                                            onChange={(e) => setIngestText(e.target.value)}
                                        />
                                        <div className="flex justify-end">
                                            <Button
                                                onClick={handleIngest}
                                                disabled={isIngesting || !ingestText.trim()}
                                            >
                                                {isIngesting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                <Database className="h-4 w-4 mr-2" />
                                                Ingest Text
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "github" && (
                                    <div className="h-full flex flex-col items-center justify-center text-center gap-4">
                                        <div className="rounded-full bg-[#24292f] p-4 text-white">
                                            <Github className="h-8 w-8" />
                                        </div>
                                        <div className="w-full max-w-md space-y-4">
                                            <h3 className="font-semibold">Import GitHub Repository</h3>
                                            <p className="text-muted-foreground text-sm">Enter a public repository URL</p>
                                            <Input
                                                placeholder="https://github.com/..."
                                                value={ingestText}
                                                onChange={(e) => setIngestText(e.target.value)}
                                            />
                                            <Button
                                                className="w-full"
                                                onClick={handleIngest}
                                                disabled={isIngesting || !ingestText.startsWith("https://github.com/")}
                                            >
                                                {isIngesting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                                                Start Indexing
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeView === "cv-analyzer" ? (
                        <div className="flex flex-1 overflow-hidden relative rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white">
                            <CVAnalyzer onUploadComplete={fetchFiles} />
                        </div>
                    ) : activeView === "industry-info" ? (
                        <IndustryInfo />
                    ) : activeView === "learning-materials" ? (
                        <LearningMaterials />
                    ) : activeView === "roadmap" ? (
                        <RoadmapView />
                    ) : activeView === "profile" ? (
                        <div className="flex flex-1 overflow-hidden rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white">
                            <div className="flex-1 overflow-y-auto p-4">
                                <ProfilePanel />
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-1 overflow-hidden relative rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white">
                            <div className="flex-1 overflow-y-auto p-4">
                                <GitHubAgentUI
                                    onAnalysisStatusChange={setIsAgentAnalyzing}
                                    setLiveFrame={setLiveFrame}
                                    setLiveStatus={setLiveStatus}
                                />
                            </div>

                            {/* Sliding Live Agent Vision Panel */}
                            <AnimatePresence>
                                {showLivePanel && (
                                    <motion.div
                                        initial={{ x: "100%" }}
                                        animate={{ x: 0 }}
                                        exit={{ x: "100%" }}
                                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                        className="absolute right-0 top-0 bottom-0 w-[800px] bg-black/90 backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col"
                                    >
                                        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                            <div className="flex items-center gap-2">
                                                <Activity className="w-4 h-4 text-purple-400" />
                                                <span className="text-sm font-medium text-white/80">Agent Vision</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline" className={`text-[10px] uppercase tracking-widest ${isAgentAnalyzing ? 'border-purple-500/30 text-purple-400 bg-purple-500/5' : 'border-white/10 text-white/40'}`}>
                                                    {isAgentAnalyzing ? 'Active Stream' : 'Analysis Idle'}
                                                </Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 rounded-full hover:bg-white/10 text-white/40 hover:text-white"
                                                    onClick={() => setShowLivePanel(false)}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="flex-1 p-4 overflow-hidden relative">
                                            <LiveView frame={liveFrame} status={liveStatus} />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </SidebarInset >
        </SidebarProvider >
    );
}
