"use client"

import * as React from "react"
import {
    Bot,
    Database,
    Settings2,
    SquareTerminal,
    Github,
    FileText,
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
    activeView: "chat" | "knowledge" | "github-agent" | "cv-analyzer"
    setActiveView: (view: "chat" | "knowledge" | "github-agent" | "cv-analyzer") => void
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
            isActive: activeView === "github-agent" as any,
            onClick: () => setActiveView("github-agent" as any),
        },
        {
            title: "CV Analyzer",
            icon: FileText,
            isActive: activeView === "cv-analyzer" as any,
            onClick: () => setActiveView("cv-analyzer" as any),
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
