"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, AlertCircle, TrendingUp, Target, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MatchedSection {
    cvSection: string;
    similarity: number;
    sectionType: string;
}

interface RequirementMatch {
    requirement: string;
    requirementType: string;
    matchedSections: MatchedSection[];
    matchScore: number;
    status: "matched" | "partially_matched" | "not_matched";
}

interface MatchResult {
    matchId: string;
    userId: string;
    cvSource: string;
    jdSource: string;
    overallScore: number;
    timestamp: string;
    requirements: RequirementMatch[];
    summary: {
        totalRequirements: number;
        matchedRequirements: number;
        partiallyMatchedRequirements: number;
        unmatchedRequirements: number;
        averageScore: number;
    };
    recommendations: string[];
}

interface SemanticMatchResultsProps {
    matchResult: MatchResult;
}

export function SemanticMatchResults({ matchResult }: SemanticMatchResultsProps) {
    const getStatusIcon = (status: RequirementMatch["status"]) => {
        switch (status) {
            case "matched":
                return <CheckCircle2 className="w-5 h-5 text-green-400" />;
            case "partially_matched":
                return <AlertCircle className="w-5 h-5 text-yellow-400" />;
            case "not_matched":
                return <XCircle className="w-5 h-5 text-red-400" />;
        }
    };

    const getStatusBadge = (status: RequirementMatch["status"]) => {
        switch (status) {
            case "matched":
                return (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        Matched
                    </Badge>
                );
            case "partially_matched":
                return (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        Partially Matched
                    </Badge>
                );
            case "not_matched":
                return (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                        Not Matched
                    </Badge>
                );
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 0.75) return "text-green-400";
        if (score >= 0.6) return "text-yellow-400";
        return "text-red-400";
    };

    return (
        <div className="flex flex-1 flex-col gap-6 p-6 h-full overflow-y-auto w-full max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                            <Target className="h-8 w-8 text-purple-400" />
                            Semantic Match Results
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            AI-powered semantic analysis of your CV against the job description
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-white/60">Overall Match Score</div>
                        <div className={cn("text-4xl font-bold", getScoreColor(matchResult.overallScore))}>
                            {(matchResult.overallScore * 100).toFixed(0)}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-black/20 backdrop-blur-xl border-white/10 text-white">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-white/60">Total Requirements</CardDescription>
                        <CardTitle className="text-2xl">{matchResult.summary.totalRequirements}</CardTitle>
                    </CardHeader>
                </Card>
                <Card className="bg-green-500/10 backdrop-blur-xl border-green-500/20 text-white">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-green-400/80">Matched</CardDescription>
                        <CardTitle className="text-2xl text-green-400">
                            {matchResult.summary.matchedRequirements}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card className="bg-yellow-500/10 backdrop-blur-xl border-yellow-500/20 text-white">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-yellow-400/80">Partially Matched</CardDescription>
                        <CardTitle className="text-2xl text-yellow-400">
                            {matchResult.summary.partiallyMatchedRequirements}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card className="bg-red-500/10 backdrop-blur-xl border-red-500/20 text-white">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-red-400/80">Not Matched</CardDescription>
                        <CardTitle className="text-2xl text-red-400">
                            {matchResult.summary.unmatchedRequirements}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Progress Bar */}
            <Card className="bg-black/20 backdrop-blur-xl border-white/10 text-white">
                <CardContent className="pt-6">
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-white/80">Match Progress</span>
                            <span className="text-white/80">
                                {matchResult.summary.matchedRequirements} / {matchResult.summary.totalRequirements} requirements
                            </span>
                        </div>
                        <Progress 
                            value={(matchResult.summary.matchedRequirements / matchResult.summary.totalRequirements) * 100} 
                            className="h-3 bg-white/5"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Recommendations */}
            {matchResult.recommendations.length > 0 && (
                <Card className="bg-purple-500/10 backdrop-blur-xl border-purple-500/20 text-white">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-purple-400" />
                            Recommendations
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {matchResult.recommendations.map((rec, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                    <span className="text-purple-400 mt-1">•</span>
                                    <span className="text-white/80">{rec}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {/* Requirements Breakdown */}
            <Card className="bg-black/20 backdrop-blur-xl border-white/10 text-white">
                <CardHeader>
                    <CardTitle>Requirements Analysis</CardTitle>
                    <CardDescription className="text-white/60">
                        Detailed breakdown of each requirement and how it matches your CV
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[600px] pr-4">
                        <div className="space-y-4">
                            {matchResult.requirements.map((req, index) => (
                                <Card
                                    key={index}
                                    className={cn(
                                        "bg-white/5 border",
                                        req.status === "matched" && "border-green-500/30",
                                        req.status === "partially_matched" && "border-yellow-500/30",
                                        req.status === "not_matched" && "border-red-500/30"
                                    )}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 flex-1">
                                                {getStatusIcon(req.status)}
                                                <div className="flex-1">
                                                    <CardTitle className="text-base font-semibold text-white/90">
                                                        {req.requirement}
                                                    </CardTitle>
                                                    <div className="flex items-center gap-2 mt-2">
                                                        <Badge variant="outline" className="border-white/10 text-white/60 text-xs">
                                                            {req.requirementType}
                                                        </Badge>
                                                        {getStatusBadge(req.status)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={cn("text-2xl font-bold", getScoreColor(req.matchScore))}>
                                                    {(req.matchScore * 100).toFixed(0)}%
                                                </div>
                                                <div className="text-xs text-white/40">Similarity</div>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    {req.matchedSections.length > 0 && (
                                        <CardContent className="pt-0">
                                            <div className="space-y-2">
                                                <div className="text-sm font-medium text-white/70 mb-2">
                                                    Matched CV Sections:
                                                </div>
                                                {req.matchedSections.map((section, secIndex) => (
                                                    <div
                                                        key={secIndex}
                                                        className="bg-white/5 rounded-lg p-3 border border-white/10"
                                                    >
                                                        <div className="flex items-start justify-between gap-2 mb-1">
                                                            <Badge variant="outline" className="border-white/10 text-white/60 text-xs">
                                                                {section.sectionType}
                                                            </Badge>
                                                            <span className="text-xs text-white/60">
                                                                {(section.similarity * 100).toFixed(1)}% match
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-white/70 mt-2 line-clamp-2">
                                                            "{section.cvSection}"
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    )}
                                    {req.matchedSections.length === 0 && (
                                        <CardContent className="pt-0">
                                            <div className="text-sm text-white/50 italic">
                                                No matching sections found in your CV for this requirement.
                                            </div>
                                        </CardContent>
                                    )}
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-white/40 pt-4 border-t border-white/10">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(matchResult.timestamp).toLocaleString()}</span>
                    </div>
                    <span>CV: {matchResult.cvSource}</span>
                    <span>JD: {matchResult.jdSource}</span>
                </div>
                <span>Match ID: {matchResult.matchId}</span>
            </div>
        </div>
    );
}
