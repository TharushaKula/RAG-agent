"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Loader2, TrendingUp, ExternalLink, Clock, User, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NewsItem {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    time: number;
    descendants: number;
    image?: string | null;
    description?: string | null;
}

export function IndustryInfo() {
    const { token } = useAuth();
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchNews = async () => {
            try {
                const res = await fetch("/api/industry/trends");
                if (!res.ok) throw new Error("Failed to fetch trends");
                const data = await res.json();
                setNews(data.data);
            } catch (err: any) {
                console.error(err);
                setError("Could not load industry trends.");
            } finally {
                setLoading(false);
            }
        };

        fetchNews();
    }, []);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const getDomain = (url: string) => {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return 'news.ycombinator.com';
        }
    };

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-1 items-center justify-center h-full text-muted-foreground">
                {error}
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col overflow-hidden relative rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white h-full">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-semibold text-white/90">Tech Pulse</h2>
                </div>
                <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/5">
                    Top Trending
                </Badge>
            </div>

            <ScrollArea className="flex-1 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                    {news.map((item) => (
                        <a
                            key={item.id}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col rounded-xl bg-white/5 border border-white/10 overflow-hidden hover:bg-white/10 hover:border-purple-500/30 transition-all hover:scale-[1.02] hover:shadow-xl h-full"
                        >
                            {/* Image Section */}
                            <div className="aspect-video w-full bg-white/5 relative overflow-hidden">
                                {item.image ? (
                                    <img
                                        src={item.image}
                                        alt={item.title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />
                                ) : null}
                                <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-blue-500/20 ${item.image ? 'hidden' : ''}`}>
                                    <TrendingUp className="w-10 h-10 text-white/20" />
                                </div>
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-medium text-white/80 border border-white/10">
                                    {getDomain(item.url)}
                                </div>
                            </div>

                            {/* Content Section */}
                            <div className="p-4 flex flex-col flex-1">
                                <h3 className="font-semibold text-base text-white/90 mb-2 line-clamp-2 leading-tight group-hover:text-purple-300 transition-colors">
                                    {item.title}
                                </h3>

                                {item.description && (
                                    <p className="text-sm text-white/50 line-clamp-3 mb-4 flex-1">
                                        {item.description}
                                    </p>
                                )}

                                <div className="mt-auto pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/40">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1">
                                            <TrendingUp className="w-3 h-3" />
                                            <span>{item.score}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>{formatTime(item.time)}</span>
                                        </div>
                                    </div>
                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-purple-400" />
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
