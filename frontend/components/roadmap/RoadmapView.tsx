"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, Lock, ArrowRight, BookOpen, Clock, Target, TrendingUp, PlayCircle, Loader2, Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";
import { RoadmapGenerator } from "./RoadmapGenerator";

// Roadmap data structure matching backend
interface RoadmapModule {
    id: string;
    title: string;
    description: string;
    status: "completed" | "in-progress" | "locked" | "available";
    order: number;
    estimatedTime: string;
    estimatedHours: number;
    resources: LearningResource[];
    prerequisites?: string[];
    completedAt?: string;
    startedAt?: string;
    progress: number;
}

interface RoadmapStage {
    id: string;
    name: string;
    description: string;
    order: number;
    modules: RoadmapModule[];
    prerequisites?: string[];
}

interface RoadmapData {
    _id: string;
    userId: string;
    title: string;
    description: string;
    category: string;
    source: "profile" | "cv-analysis" | "jd-analysis" | "hybrid" | "manual";
    sourceData?: {
        cvSource?: string;
        jdSource?: string;
        semanticMatchScore?: number;
    };
    stages: RoadmapStage[];
    overallProgress: number;
    estimatedCompletionTime: string;
    createdAt: string;
    updatedAt: string;
    isActive: boolean;
}

interface LearningResource {
    id: string;
    type: "video" | "article" | "course" | "book" | "project" | "quiz" | "podcast";
    title: string;
    url?: string;
    description?: string;
    duration?: string;
    difficulty?: "beginner" | "intermediate" | "advanced";
    completed: boolean;
    completedAt?: string;
}

// Custom styled checkbox component
interface StyledCheckboxProps {
    checked: boolean;
    onChange: () => void;
    className?: string;
}

function StyledCheckbox({ checked, onChange, className }: StyledCheckboxProps) {
    return (
        <button
            type="button"
            onClick={onChange}
            className={cn(
                "relative flex items-center justify-center shrink-0 transition-all duration-300 ease-out",
                "w-6 h-6 rounded-lg border-2",
                checked
                    ? "bg-gradient-to-br from-purple-500 via-purple-600 to-pink-500 border-purple-400 shadow-lg shadow-purple-500/40 hover:shadow-purple-500/50 hover:scale-105"
                    : "bg-white/5 border-white/30 hover:border-purple-400/60 hover:bg-purple-500/10 hover:scale-105",
                "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-black/50",
                "active:scale-95",
                "group",
                className
            )}
            aria-checked={checked}
            role="checkbox"
        >
            {/* Animated background glow when checked */}
            {checked && (
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-purple-400 to-pink-400 opacity-50 blur-sm animate-pulse" />
            )}
            
            {/* Check icon with animation */}
            <div className="relative z-10">
                {checked ? (
                    <Check 
                        className="w-4 h-4 text-white animate-in zoom-in-50 duration-300" 
                        strokeWidth={3}
                    />
                ) : (
                    <div className="w-2.5 h-2.5 rounded-sm bg-transparent group-hover:bg-purple-400/30 transition-all duration-200" />
                )}
            </div>
            
            {/* Ripple effect on click */}
            <span className="absolute inset-0 rounded-lg bg-white/20 scale-0 group-active:scale-150 opacity-0 group-active:opacity-100 transition-all duration-300" />
        </button>
    );
}

