"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Lock, ArrowRight, BookOpen, Clock, Target, TrendingUp, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// Dummy data structure
interface RoadmapModule {
    id: string;
    title: string;
    description?: string;
    status: "completed" | "in-progress" | "locked";
    estimatedTime?: string;
    resources?: number;
}

interface RoadmapStage {
    id: string;
    name: string;
    description?: string;
    modules: RoadmapModule[];
}

interface RoadmapData {
    title: string;
    description?: string;
    stages: RoadmapStage[];
    overallProgress: number;
}

// Dummy data
const dummyRoadmap: RoadmapData = {
    title: "Front-End Developer Roadmap",
    description: "A comprehensive guide to becoming a front-end developer",
    overallProgress: 35,
    stages: [
        {
            id: "fundamentals",
            name: "Fundamentals",
            description: "Build a strong foundation",
            modules: [
                {
                    id: "html-css",
                    title: "HTML & CSS",
                    description: "Learn the building blocks of web development",
                    status: "completed",
                    estimatedTime: "2-3 weeks",
                    resources: 12
                },
                {
                    id: "javascript-basics",
                    title: "JavaScript Basics",
                    description: "Master the fundamentals of JavaScript programming",
                    status: "in-progress",
                    estimatedTime: "3-4 weeks",
                    resources: 18
                },
                {
                    id: "git",
                    title: "Version Control (Git)",
                    description: "Learn to track changes and collaborate with Git",
                    status: "locked",
                    estimatedTime: "1-2 weeks",
                    resources: 8
                },
                {
                    id: "responsive-design",
                    title: "Responsive Design",
                    description: "Create layouts that work on all devices",
                    status: "locked",
                    estimatedTime: "2 weeks",
                    resources: 10
                }
            ]
        },
        {
            id: "frameworks",
            name: "Frameworks & Libraries",
            description: "Modern development tools",
            modules: [
                {
                    id: "react",
                    title: "React",
                    description: "Build user interfaces with React",
                    status: "locked",
                    estimatedTime: "4-6 weeks",
                    resources: 25
                },
                {
                    id: "typescript",
                    title: "TypeScript",
                    description: "Add type safety to JavaScript",
                    status: "locked",
                    estimatedTime: "2-3 weeks",
                    resources: 15
                },
                {
                    id: "nextjs",
                    title: "Next.js",
                    description: "Full-stack React framework",
                    status: "locked",
                    estimatedTime: "3-4 weeks",
                    resources: 20
                }
            ]
        },
        {
            id: "advanced",
            name: "Advanced Topics",
            description: "Take your skills to the next level",
            modules: [
                {
                    id: "state-management",
                    title: "State Management",
                    description: "Manage complex application state",
                    status: "locked",
                    estimatedTime: "2-3 weeks",
                    resources: 12
                },
                {
                    id: "performance",
                    title: "Performance Optimization",
                    description: "Make your apps fast and efficient",
                    status: "locked",
                    estimatedTime: "2-3 weeks",
                    resources: 14
                },
                {
                    id: "testing",
                    title: "Testing",
                    description: "Write reliable tests for your code",
                    status: "locked",
                    estimatedTime: "2-3 weeks",
                    resources: 10
                },
                {
                    id: "deployment",
                    title: "Deployment & DevOps",
                    description: "Deploy and maintain production apps",
                    status: "locked",
                    estimatedTime: "2-3 weeks",
                    resources: 16
                }
            ]
        }
    ]
};

export function RoadmapView() {
    const [roadmap] = useState<RoadmapData>(dummyRoadmap);
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

    const toggleModule = (moduleId: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(moduleId)) {
                next.delete(moduleId);
            } else {
                next.add(moduleId);
            }
            return next;
        });
    };

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
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Target className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-white/90">{roadmap.title}</h2>
                        {roadmap.description && (
                            <p className="text-sm text-white/50 mt-0.5">{roadmap.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
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
                                    const isExpanded = expandedModules.has(module.id);
                                    const isLocked = module.status === "locked";
                                    
                                    return (
                                        <Card
                                            key={module.id}
                                            className={cn(
                                                "bg-white/5 border-white/10 overflow-hidden transition-all cursor-pointer group",
                                                !isLocked && "hover:bg-white/10 hover:border-purple-500/30",
                                                isLocked && "opacity-60 cursor-not-allowed",
                                                module.status === "completed" && "border-green-500/30",
                                                module.status === "in-progress" && "border-purple-500/30"
                                            )}
                                            onClick={() => !isLocked && toggleModule(module.id)}
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
                                                        {module.resources && (
                                                            <div className="flex items-center gap-1">
                                                                <BookOpen className="w-3 h-3" />
                                                                <span>{module.resources} resources</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Expanded Details */}
                                                {isExpanded && !isLocked && (
                                                    <div className="pt-2 border-t border-white/10 space-y-2 animate-in slide-in-from-top-2">
                                                        <div className="text-xs text-white/60">
                                                            <p>Click to view learning resources and start this module.</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-purple-400">
                                                            <TrendingUp className="w-3 h-3" />
                                                            <span>Ready to start</span>
                                                        </div>
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
                                        <div className="w-px h-8 bg-gradient-to-b from-white/20 to-transparent" />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
