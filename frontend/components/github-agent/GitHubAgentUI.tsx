"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Play, Pause, Square, Github, Loader2, Search, Activity, ChevronRight, BookOpen, Star, User as UserIcon, MapPin, ExternalLink } from "lucide-react"
import { LiveView } from "@/components/github-agent/LiveView"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

interface GitHubAgentUIProps {
    onAnalysisStatusChange?: (isAnalyzing: boolean) => void;
    setLiveFrame?: (frame: string | null) => void;
    setLiveStatus?: (status: string) => void;
}

export function GitHubAgentUI({ onAnalysisStatusChange, setLiveFrame, setLiveStatus }: GitHubAgentUIProps) {
    const [url, setUrl] = useState("")
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [status, setStatus] = useState("Idle")
    const [frame, setFrame] = useState<string | null>(null)
    const [analysis, setAnalysis] = useState<any>(null)
    const [logs, setLogs] = useState<string[]>([])
    const socketRef = useRef<Socket | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        socketRef.current = io("http://localhost:3001")

        socketRef.current.on("frame", (data) => {
            setFrame(data)
            setLiveFrame?.(data)
        })
        socketRef.current.on("status", (data) => {
            setStatus(data)
            setLiveStatus?.(data)
            setLogs(prev => [...prev.slice(-19), data])
        })
        socketRef.current.on("analysis", (data) => setAnalysis((prev: any) => ({ ...prev, ...data })))
        socketRef.current.on("complete", () => {
            setIsAnalyzing(false)
            onAnalysisStatusChange?.(false)
            toast.success("Profile analysis completed successfully!")
        })
        socketRef.current.on("error", (err) => {
            toast.error(`Error: ${err}`)
            setIsAnalyzing(false)
            onAnalysisStatusChange?.(false)
        })

        return () => {
            socketRef.current?.disconnect()
        }
    }, [onAnalysisStatusChange, setLiveFrame, setLiveStatus])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [logs])

    const startAnalysis = () => {
        if (!url.includes("github.com/")) {
            toast.error("Please enter a valid GitHub profile URL")
            return
        }
        setIsAnalyzing(true)
        onAnalysisStatusChange?.(true)
        setAnalysis(null)
        setLogs(["Starting session..."])
        socketRef.current?.emit("start-analysis", url)
    }

    const togglePause = () => {
        if (isPaused) {
            socketRef.current?.emit("resume")
        } else {
            socketRef.current?.emit("pause")
        }
        setIsPaused(!isPaused)
    }

    const stopAnalysis = () => {
        socketRef.current?.emit("stop")
        setIsAnalyzing(false)
        onAnalysisStatusChange?.(false)
        setIsPaused(false)
        setStatus("Stopped")
    }

    return (
        <div className="flex flex-col h-full bg-transparent text-white">
            {/* Control Bar */}
            <div className="flex items-center gap-4 mb-6">
                <div className="relative group w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-white/40 group-focus-within:text-purple-400 transition-colors" />
                    </div>
                    <Input
                        placeholder="https://github.com/username"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="pl-10 h-10 bg-white/5 border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20 text-sm transition-all rounded-full"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={startAnalysis}
                        disabled={isAnalyzing || !url}
                        className="bg-white text-black hover:bg-white/90 font-semibold px-6 rounded-full shadow-lg shadow-white/5 transition-all disabled:opacity-50 h-10"
                    >
                        {isAnalyzing ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing</>
                        ) : (
                            <><Play className="w-4 h-4 mr-2 fill-current" /> Run Agent</>
                        )}
                    </Button>
                    {isAnalyzing && (
                        <>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={togglePause}
                                className="rounded-full border-white/10 hover:bg-white/5 h-10 w-10"
                            >
                                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                            </Button>
                            <Button
                                variant="destructive"
                                size="icon"
                                onClick={stopAnalysis}
                                className="rounded-full shadow-lg shadow-red-500/20 h-10 w-10 border-0"
                            >
                                <Square className="w-4 h-4" />
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex gap-6 h-full overflow-hidden">
                {/* Left side: Console and Stats */}
                <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                    {/* Activity Summary */}
                    <Card className="bg-black/40 border-white/5 shadow-xl flex-1 overflow-hidden flex flex-col">
                        <CardHeader className="py-4 border-b border-white/5">
                            <CardTitle className="text-sm font-medium text-white/80 flex items-center gap-2">
                                <ChevronRight className="w-4 h-4 text-blue-400" /> Analysis Report
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-hidden flex-1">
                            <AnimatePresence mode="wait">
                                {analysis ? (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="p-6 h-full overflow-y-auto"
                                    >
                                        <div className="space-y-8">
                                            {/* Profile Info */}
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 p-0.5">
                                                        <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                                                            <UserIcon className="w-8 h-8 text-white/80" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-bold text-white">{url.split("/").pop()}</h3>
                                                        <div className="flex items-center text-xs text-white/40 mt-1">
                                                            <MapPin className="w-3 h-3 mr-1" />
                                                            {analysis.location || "Earth"}
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-white/70 leading-relaxed italic">
                                                    "{analysis.bio || "No biography provided by user."}"
                                                </p>
                                            </div>

                                            {/* Lifetime Stats */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                                                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Total detected commits</span>
                                                    <div className="text-sm font-bold flex items-center gap-2 text-green-400">
                                                        <Activity className="w-3.5 h-3.5" /> {analysis.totalCommits?.toLocaleString() || "Analyzing..."}
                                                    </div>
                                                </div>
                                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                                                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Achievement count</span>
                                                    <div className="text-sm font-semibold flex items-center gap-2">
                                                        <Star className="w-3.5 h-3.5 text-yellow-500" /> {analysis.achievements || 0}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Contribution History */}
                                            {analysis.yearlyCommits && Object.keys(analysis.yearlyCommits).length > 0 && (
                                                <div className="space-y-4">
                                                    <h4 className="text-xs font-bold text-white/60 uppercase tracking-widest">Yearly Contribution History</h4>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {Object.entries(analysis.yearlyCommits).sort((a, b) => b[0].localeCompare(a[0])).map(([year, count]) => (
                                                            <div key={year} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5">
                                                                <span className="text-xs font-medium text-white/60">{year}</span>
                                                                <Badge variant="secondary" className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">
                                                                    {Number(count).toLocaleString()} commits
                                                                </Badge>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <Separator className="bg-white/10" />

                                            {/* Snapshot Stats */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                                                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Top Repo</span>
                                                    <div className="text-sm font-semibold flex items-center gap-2">
                                                        <BookOpen className="w-3.5 h-3.5 text-blue-400" /> {analysis.topRepo || "Discovering..."}
                                                    </div>
                                                </div>
                                                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                                                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-wider">Tech Focus</span>
                                                    <div className="text-sm font-semibold flex items-center gap-2">
                                                        <Star className="w-3.5 h-3.5 text-yellow-400" /> {analysis.techFocus || "Analyzing..."}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Activity Summary */}
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-bold text-white/60 uppercase tracking-widest">Activity Insights</h4>
                                                    <ExternalLink className="w-3.5 h-3.5 text-white/20" />
                                                </div>
                                                <div className="space-y-3">
                                                    {analysis.insights ? analysis.insights.map((insight: string, id: number) => (
                                                        <div key={id} className="flex items-start gap-3 group">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500/50 mt-1.5 group-hover:bg-purple-500 transition-colors" />
                                                            <p className="text-sm text-white/60 group-hover:text-white/80 transition-colors">{insight}</p>
                                                        </div>
                                                    )) : (
                                                        <div className="space-y-3">
                                                            <div className="h-4 bg-white/5 rounded w-full animate-pulse" />
                                                            <div className="h-4 bg-white/5 rounded w-5/6 animate-pulse" />
                                                            <div className="h-4 bg-white/5 rounded w-4/6 animate-pulse" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                                        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                                            <Github className="w-8 h-8 text-white/20" />
                                        </div>
                                        <h3 className="text-white/80 font-semibold mb-2">No Profile Analyzed</h3>
                                        <p className="text-sm text-white/40">Enter a URL and start the agent to generate an insightful profile report.</p>
                                    </div>
                                )}
                            </AnimatePresence>
                        </CardContent>
                    </Card>

                    {/* Agent Activity Console */}
                    <Card className="h-48 bg-black/40 border-white/5 shadow-xl">
                        <CardHeader className="py-3">
                            <CardTitle className="text-xs font-semibold text-white/40 uppercase tracking-widest">ReAct Loop Console</CardTitle>
                        </CardHeader>
                        <CardContent className="px-6 py-0">
                            <ScrollArea className="h-28 pr-4" ref={scrollRef}>
                                <div className="space-y-3 font-mono text-xs">
                                    {logs.map((log, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="flex gap-3 text-white/60"
                                        >
                                            <span className="text-purple-500/50">[{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                            <span className="flex-1 leading-relaxed">
                                                {log.startsWith("Thinking:") ? (
                                                    <span className="text-blue-400">{log}</span>
                                                ) : log.startsWith("Action:") ? (
                                                    <span className="text-green-400 font-bold">{log}</span>
                                                ) : (
                                                    log
                                                )}
                                            </span>
                                        </motion.div>
                                    ))}
                                    {isAnalyzing && !isPaused && (
                                        <div className="flex items-center gap-2 pt-1">
                                            <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
                                            <span className="text-white/20 italic">Processing next thought...</span>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
