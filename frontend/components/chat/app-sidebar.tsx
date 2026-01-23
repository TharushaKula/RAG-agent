"use client"

import * as React from "react"
import {
    Bot,
    Database,
    Settings2,
    SquareTerminal,
    Github,
    FileText,
    BookOpen,
    User as UserIcon,
    Target,
    Sparkles,
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from "@/components/ui/sidebar"
import { useAuth } from "../../context/AuthContext"
import { NavMain } from "./nav-main"
import { NavUser } from "./nav-user"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    activeView: "chat" | "knowledge" | "github-agent" | "cv-analyzer" | "semantic-matcher" | "industry-info" | "learning-materials" | "profile" | "roadmap"
    setActiveView: (view: "chat" | "knowledge" | "github-agent" | "cv-analyzer" | "semantic-matcher" | "industry-info" | "learning-materials" | "profile" | "roadmap") => void
    activeTab: "text" | "file" | "github"
    setActiveTab: (tab: "text" | "file" | "github") => void
    ingestText: string
    setIngestText: (text: string) => void
    isIngesting: boolean
    handleIngest: () => void
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function AppSidebar({
    activeView,
    setActiveView,
    activeTab: _activeTab,
    setActiveTab: _setActiveTab,
    ingestText: _ingestText,
    setIngestText: _setIngestText,
    isIngesting: _isIngesting,
    handleIngest: _handleIngest,
    handleFileUpload: _handleFileUpload,
    ...props
}: AppSidebarProps) {
    // These props are required by the interface but not used in this component
    // They're prefixed with _ to indicate intentional non-use
    void _activeTab;
    void _setActiveTab;
    void _ingestText;
    void _setIngestText;
    void _isIngesting;
    void _handleIngest;
    void _handleFileUpload;
    const { user } = useAuth()

    const navItems = [
        {
            title: "AI Chat",
            icon: SquareTerminal,
            isActive: activeView === "chat",
            onClick: () => setActiveView("chat"),
        },
        {
            title: "Knowledge Base",
            icon: Database,
            isActive: activeView === "knowledge",
            onClick: () => setActiveView("knowledge"),
        },
        {
            title: "GitHub Agent",
            icon: Github,
            isActive: activeView === "github-agent",
            onClick: () => setActiveView("github-agent"),
        },
        {
            title: "CV Uploader",
            icon: FileText,
            isActive: activeView === "cv-analyzer",
            onClick: () => setActiveView("cv-analyzer"),
        },
        {
            title: "Semantic Match",
            icon: Sparkles,
            isActive: activeView === "semantic-matcher",
            onClick: () => setActiveView("semantic-matcher"),
        },
        {
            title: "Industry Info",
            icon: Settings2,
            isActive: activeView === "industry-info",
            onClick: () => setActiveView("industry-info"),
        },
        {
            title: "Learning Materials",
            icon: BookOpen,
            isActive: activeView === "learning-materials",
            onClick: () => setActiveView("learning-materials"),
        },
        {
            title: "Roadmap",
            icon: Target,
            isActive: activeView === "roadmap",
            onClick: () => setActiveView("roadmap"),
        },
        {
            title: "Profile",
            icon: UserIcon,
            isActive: activeView === "profile",
            onClick: () => setActiveView("profile"),
        },
    ]

    return (
        <Sidebar
            collapsible="icon"
            {...props}
        >
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <a href="#">
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                    <Bot className="size-4" />
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">RAG Agent</span>
                                    <span className="truncate text-xs">Enterprise</span>
                                </div>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={navItems} />
            </SidebarContent>
            <SidebarFooter>
                {user && <NavUser user={{ name: user.name || "User", email: user.email, avatar: `https://ui-avatars.com/api/?name=${user.name || user.email}&background=random` }} />}
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}

