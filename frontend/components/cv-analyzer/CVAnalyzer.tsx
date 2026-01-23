"use client";

import { useState } from "react";
import { useAuth } from "../../context/AuthContext"; // Adjusted path based on location
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface CVAnalyzerProps {
    onUploadComplete?: () => void;
}

export function CVAnalyzer({ onUploadComplete }: CVAnalyzerProps) {
    const { token } = useAuth();
    const [cvFile, setCvFile] = useState<File | null>(null);
    const [jdFile, setJdFile] = useState<File | null>(null);
    const [jdText, setJdText] = useState("");
    const [jdTitle, setJdTitle] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");

    const handleCVChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setCvFile(e.target.files[0]);
        }
    };

    const handleJDFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setJdFile(e.target.files[0]);
        }
    };

    const handleSubmit = async () => {
        if (!cvFile) {
            toast.error("Please upload a CV (PDF).");
            return;
        }
        if (!jdFile && !jdText.trim()) {
            toast.error("Please provide a Job Description.");
            return;
        }
        if (!token) {
            toast.error("You must be logged in.");
            return;
        }

        setIsAnalyzing(true);
        setUploadStatus("idle");

        const formData = new FormData();
        formData.append("cv", cvFile);
        if (jdFile) {
            formData.append("jdFile", jdFile);
        } else {
            formData.append("jdText", jdText);
            if (jdTitle.trim()) {
                formData.append("jdTitle", jdTitle.trim());
            }
        }

        try {
            const res = await fetch("/api/cv/analyze", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData,
            });

            const data = await res.json() as { error?: string; success?: boolean; message?: string };

            if (!res.ok) {
                throw new Error(data.error || "Analysis failed");
            }

            toast.success("CV and Job Description uploaded successfully!");
            setUploadStatus("success");
            // Refresh file list after successful upload
            if (onUploadComplete) {
                // Add a small delay to ensure database is updated
                setTimeout(() => {
                    onUploadComplete();
                }, 500);
            }
        } catch (error) {
            console.error("Analysis Error:", error);
            const errorMessage = error instanceof Error ? error.message : "Something went wrong.";
            toast.error(errorMessage);
            setUploadStatus("error");
        } finally {
            setIsAnalyzing(false);
        }
    };


    return (
        <div className="flex flex-1 flex-col gap-6 p-6 h-full overflow-y-auto w-full max-w-4xl mx-auto">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                    <FileText className="h-8 w-8 text-purple-400" />
                    CV Analyzer
                </h1>
                <p className="text-muted-foreground">
                    Upload your CV and a Job Description to get personalized insights and semantic match analysis.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* CV Upload Section */}
                <Card className="bg-black/20 backdrop-blur-xl border-white/10 text-white shadow-2xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-400" />
                            Upload CV
                        </CardTitle>
                        <CardDescription className="text-white/60">
                            Upload your Curriculum Vitae (PDF only).
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid w-full items-center gap-4">
                            <div className="flex flex-col space-y-1.5">
                                <Label htmlFor="cv-upload">CV File</Label>
                                <div className="flex items-center justify-center w-full">
                                    <label
                                        htmlFor="cv-upload"
                                        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-white/5 border-white/20 transition-colors"
                                    >
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            {cvFile ? (
                                                <>
                                                    <CheckCircle className="w-8 h-8 mb-3 text-green-500" />
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
                                        <Input
                                            id="cv-upload"
                                            type="file"
                                            className="hidden"
                                            accept=".pdf"
                                            onChange={handleCVChange}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Job Description Section */}
                <Card className="bg-black/20 backdrop-blur-xl border-white/10 text-white shadow-2xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-purple-400" />
                            Job Description
                        </CardTitle>
                        <CardDescription className="text-white/60">
                            Provide the Job Description (File or Text).
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="text" className="w-full">
                            <TabsList className="grid w-full grid-cols-2 bg-white/5">
                                <TabsTrigger value="text">Paste Text</TabsTrigger>
                                <TabsTrigger value="file">Upload File</TabsTrigger>
                            </TabsList>
                            <TabsContent value="text" className="mt-4">
                                <div className="grid w-full gap-4">
                                    <div className="grid w-full gap-2">
                                        <Label htmlFor="jd-title">Job Title</Label>
                                        <Input
                                            id="jd-title"
                                            placeholder="e.g., Software Engineer - Google"
                                            className="bg-black/40 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-purple-500/50"
                                            value={jdTitle}
                                            onChange={(e) => setJdTitle(e.target.value)}
                                        />
                                        <p className="text-xs text-white/50">
                                            Give your job description a name to easily identify it later
                                        </p>
                                    </div>
                                    <div className="grid w-full gap-2">
                                        <Label htmlFor="jd-text">Job Description Text</Label>
                                        <Textarea
                                            id="jd-text"
                                            placeholder="Paste the job description here..."
                                            className="min-h-[150px] bg-black/40 border-white/10 text-white placeholder:text-white/30 resize-none focus-visible:ring-purple-500/50"
                                            value={jdText}
                                            onChange={(e) => setJdText(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </TabsContent>
                            <TabsContent value="file" className="mt-4">
                                <div className="grid w-full items-center gap-4">
                                    <div className="flex flex-col space-y-1.5">
                                        <Label htmlFor="jd-upload">Job Description File</Label>
                                        <div className="flex items-center justify-center w-full">
                                            <label
                                                htmlFor="jd-upload"
                                                className="flex flex-col items-center justify-center w-full h-[150px] border-2 border-dashed rounded-lg cursor-pointer hover:bg-white/5 border-white/20 transition-colors"
                                            >
                                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                    {jdFile ? (
                                                        <>
                                                            <CheckCircle className="w-8 h-8 mb-3 text-green-500" />
                                                            <p className="mb-2 text-sm text-gray-200 font-medium">{jdFile.name}</p>
                                                            <p className="text-xs text-gray-400">Click to replace</p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload className="w-8 h-8 mb-3 text-gray-400" />
                                                            <p className="mb-2 text-sm text-gray-400">
                                                                <span className="font-semibold">Click to upload</span>
                                                            </p>
                                                            <p className="text-xs text-gray-500">PDF, DOCX, TXT</p>
                                                        </>
                                                    )}
                                                </div>
                                                <Input
                                                    id="jd-upload"
                                                    type="file"
                                                    className="hidden"
                                                    accept=".pdf,.docx,.txt"
                                                    onChange={handleJDFileChange}
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-end gap-3 pt-4">
                <Button
                    size="lg"
                    variant="outline"
                    onClick={handleSubmit}
                    disabled={isAnalyzing}
                    className="border-white/10 text-white hover:bg-white/10"
                >
                    {isAnalyzing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Uploading...
                        </>
                    ) : (
                        "Upload to Database"
                    )}
                </Button>
            </div>

            {uploadStatus === "success" && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-green-400 flex items-center gap-3">
                    <CheckCircle className="h-5 w-5" />
                    <div>
                        <p className="font-medium">Files Processed Successfully</p>
                        <p className="text-sm opacity-90">Your CV and Job Description have been saved to the database. You can now chat about them.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
