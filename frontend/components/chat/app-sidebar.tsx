"use client"

import * as React from "react"
import {
    BookOpen,
    Bot,
    Command,
    Database,
    FileText,
    LayoutDashboard,
    Settings,
    PlusCircle,
    Paperclip,
    Loader2,
    Trash2,
    Monitor,
    Github
} from "lucide-react"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarGroupContent,
} from "@/components/ui/sidebar"
import { useAuth } from "../../context/AuthContext"
import { Button } from "@/components/ui/button"

interface AppSidebarProps {
    activeView: "chat" | "knowledge"
    setActiveView: (view: "chat" | "knowledge") => void
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
    activeTab,
    setActiveTab,
    ingestText,
    setIngestText,
    isIngesting,
    handleIngest,
    handleFileUpload
}: AppSidebarProps) {
    const { user } = useAuth()

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <a href="#">
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                    <Bot className="size-4" />
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="font-semibold">RAG Agent</span>
                                    <span className="text-xs text-muted-foreground font-medium">Enterprise AI</span>
                                </div>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Main Navigation</SidebarGroupLabel>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                isActive={activeView === "chat"}
                                onClick={() => setActiveView("chat")}
                            >
                                <Bot />
                                <span>AI Chat</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                isActive={activeView === "knowledge"}
                                onClick={() => setActiveView("knowledge")}
                            >
                                <Database />
                                <span>Knowledge Base</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroup>

                <SidebarGroup className="mt-auto">
                    <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                        System Status
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <div className="px-2 py-1.5 flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
                            <div className="size-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                            <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground group-data-[collapsible=icon]:hidden">Live Synced</span>
                        </div>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <div className="p-2 bg-primary/5 rounded-lg border border-primary/10 group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-black tracking-tighter">
                        <div className="size-1.5 rounded-full bg-green-500 animate-pulse" />
                        DATABASE ONLINE
                    </div>
                    <p className="text-[9px] text-muted-foreground/60 mt-1 leading-none">Connected to MongoDB Atlas clusters with high availability.</p>
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}
