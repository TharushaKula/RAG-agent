"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Loader2, Headphones, ExternalLink, User, Music, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Podcast {
    id: number;
    name: string;
    artist: string;
    artwork: string;
    genre: string;
    url: string;
    trackCount: number;
    description: string;
}

interface PodcastsResponse {
    success: boolean;
    podcasts: Podcast[];
    searchTerm: string;
}

export function Podcasts() {
    const { token } = useAuth();
    const [podcasts, setPodcasts] = useState<Podcast[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [searchInput, setSearchInput] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchPodcasts = async (term?: string) => {
        if (!token) return;

        try {
            setLoading(true);
            setError("");
            const url = term
                ? `/api/podcasts?term=${encodeURIComponent(term)}`
                : "/api/podcasts";
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || data.error || "Failed to fetch podcasts");
            }

            const data: PodcastsResponse = await res.json();
            setPodcasts(data.podcasts || []);
            setSearchTerm(data.searchTerm || "");
        } catch (err: any) {
            console.error("Podcasts fetch error:", err);
            setError(err.message || "Could not load podcasts.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPodcasts();
    }, [token]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        const term = searchInput.trim();
        if (term) {
            fetchPodcasts(term);
        } else {
            fetchPodcasts(); // Reset to profile-based
        }
    };

    const handleClearSearch = () => {
        setSearchInput("");
        fetchPodcasts();
    };

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center h-full min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-purple-400" />
                    <p className="text-sm text-white/60">Fetching podcasts based on your profile...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
                <Headphones className="h-12 w-12 text-white/30 mb-4" />
                <p className="text-white/80 mb-2">{error}</p>
                <p className="text-sm text-white/50">
                    Update your target profession and learning goals in Profile for personalized recommendations.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col overflow-hidden relative rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white h-full">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-2">
                    <Headphones className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-semibold text-white/90">Podcasts for You</h2>
                </div>
                {searchTerm && (
                    <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/5 text-xs">
                        Based on: {searchTerm}
                    </Badge>
                )}
            </div>

            <div className="p-4 border-b border-white/5 space-y-3">
                <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <Input
                            placeholder="Search podcasts by topic, skill, or keyword..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="pl-9 bg-black/40 border-white/10 text-white placeholder:text-white/40"
                        />
                    </div>
                    <Button
                        type="submit"
                        variant="secondary"
                        className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                    >
                        Search
                    </Button>
                    {searchInput && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleClearSearch}
                            className="text-white/60 hover:text-white shrink-0"
                        >
                            Clear
                        </Button>
                    )}
                </form>
                <p className="text-xs text-white/50">
                    {searchInput.trim() ? `Showing results for "${searchInput.trim()}"` : "10 podcasts tailored to your profile — or search above"}
                </p>
            </div>

            <ScrollArea className="flex-1 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                    {podcasts.map((podcast) => (
                        <Card
                            key={podcast.id}
                            className="bg-black/20 border-white/10 hover:bg-white/5 transition-colors overflow-hidden"
                        >
                            <CardContent className="p-4 flex gap-4">
                                <div className="shrink-0">
                                    <img
                                        src={podcast.artwork}
                                        alt={podcast.name}
                                        className="w-20 h-20 rounded-lg object-cover"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-white/90 truncate">{podcast.name}</h3>
                                    <div className="flex items-center gap-2 mt-1 text-sm text-white/60">
                                        <User className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{podcast.artist}</span>
                                    </div>
                                    {podcast.genre && (
                                        <Badge
                                            variant="outline"
                                            className="mt-2 text-[10px] border-white/20 text-white/60"
                                        >
                                            <Music className="w-3 h-3 mr-1" />
                                            {podcast.genre}
                                        </Badge>
                                    )}
                                    {podcast.trackCount > 0 && (
                                        <p className="text-xs text-white/40 mt-1">{podcast.trackCount} episodes</p>
                                    )}
                                    <a
                                        href={podcast.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 mt-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        Listen on Apple Podcasts
                                    </a>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {podcasts.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Headphones className="h-16 w-16 text-white/20 mb-4" />
                        <p className="text-white/60">
                            {searchInput.trim()
                                ? `No podcasts found for "${searchInput.trim()}". Try a different search term.`
                                : "No podcasts found for your profile."}
                        </p>
                        <p className="text-sm text-white/40 mt-1">
                            {searchInput.trim()
                                ? "Try broader keywords like 'technology', 'career', or 'learning'"
                                : "Update your target profession in Profile or use the search above."}
                        </p>
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
