"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

interface RoadmapGeneratorProps {
    onGenerated: () => void;
    onCancel: () => void;
}

export function RoadmapGenerator({ onGenerated, onCancel }: RoadmapGeneratorProps) {
    const { token } = useAuth();
    const [source, setSource] = useState<"profile" | "cv" | "jd" | "hybrid">("profile");
    const [availableFiles, setAvailableFiles] = useState<{ cv: string[], jd: string[] }>({ cv: [], jd: [] });
    const [selectedCV, setSelectedCV] = useState<string>("");
    const [selectedJD, setSelectedJD] = useState<string>("");
    const [isGenerating, setIsGenerating] = useState(false);

    // Fetch available files
    useEffect(() => {
        if (token && (source === "cv" || source === "jd" || source === "hybrid")) {
            fetchFiles();
        }
    }, [token, source]);

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
        if ((source === "jd" || source === "hybrid") && !selectedJD) {
            toast.error("Please select a Job Description for JD or hybrid roadmap");
            return;
        }

        setIsGenerating(true);
        try {
            toast.info("Generating your personalized roadmap... This may take a moment.");

            const body: any = { source };
            if (source === "cv" || source === "hybrid") {
                body.cvSource = selectedCV;
            }
            if (source === "jd" || source === "hybrid") {
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

                toast.error(message);
                return;
            }

            toast.success("Roadmap generated successfully! 🎉");
            onGenerated();
        } catch (error) {
            console.error("Roadmap generation error:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to generate roadmap";
            toast.error(errorMessage);
        } finally {
            setIsGenerating(false);
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
                        Create a personalized learning path based on your profile, CV, or job requirements.
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onCancel}
                    className="text-white/60 hover:text-white"
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

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
                                <SelectItem value="profile">Profile-Based (Learning Goals)</SelectItem>
                                <SelectItem value="cv">CV Analysis (Skill Gaps)</SelectItem>
                                <SelectItem value="jd">Job Description (Requirements)</SelectItem>
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

                    {(source === "jd" || source === "hybrid") && (
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
                                (source === "cv" && !selectedCV) ||
                                (source === "jd" && !selectedJD) ||
                                (source === "hybrid" && (!selectedCV || !selectedJD))}
                            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-900/20"
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

            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 text-purple-400">
                <p className="text-sm font-medium mb-2">💡 How it works:</p>
                <ul className="text-xs space-y-1 text-purple-300/80">
                    <li>• <strong>Profile-Based:</strong> Creates roadmap from your learning goals and preferences</li>
                    <li>• <strong>CV Analysis:</strong> Identifies skill gaps and creates roadmap to fill them</li>
                    <li>• <strong>Job Description:</strong> Generates roadmap to meet specific job requirements</li>
                    <li>• <strong>Hybrid:</strong> Combines CV and JD analysis for targeted skill development</li>
                </ul>
            </div>
        </div>
    );
}
