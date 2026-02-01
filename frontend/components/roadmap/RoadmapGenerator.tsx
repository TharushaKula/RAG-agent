"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, X, Target, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { RoadmapProgress } from "./RoadmapProgress";

interface RoadmapGeneratorProps {
    onGenerated: () => void;
    onCancel: () => void;
}

export function RoadmapGenerator({ onGenerated, onCancel }: RoadmapGeneratorProps) {
    const { token } = useAuth();
    const [source, setSource] = useState<"cv" | "hybrid">("cv");
    const [availableFiles, setAvailableFiles] = useState<{ cv: string[], jd: string[] }>({ cv: [], jd: [] });
    const [selectedCV, setSelectedCV] = useState<string>("");
    const [selectedJD, setSelectedJD] = useState<string>("");
    const [targetRole, setTargetRole] = useState<string>(""); // Target job role for CV analysis
    const [isGenerating, setIsGenerating] = useState(false);
    const [isComplete, setIsComplete] = useState(false); // Tracks actual backend completion

    // Fetch available files for CV/JD/hybrid
    useEffect(() => {
        if (token) {
            fetchFiles();
        }
    }, [token]);

    const fetchFiles = async () => {
        if (!token) return;
        try {
            const res = await fetch("/api/cv/files", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableFiles(data);
                if (data.cv.length > 0 && !selectedCV) {
                    setSelectedCV(data.cv[0]);
                }
                if (data.jd.length > 0 && !selectedJD) {
                    setSelectedJD(data.jd[0]);
                }
            }
        } catch (err) {
            console.error("Failed to fetch files", err);
        }
    };

    const handleGenerate = async () => {
        if (!token) {
            toast.error("You must be logged in.");
            return;
        }

        // Validate selections
        if ((source === "cv" || source === "hybrid") && !selectedCV) {
            toast.error("Please select a CV for CV or hybrid roadmap");
            return;
        }
        if (source === "cv" && !targetRole.trim()) {
            toast.error("Please enter a target job role for CV analysis");
            return;
        }
        if (source === "hybrid" && !selectedJD) {
            toast.error("Please select a Job Description for hybrid roadmap");
            return;
        }

        setIsGenerating(true);
        setIsComplete(false); // Reset completion state
        
        try {
            toast.info("Generating your personalized roadmap... This may take a moment.");

            const body: any = { source };
            if (source === "cv" || source === "hybrid") {
                body.cvSource = selectedCV;
            }
            if (source === "cv" && targetRole.trim()) {
                body.targetRole = targetRole.trim();
            }
            if (source === "hybrid") {
                body.jdSource = selectedJD;
            }

            const res = await fetch("/api/roadmap/generate", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

            // Safely parse JSON; handle non-JSON error bodies (e.g. "Internal Server Error")
            const contentType = res.headers.get("content-type") || "";
            let data: any = null;
            let rawBody: string | null = null;

            if (contentType.includes("application/json")) {
                data = await res.json();
            } else {
                rawBody = await res.text();
            }

            // Mark as complete - this triggers the progress bar to go to 100%
            setIsComplete(true);

            if (!res.ok) {
                const message =
                    data?.message ||
                    data?.error ||
                    rawBody ||
                    `Failed to generate roadmap (status ${res.status})`;

                console.error("Roadmap generation failed:", 
                    "status:", res.status,
                    "statusText:", res.statusText,
                    "body:", rawBody,
                    "data:", JSON.stringify(data)
                );

                // 500 "Internal Server Error" often means proxy timed out while backend succeeded
                const likelyTimeout = res.status === 500 && (rawBody === "Internal Server Error" || !data);
                if (likelyTimeout) {
                    toast.warning("Request got a server error, but your roadmap may have been created. Refreshing your roadmaps…");
                    // Wait for progress animation to complete before calling onGenerated
                    setTimeout(() => {
                        setIsGenerating(false);
                        setIsComplete(false);
                        onGenerated();
                    }, 1500);
                } else {
                    toast.error(message);
                    setIsGenerating(false);
                    setIsComplete(false);
                }
                return;
            }

            toast.success("Roadmap generated successfully! 🎉");
            // Wait for the progress bar to show 100% before navigating away
            setTimeout(() => {
                setIsGenerating(false);
                setIsComplete(false);
                onGenerated();
            }, 1500);
        } catch (error) {
            console.error("Roadmap generation error:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to generate roadmap";
            toast.error(errorMessage);
            setIsGenerating(false);
            setIsComplete(false);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 h-full overflow-y-auto w-full max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Sparkles className="h-8 w-8 text-purple-400" />
                        Generate Learning Roadmap
                    </h1>
                    <p className="text-muted-foreground">
                        Create a personalized learning path based on your CV or hybrid (CV + job description).
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onCancel}
                    className="text-white/60 hover:text-white"
                    disabled={isGenerating}
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Show progress bar when generating */}
            {isGenerating && (
                <RoadmapProgress 
                    isGenerating={isGenerating}
                    isComplete={isComplete}
                    onComplete={() => {
                        // Progress animation complete
                        console.log("Progress animation completed - backend finished!");
                    }}
                />
            )}

            {/* Show form only when not generating */}
            {!isGenerating && (
                <Card className="bg-black/20 backdrop-blur-xl border-white/10 text-white shadow-2xl">
                <CardHeader>
                    <CardTitle>Roadmap Source</CardTitle>
                    <CardDescription className="text-white/60">
                        Choose how you want to generate your roadmap
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>Select Source</Label>
                        <Select value={source} onValueChange={(value: any) => setSource(value)}>
                            <SelectTrigger className="bg-black/40 border-white/10 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cv">CV Analysis (Skill Gaps)</SelectItem>
                                <SelectItem value="hybrid">Hybrid (CV + JD)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {(source === "cv" || source === "hybrid") && (
                        <div className="space-y-2">
                            <Label>Select CV</Label>
                            {availableFiles.cv.length > 0 ? (
                                <Select value={selectedCV} onValueChange={setSelectedCV}>
                                    <SelectTrigger className="bg-black/40 border-white/10 text-white">
                                        <SelectValue placeholder="Select a CV..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableFiles.cv.map((cv) => (
                                            <SelectItem key={cv} value={cv}>
                                                {cv}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <p className="text-sm text-white/50">
                                    No CVs found. Upload a CV first in the CV Uploader section.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Target Job Role - only for CV Analysis */}
                    {source === "cv" && (
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Target className="h-4 w-4 text-purple-400" />
                                Target Job Role
                            </Label>
                            <Input
                                placeholder="e.g., Senior Frontend Developer, Data Scientist, DevOps Engineer..."
                                value={targetRole}
                                onChange={(e) => setTargetRole(e.target.value)}
                                className="bg-black/40 border-white/10 text-white placeholder:text-white/40"
                            />
                            <p className="text-xs text-white/50">
                                Enter the job role you&apos;re aiming for. We&apos;ll analyze your CV against industry requirements for this role.
                            </p>
                            
                            {/* Target Role Info Card */}
                            {targetRole.trim() && (
                                <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <Briefcase className="h-4 w-4 text-purple-400 mt-0.5" />
                                        <div>
                                            <p className="text-sm text-purple-300 font-medium">Targeting: {targetRole}</p>
                                            <p className="text-xs text-purple-300/70 mt-1">
                                                Your roadmap will be customized to help you become a qualified {targetRole}.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {source === "hybrid" && (
                        <div className="space-y-2">
                            <Label>Select Job Description</Label>
                            {availableFiles.jd.length > 0 ? (
                                <Select value={selectedJD} onValueChange={setSelectedJD}>
                                    <SelectTrigger className="bg-black/40 border-white/10 text-white">
                                        <SelectValue placeholder="Select a Job Description..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableFiles.jd.map((jd) => (
                                            <SelectItem key={jd} value={jd}>
                                                {jd}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <p className="text-sm text-white/50">
                                    No Job Descriptions found. Upload a JD first in the CV Uploader section.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="pt-4">
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating || 
                                (source === "cv" && (!selectedCV || !targetRole.trim())) ||
                                (source === "hybrid" && (!selectedCV || !selectedJD))}
                            className="w-full bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-900/20"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Generate Roadmap
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
            )}

            {/* Info card - show only when not generating */}
            {!isGenerating && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 text-purple-400">
                    <p className="text-sm font-medium mb-2">💡 How it works:</p>
                    <ul className="text-xs space-y-1 text-purple-300/80">
                        <li>• <strong>CV Analysis:</strong> Enter your target role, and we&apos;ll analyze your CV against industry requirements to identify skill gaps and create a personalized roadmap</li>
                        <li>• <strong>Hybrid:</strong> Combines your CV with a specific job description for targeted skill development</li>
                    </ul>
                </div>
            )}
        </div>
    );
}