export function RoadmapView() {
    const { token } = useAuth();
    const [roadmaps, setRoadmaps] = useState<RoadmapData[]>([]);
    const [activeRoadmap, setActiveRoadmap] = useState<RoadmapData | null>(null);
    const [openDrawerModuleId, setOpenDrawerModuleId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showGenerator, setShowGenerator] = useState(false);

    // Fetch user's roadmaps
    useEffect(() => {
        fetchRoadmaps();
    }, [token]);

    const fetchRoadmaps = async () => {
        if (!token) return;
        
        setIsLoading(true);
        try {
            const res = await fetch("/api/roadmap", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                setRoadmaps(data.roadmaps || []);
                
                // Set active roadmap or first roadmap
                const active = data.roadmaps.find((r: RoadmapData) => r.isActive) || data.roadmaps[0];
                if (active) {
                    setActiveRoadmap(active);
                }
            }
        } catch (error) {
            console.error("Failed to fetch roadmaps:", error);
            toast.error("Failed to load roadmaps");
        } finally {
            setIsLoading(false);
        }
    };

    const handleModuleClick = async (moduleId: string, currentStatus: string) => {
        if (!token || !activeRoadmap) return;
        
        // Don't open drawer for locked modules
        if (currentStatus === "locked") return;
        
        // Open drawer for available/completed/in-progress modules
        if (currentStatus === "available" || currentStatus === "completed" || currentStatus === "in-progress") {
            setOpenDrawerModuleId(moduleId);
        }
        
        // If available, mark as started
        if (currentStatus === "available") {
            try {
                const res = await fetch(`/api/roadmap/${activeRoadmap._id}/module/${moduleId}`, {
                    method: "PATCH",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ status: "started" })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setActiveRoadmap(data.roadmap);
                    toast.success("Module started!");
                }
            } catch (error) {
                console.error("Failed to start module:", error);
                toast.error("Failed to start module");
            }
        }
    };

    const handleModuleComplete = async (moduleId: string) => {
        if (!token || !activeRoadmap) return;
        
        try {
            const res = await fetch(`/api/roadmap/${activeRoadmap._id}/module/${moduleId}`, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ status: "completed" })
            });
            
            if (res.ok) {
                const data = await res.json();
                setActiveRoadmap(data.roadmap);
                toast.success("Module completed! 🎉");
            }
        } catch (error) {
            console.error("Failed to complete module:", error);
            toast.error("Failed to complete module");
        }
    };

    const handleResourceToggle = async (moduleId: string, resourceId: string, completed: boolean) => {
        if (!token || !activeRoadmap) return;
        
        try {
            const res = await fetch(`/api/roadmap/${activeRoadmap._id}/module/${moduleId}/resource/${resourceId}`, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ completed: !completed })
            });
            
            if (res.ok) {
                const data = await res.json();
                setActiveRoadmap(data.roadmap);
            }
        } catch (error) {
            console.error("Failed to update resource:", error);
            toast.error("Failed to update resource");
        }
    };

    const getCurrentModule = () => {
        if (!activeRoadmap || !openDrawerModuleId) return null;
        for (const stage of activeRoadmap.stages) {
            const module = stage.modules.find(m => m.id === openDrawerModuleId);
            if (module) return module;
        }
        return null;
    };

    const handleRoadmapGenerated = () => {
        setShowGenerator(false);
        fetchRoadmaps();
    };

    // Show generator if no roadmaps exist
    if (showGenerator || (!isLoading && roadmaps.length === 0)) {
        return (
            <div className="flex flex-1 overflow-hidden relative rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white h-full">
                <RoadmapGenerator onGenerated={handleRoadmapGenerated} onCancel={() => setShowGenerator(false)} />
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
        );
    }

    if (!activeRoadmap) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
                <Target className="h-12 w-12 text-white/30" />
                <h3 className="text-lg font-semibold text-white/90">No roadmap found</h3>
                <p className="text-sm text-white/50">Create your first learning roadmap to get started</p>
                <Button onClick={() => setShowGenerator(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Roadmap
                </Button>
            </div>
        );
    }

    const roadmap = activeRoadmap;

    const getStatusIcon = (status: RoadmapModule["status"]) => {
        switch (status) {
            case "completed":
                return <CheckCircle2 className="w-5 h-5 text-green-400" />;
            case "in-progress":
                return <PlayCircle className="w-5 h-5 text-purple-400" />;
            case "locked":
                return <Lock className="w-5 h-5 text-white/30" />;
        }
    };

    const getStatusBadge = (status: RoadmapModule["status"]) => {
        switch (status) {
            case "completed":
                return (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Completed
                    </Badge>
                );
            case "in-progress":
                return (
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        In Progress
                    </Badge>
                );
            case "locked":
                return (
                    <Badge variant="outline" className="border-white/10 text-white/40">
                        Locked
                    </Badge>
                );
        }
    };

    const completedCount = roadmap.stages.reduce(
        (acc, stage) => acc + stage.modules.filter(m => m.status === "completed").length,
        0
    );
    const totalCount = roadmap.stages.reduce((acc, stage) => acc + stage.modules.length, 0);

    return (
        <div className="flex flex-1 flex-col overflow-hidden relative rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white h-full">
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Target className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-white/90">{roadmap.title}</h2>
                            {roadmaps.length > 1 && (
                                <Select
                                    value={activeRoadmap._id}
                                    onValueChange={(value) => {
                                        const selected = roadmaps.find(r => r._id === value);
                                        if (selected) setActiveRoadmap(selected);
                                    }}
                                >
                                    <SelectTrigger className="w-[200px] bg-black/40 border-white/10 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roadmaps.map((r) => (
                                            <SelectItem key={r._id} value={r._id}>
                                                {r.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                        {roadmap.description && (
                            <p className="text-sm text-white/50 mt-0.5">{roadmap.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowGenerator(true)}
                        className="border-white/10 text-white hover:bg-white/10 gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        New Roadmap
                    </Button>
                    <div className="text-right">
                        <div className="text-sm text-white/60">Progress</div>
                        <div className="text-lg font-semibold text-white/90">
                            {completedCount} / {totalCount}
                        </div>
                    </div>
                    <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/5">
                        {roadmap.overallProgress}% Complete
                    </Badge>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="px-6 pt-4 pb-2">
                <Progress value={roadmap.overallProgress} className="h-2 bg-white/5" />
            </div>

            {/* Roadmap Content */}
            <ScrollArea className="flex-1">
                <div className="p-6 space-y-8">
                    {roadmap.stages.map((stage, stageIndex) => (
                        <div key={stage.id} className="relative">
                            {/* Stage Header */}
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                                        stageIndex === 0 && "bg-green-500/20 text-green-400",
                                        stageIndex === 1 && "bg-purple-500/20 text-purple-400",
                                        stageIndex === 2 && "bg-blue-500/20 text-blue-400"
                                    )}>
                                        {stageIndex + 1}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-white/90">{stage.name}</h3>
                                        {stage.description && (
                                            <p className="text-sm text-white/50">{stage.description}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Modules Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                                {stage.modules.map((module, moduleIndex) => {
                                    const isLocked = module.status === "locked";
                                    
                                    return (
                                        <Card
                                            key={module.id}
                                            className={cn(
                                                "bg-white/5 border-white/10 overflow-hidden transition-all cursor-pointer group",
                                                !isLocked && "hover:bg-white/10 hover:border-purple-500/30",
                                                isLocked && "opacity-60 cursor-not-allowed",
                                                module.status === "completed" && "border-green-500/30",
                                                module.status === "in-progress" && "border-purple-500/30",
                                                module.status === "available" && "border-blue-500/30"
                                            )}
                                            onClick={() => handleModuleClick(module.id, module.status)}
                                        >
                                            <CardHeader className="p-4 pb-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2 flex-1">
                                                        {getStatusIcon(module.status)}
                                                        <div className="flex-1 min-w-0">
                                                            <CardTitle className="text-base font-semibold text-white/90 line-clamp-2 leading-tight">
                                                                {module.title}
                                                            </CardTitle>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-4 pt-2 space-y-3">
                                                {module.description && (
                                                    <CardDescription className="text-xs text-white/50 line-clamp-2">
                                                        {module.description}
                                                    </CardDescription>
                                                )}
                                                
                                                <div className="flex items-center justify-between flex-wrap gap-2">
                                                    {getStatusBadge(module.status)}
                                                    <div className="flex items-center gap-3 text-xs text-white/40">
                                                        {module.estimatedTime && (
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                <span>{module.estimatedTime}</span>
                                                            </div>
                                                        )}
                                                        {module.resources && module.resources.length > 0 && (
                                                            <div className="flex items-center gap-1">
                                                                <BookOpen className="w-3 h-3" />
                                                                <span>{module.resources.length} resources</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Progress Bar for in-progress modules */}
                                                {module.status === "in-progress" && module.progress > 0 && (
                                                    <div className="pt-2">
                                                        <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                                                            <span>Progress</span>
                                                            <span>{module.progress}%</span>
                                                        </div>
                                                        <Progress value={module.progress} className="h-1.5 bg-white/5" />
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>

                            {/* Connector Arrow (except for last stage) */}
                            {stageIndex < roadmap.stages.length - 1 && (
                                <div className="flex justify-center my-4">
                                    <div className="flex flex-col items-center gap-1">
                                        <ArrowRight className="w-5 h-5 text-white/20 rotate-90" />
                                        <div className="w-px h-8 bg-linear-to-b from-white/20 to-transparent" />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {/* Learning Resources Drawer */}
            <Sheet open={openDrawerModuleId !== null} onOpenChange={(open) => !open && setOpenDrawerModuleId(null)}>
                <SheetContent side="right" className="w-full sm:max-w-lg bg-black/95 backdrop-blur-xl border-white/10 text-white overflow-y-auto">
                    {(() => {
                        const module = getCurrentModule();
                        if (!module) return null;

                        return (
                            <>
                                <SheetHeader>
                                    <div className="flex items-start gap-3">
                                        {getStatusIcon(module.status)}
                                        <div className="flex-1">
                                            <SheetTitle className="text-xl text-white/90">{module.title}</SheetTitle>
                                            {module.description && (
                                                <SheetDescription className="text-white/60 mt-2">
                                                    {module.description}
                                                </SheetDescription>
                                            )}
                                        </div>
                                    </div>
                                </SheetHeader>

                                <div className="mt-6 space-y-4">
                                    {/* Module Info */}
                                    <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10">
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(module.status)}
                                        </div>
                                        {module.estimatedTime && (
                                            <div className="flex items-center gap-2 text-sm text-white/60">
                                                <Clock className="w-4 h-4" />
                                                <span>{module.estimatedTime}</span>
                                            </div>
                                        )}
                                        {module.progress > 0 && (
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                                                    <span>Progress</span>
                                                    <span>{module.progress}%</span>
                                                </div>
                                                <Progress value={module.progress} className="h-2 bg-white/5" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Learning Resources */}
                                    <div className="space-y-3">
                                        <h3 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                                            <BookOpen className="w-5 h-5 text-purple-400" />
                                            Learning Resources
                                        </h3>
                                        
                                        {module.resources && module.resources.length > 0 ? (
                                            <ScrollArea className="h-[calc(100vh-300px)]">
                                                <div className="space-y-3 pr-4">
                                                    {module.resources.map((resource) => (
                                                        <Card
                                                            key={resource.id}
                                                            className={cn(
                                                                "transition-all duration-200",
                                                                resource.completed
                                                                    ? "bg-green-500/5 border-green-500/20 hover:bg-green-500/10"
                                                                    : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-purple-500/20"
                                                            )}
                                                        >
                                                            <CardContent className="p-4">
                                                                <div className="flex items-start gap-3">
                                                                    <div className="mt-0.5">
                                                                        <StyledCheckbox
                                                                            checked={resource.completed}
                                                                            onChange={() => handleResourceToggle(module.id, resource.id, resource.completed)}
                                                                        />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                                            <h4 className={cn(
                                                                                "text-sm font-semibold transition-all",
                                                                                resource.completed 
                                                                    ? "text-green-400/80 line-through decoration-green-400/40" 
                                                                    : "text-white/90"
                                                                            )}>
                                                                                {resource.title}
                                                                            </h4>
                                                                            <Badge 
                                                                                variant="outline" 
                                                                                className={cn(
                                                                                    "text-xs shrink-0",
                                                                                    resource.completed
                                                                                        ? "border-green-500/30 text-green-400/80 bg-green-500/10"
                                                                                        : "border-white/10 text-white/60"
                                                                                )}
                                                                            >
                                                                                {resource.type}
                                                                            </Badge>
                                                                        </div>
                                                                        {resource.description && (
                                                                            <p className={cn(
                                                                                "text-xs mb-2 transition-colors",
                                                                                resource.completed ? "text-white/40" : "text-white/60"
                                                                            )}>
                                                                                {resource.description}
                                                                            </p>
                                                                        )}
                                                                        <div className="flex items-center gap-3 flex-wrap">
                                                                            {resource.duration && (
                                                                                <div className={cn(
                                                                                    "flex items-center gap-1 text-xs",
                                                                                    resource.completed ? "text-white/40" : "text-white/50"
                                                                                )}>
                                                                                    <Clock className="w-3 h-3" />
                                                                                    <span>{resource.duration}</span>
                                                                                </div>
                                                                            )}
                                                                            {resource.difficulty && (
                                                                                <Badge 
                                                                                    variant="outline" 
                                                                                    className={cn(
                                                                                        "text-xs",
                                                                                        resource.difficulty === "beginner" && "border-green-500/30 text-green-400",
                                                                                        resource.difficulty === "intermediate" && "border-yellow-500/30 text-yellow-400",
                                                                                        resource.difficulty === "advanced" && "border-red-500/30 text-red-400"
                                                                                    )}
                                                                                >
                                                                                    {resource.difficulty}
                                                                                </Badge>
                                                                            )}
                                                                        </div>
                                                                        {resource.url && (
                                                                            <a
                                                                                href={resource.url}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className={cn(
                                                                                    "text-xs inline-flex items-center gap-1 mt-3 transition-colors",
                                                                                    resource.completed
                                                                                        ? "text-green-400/70 hover:text-green-400"
                                                                                        : "text-purple-400 hover:text-purple-300"
                                                                                )}
                                                                            >
                                                                                Open resource
                                                                                <ArrowRight className="w-3 h-3" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        ) : (
                                            <div className="text-sm text-white/60 p-4 rounded-lg bg-white/5 border border-white/10">
                                                <p>No resources available for this module yet.</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Complete Button */}
                                    {module.status === "in-progress" && (
                                        <div className="pt-4 border-t border-white/10">
                                            <Button
                                                onClick={() => {
                                                    handleModuleComplete(module.id);
                                                    setOpenDrawerModuleId(null);
                                                }}
                                                className="w-full bg-green-500/20 hover:bg-green-500/30 text-green-400 border-green-500/30"
                                            >
                                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                                Mark as Complete
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </SheetContent>
            </Sheet>
        </div>
    );
}
