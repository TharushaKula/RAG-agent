"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { SemanticMatchResults } from "../cv-analyzer/SemanticMatchResults";

interface MatchResult {
    matchId: string;
    userId: string;
    cvSource: string;
    jdSource: string;
    overallScore: number;
    timestamp: string;
    requirements: Array<{
        requirement: string;
        requirementType: string;
        matchedSections: Array<{
            cvSection: string;
            similarity: number;
            sectionType: string;
        }>;
        matchScore: number;
        status: "matched" | "partially_matched" | "not_matched";
    }>;
    summary: {
        totalRequirements: number;
        matchedRequirements: number;
        partiallyMatchedRequirements: number;
        unmatchedRequirements: number;
        averageScore: number;
    };
    recommendations: string[];
}

export function SemanticMatcher() {
    const { token } = useAuth();
    const [availableFiles, setAvailableFiles] = useState<{ cv: string[], jd: string[] }>({ cv: [], jd: [] });
    const [selectedCV, setSelectedCV] = useState<string>("");
    const [selectedJD, setSelectedJD] = useState<string>("");
    const [cvFile, setCvFile] = useState<File | null>(null);
    const [jdFile, setJdFile] = useState<File | null>(null);
    const [jdText, setJdText] = useState("");
    const [jdTitle, setJdTitle] = useState("");
    const [useDatabaseCV, setUseDatabaseCV] = useState(true);
    const [useDatabaseJD, setUseDatabaseJD] = useState(true);
    const [isMatching, setIsMatching] = useState(false);
    const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

    // Fetch available files
    const fetchFiles = async () => {
        if (!token) return;
        try {
            const res = await fetch("/api/cv/files", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableFiles(data);
                // Auto-select first available if not selected
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

    useEffect(() => {
        fetchFiles();
    }, [token]);

    const handleCVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setCvFile(e.target.files[0]);
            setUseDatabaseCV(false);
        }
    };

    const handleJDFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setJdFile(e.target.files[0]);
            setUseDatabaseJD(false);
        }
    };

    const handleCVSelect = (value: string) => {
        setSelectedCV(value);
        setUseDatabaseCV(true);
        setCvFile(null);
    };

    const handleJDSelect = (value: string) => {
        setSelectedJD(value);
        setUseDatabaseJD(true);
        setJdFile(null);
        setJdText("");
    };

    const handleMatch = async () => {
        if (!token) {
            toast.error("You must be logged in.");
            return;
        }

        // Validate CV
        if (useDatabaseCV && !selectedCV) {
            toast.error("Please select a CV from the database or upload a new one.");
            return;
        }
        if (!useDatabaseCV && !cvFile) {
            toast.error("Please upload a CV file.");
            return;
        }

        // Validate JD
        if (useDatabaseJD && !selectedJD) {
            toast.error("Please select a Job Description from the database, upload a file, or enter text.");
            return;
        }
        if (!useDatabaseJD && !jdFile && !jdText.trim()) {
            toast.error("Please provide a Job Description.");
            return;
        }

        setIsMatching(true);
        setMatchResult(null);

        try {
            toast.info("Performing semantic analysis... This may take a moment.");

            const formData = new FormData();
            
            // Add CV
            if (useDatabaseCV) {
                formData.append("cvSource", selectedCV);
            } else if (cvFile) {
                formData.append("cv", cvFile);
            }

            // Add JD
            if (useDatabaseJD) {
                formData.append("jdSource", selectedJD);
            } else if (jdFile) {
                formData.append("jdFile", jdFile);
            } else if (jdText.trim()) {
                formData.append("jdText", jdText);
                if (jdTitle.trim()) {
                    formData.append("jdTitle", jdTitle.trim());
                }
            }

            const res = await fetch("/api/cv/semantic-match", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData,
            });

            const data = await res.json() as {
                error?: string;
                details?: string;
                matchResult?: MatchResult;
                success?: boolean;
            };

            if (!res.ok) {
                throw new Error(data.error || data.details || "Semantic matching failed");
            }

            if (!data.matchResult) {
                throw new Error("No match result returned");
            }

            setMatchResult(data.matchResult);
            toast.success(`Semantic matching complete! Overall score: ${(data.matchResult.overallScore * 100).toFixed(0)}%`);
        } catch (error) {
            console.error("Semantic Match Error:", error);
            const errorMessage = error instanceof Error ? error.message : "Semantic matching failed. Make sure the embedding service is running.";
            toast.error(errorMessage);
        } finally {
            setIsMatching(false);
        }
    };

    // Show results if available
    if (matchResult) {
        return (
            <div className="flex flex-1 flex-col h-full overflow-hidden">
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-white">Semantic Match Results</h2>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setMatchResult(null);
                        }}
                        className="border-white/10 text-white hover:bg-white/10"
                    >
                        New Analysis
                    </Button>
                </div>
                <div className="flex-1 overflow-hidden">
                    <SemanticMatchResults matchResult={matchResult} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 h-full overflow-y-auto w-full max-w-4xl mx-auto">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Sparkles className="h-8 w-8 text-purple-400" />
                    Semantic Match Analyzer
                </h1>
                <p className="text-muted-foreground">
                    Analyze how well your CV matches a job description using AI-powered semantic understanding.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* CV Selection Section */}
                <Card className="bg-black/20 backdrop-blur-xl border-white/10 text-white shadow-2xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-400" />
                            Select CV
                        </CardTitle>
                        <CardDescription className="text-white/60">
                            Choose from uploaded CVs or upload a new one.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {availableFiles.cv.length > 0 && (
                            <div className="space-y-2">
                                <Label>Select from Database</Label>
                                <Select value={useDatabaseCV ? selectedCV : ""} onValueChange={handleCVSelect}>
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
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Or Upload New CV</Label>
                            <div className="flex items-center justify-center w-full">
                                <label
                                    htmlFor="cv-upload"
                                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-white/5 border-white/20 transition-colors"
                                >
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                        {cvFile ? (
                                            <>
                                                <FileText className="w-8 h-8 mb-3 text-green-500" />
                                                <p className="mb-2 text-sm text-gray-200 font-medium">{cvFile.name}</p>
                                                <p className="text-xs text-gray-400">Click to replace</p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-8 h-8 mb-3 text-gray-400" />
                                                <p className="mb-2 text-sm text-gray-400">
                                                    <span className="font-semibold">Click to upload</span> or drag and drop
                                                </p>
                                                <p className="text-xs text-gray-500">PDF (MAX. 5MB)</p>
                                            </>
                                        )}
                                    </div>
                                    <input
                                        id="cv-upload"
                                        type="file"
                                        className="hidden"
                                        accept=".pdf"
                                        onChange={handleCVFileChange}
                                    />
                                </label>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* JD Selection Section */}
                <Card className="bg-black/20 backdrop-blur-xl border-white/10 text-white shadow-2xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-purple-400" />
                            Select Job Description
                        </CardTitle>
                        <CardDescription className="text-white/60">
                            Choose from uploaded JDs, upload a file, or paste text.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {availableFiles.jd.length > 0 && (
                            <div className="space-y-2">
                                <Label>Select from Database</Label>
                                <Select value={useDatabaseJD ? selectedJD : ""} onValueChange={handleJDSelect}>
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
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Or Upload File</Label>
                            <div className="flex items-center justify-center w-full">
                                <label
                                    htmlFor="jd-upload"
                                    className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-white/5 border-white/20 transition-colors"
                                >
                                    <div className="flex flex-col items-center justify-center pt-3 pb-3">
                                        {jdFile ? (
                                            <>
                                                <FileText className="w-6 h-6 mb-2 text-green-500" />
                                                <p className="text-xs text-gray-200 font-medium">{jdFile.name}</p>
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-6 h-6 mb-2 text-gray-400" />
                                                <p className="text-xs text-gray-400">Upload PDF, DOCX, TXT</p>
                                            </>
                                        )}
                                    </div>
                                    <input
                                        id="jd-upload"
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.docx,.txt"
                                        onChange={handleJDFileChange}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Or Paste Text</Label>
                            <textarea
                                placeholder="Paste job description text here..."
                                className="w-full min-h-[100px] p-3 bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-white/30 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                value={jdText}
                                onChange={(e) => {
                                    setJdText(e.target.value);
                                    setUseDatabaseJD(false);
                                    setJdFile(null);
                                }}
                            />
                            {jdText && (
                                <div className="space-y-2">
                                    <Label htmlFor="jd-title">Job Title (Optional)</Label>
                                    <input
                                        id="jd-title"
                                        type="text"
                                        placeholder="e.g., Software Engineer - Google"
                                        className="w-full p-2 bg-black/40 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                        value={jdTitle}
                                        onChange={(e) => setJdTitle(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-end gap-3 pt-4">
                <Button
                    size="lg"
                    onClick={handleMatch}
                    disabled={isMatching}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg shadow-purple-900/20"
                >
                    {isMatching ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Analyzing...
                        </>
                    ) : (
                        <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            Run Semantic Match
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
