import { useEffect, useState } from "react";
import { BookOpen, Video, GraduationCap, School, ExternalLink, Loader2, Search, AlertCircle, GraduationCap as MITIcon, Book, Laptop } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Resource {
    id: string;
    title: string;
    platform: string;
    url: string;
    thumbnail: string;
    description?: string;
    channel?: string;
    instructors?: string;
    authors?: string;
    duration?: string;
    term?: string;
    level?: string;
    department?: string;
    type?: string;
    role?: string;
    products?: string;
    isbn?: string;
    publishYear?: number;
    subjects?: string;
}

interface ResourcesData {
    youtube: Resource[];
    coursera: Resource[];
    udemy: Resource[];
    mitocw: Resource[];
    microsoftlearn: Resource[];
    openlibrary: Resource[];
}

export function LearningMaterials() {
    const [resources, setResources] = useState<ResourcesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [tabLoading, setTabLoading] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState("youtube");
    const [searching, setSearching] = useState(false);

    const fetchResources = async (topic?: string, platform?: string, isTabChange: boolean = false) => {
        try {
            // If it's a tab change, use tab-specific loading, otherwise use full-page loading
            if (isTabChange && platform) {
                setTabLoading(platform);
            } else {
                setLoading(true);
            }
            setError("");
            const params = new URLSearchParams();
            if (topic) params.append("topic", topic);
            if (platform) params.append("platform", platform);

            const res = await fetch(`/api/learning/resources?${params.toString()}`);
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || "Failed to fetch resources");
            }
            const data = await res.json();
            setResources(data.data);
        } catch (err) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : "Could not load learning materials.";
            setError(errorMessage);
        } finally {
            if (isTabChange && platform) {
                setTabLoading(null);
            } else {
                setLoading(false);
            }
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            fetchResources();
            return;
        }

        try {
            setSearching(true);
            setError("");
            const params = new URLSearchParams({
                query: searchQuery,
                type: activeTab,
                maxResults: "12",
            });

            const res = await fetch(`/api/learning/search?${params.toString()}`);
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || "Search failed");
            }
            const data = await res.json();

            if (data.success && data.data) {
                // Update the active tab's resources with search results
                setResources((prev) => {
                    if (!prev) {
                        return {
                            youtube: [],
                            coursera: [],
                            udemy: [],
                            mitocw: [],
                            microsoftlearn: [],
                            openlibrary: [],
                            [activeTab]: data.data,
                        } as ResourcesData;
                    }
                    return {
                        ...prev,
                        [activeTab]: data.data,
                    };
                });
            }
        } catch (err) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : "Search failed";
            setError(errorMessage);
        } finally {
            setSearching(false);
        }
    };

    useEffect(() => {
        fetchResources();
    }, []);

    useEffect(() => {
        // Fetch resources when tab changes - use tab-specific loading
        if (resources) {
            // Only fetch if resources already exist (not initial load)
            fetchResources(undefined, activeTab, true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

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

    if (!resources) return null;

    const renderResourceCard = (item: Resource) => (
        <Card key={item.id} className="bg-white/5 border-white/10 overflow-hidden hover:bg-white/10 transition-colors group">
            <div className="aspect-video w-full relative overflow-hidden bg-black/50">
                <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                />
                <div className={`absolute inset-0 flex items-center justify-center ${!item.thumbnail ? '' : 'hidden'}`}>
                    <BookOpen className="w-10 h-10 text-white/20" />
                </div>
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-medium text-white/80 border border-white/10">
                    {item.platform}
                </div>
                {item.duration && (
                    <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white font-mono">
                        {item.duration}
                    </div>
                )}
            </div>
            <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base font-semibold text-white/90 line-clamp-2 leading-tight group-hover:text-purple-300 transition-colors">
                    {item.title}
                </CardTitle>
                {(item.channel || item.instructors || item.authors) && (
                    <CardDescription className="text-xs text-white/50">
                        {item.channel 
                            ? `by ${item.channel}` 
                            : item.instructors 
                            ? `Instructors: ${item.instructors}` 
                            : item.authors 
                            ? `by ${item.authors}` 
                            : ''}
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent className="p-4 pt-1 flex-1">
                {item.description && (
                    <p className="text-sm text-white/50 line-clamp-3">
                        {item.description}
                    </p>
                )}
                {(item.term || item.level || item.department || item.type || item.role || item.products || item.subjects || item.publishYear) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {item.department && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60">
                                {item.department}
                            </Badge>
                        )}
                        {item.level && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60">
                                {item.level}
                            </Badge>
                        )}
                        {item.type && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60">
                                {item.type}
                            </Badge>
                        )}
                        {item.term && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60">
                                {item.term}
                            </Badge>
                        )}
                        {item.role && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60">
                                {item.role}
                            </Badge>
                        )}
                        {item.products && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60">
                                {item.products}
                            </Badge>
                        )}
                        {item.publishYear && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60">
                                {item.publishYear}
                            </Badge>
                        )}
                        {item.subjects && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/20 text-white/60">
                                {item.subjects.split(',')[0]}
                            </Badge>
                        )}
                    </div>
                )}
            </CardContent>
            <CardFooter className="p-4 pt-0">
                <Button variant="outline" size="sm" className="w-full border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-purple-500/30" asChild>
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                        <span className="mr-2">Open Resource</span>
                        <ExternalLink className="w-3 h-3" />
                    </a>
                </Button>
            </CardFooter>
        </Card>
    );

    const renderEmptyState = (platform: string) => {
        const platformMessages: Record<string, string> = {
            youtube: "YouTube API integration is being set up. Please configure YOUTUBE_API_KEY in your backend .env file.",
            coursera: "Coursera API integration coming soon. We're working on integrating Coursera courses.",
            udemy: "Udemy API integration coming soon. We're working on integrating Udemy courses.",
            mitocw: "No MIT OCW courses found. Try searching with a different query or topic.",
            microsoftlearn: "No Microsoft Learn resources found. Try searching with a different query or topic.",
            openlibrary: "No Open Library books found. Try searching with a different query or topic.",
        };

        return (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <AlertCircle className="w-12 h-12 text-white/30 mb-4" />
                <h3 className="text-lg font-semibold text-white/70 mb-2">
                    No {platform.charAt(0).toUpperCase() + platform.slice(1)} resources available
                </h3>
                <p className="text-sm text-white/50 max-w-md">
                    {platformMessages[platform] || `${platform} resource integration coming soon.`}
                </p>
            </div>
        );
    };

    return (
        <div className="flex flex-1 flex-col overflow-hidden relative rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white h-full">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/2">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-semibold text-white/90">Learning Materials</h2>
                </div>
                <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/5">
                    Course Platforms
                </Badge>
            </div>

            {/* Search Bar */}
            <div className="p-6 pb-4 border-b border-white/10">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
                        <Input
                            type="text"
                            placeholder="Search for tutorials, courses, or topics..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-purple-500/50"
                        />
                    </div>
                    <Button
                        onClick={handleSearch}
                        disabled={searching}
                        className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/30"
                    >
                        {searching ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Searching...
                            </>
                        ) : (
                            <>
                                <Search className="w-4 h-4 mr-2" />
                                Search
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden p-6 pt-2">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-6 bg-white/5 border border-white/10 mb-6">
                        <TabsTrigger value="youtube" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <Video className="w-4 h-4 mr-2" />
                            YouTube
                        </TabsTrigger>
                        <TabsTrigger value="coursera" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <GraduationCap className="w-4 h-4 mr-2" />
                            Coursera
                        </TabsTrigger>
                        <TabsTrigger value="udemy" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <School className="w-4 h-4 mr-2" />
                            Udemy
                        </TabsTrigger>
                        <TabsTrigger value="mitocw" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <MITIcon className="w-4 h-4 mr-2" />
                            MIT OCW
                        </TabsTrigger>
                        <TabsTrigger value="microsoftlearn" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <Laptop className="w-4 h-4 mr-2" />
                            MS Learn
                        </TabsTrigger>
                        <TabsTrigger value="openlibrary" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <Book className="w-4 h-4 mr-2" />
                            Books
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="youtube" className="flex-1 overflow-hidden mt-0">
                        {tabLoading === "youtube" ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            </div>
                        ) : (
                            <ScrollArea className="h-full pr-4">
                                {resources.youtube && resources.youtube.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                        {resources.youtube.map(renderResourceCard)}
                                    </div>
                                ) : (
                                    renderEmptyState("youtube")
                                )}
                            </ScrollArea>
                        )}
                    </TabsContent>
                    <TabsContent value="coursera" className="flex-1 overflow-hidden mt-0">
                        {tabLoading === "coursera" ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            </div>
                        ) : (
                            <ScrollArea className="h-full pr-4">
                                {resources.coursera && resources.coursera.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                        {resources.coursera.map(renderResourceCard)}
                                    </div>
                                ) : (
                                    renderEmptyState("coursera")
                                )}
                            </ScrollArea>
                        )}
                    </TabsContent>
                    <TabsContent value="udemy" className="flex-1 overflow-hidden mt-0">
                        {tabLoading === "udemy" ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            </div>
                        ) : (
                            <ScrollArea className="h-full pr-4">
                                {resources.udemy && resources.udemy.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                        {resources.udemy.map(renderResourceCard)}
                                    </div>
                                ) : (
                                    renderEmptyState("udemy")
                                )}
                            </ScrollArea>
                        )}
                    </TabsContent>
                    <TabsContent value="mitocw" className="flex-1 overflow-hidden mt-0">
                        {tabLoading === "mitocw" ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            </div>
                        ) : (
                            <ScrollArea className="h-full pr-4">
                                {resources.mitocw && resources.mitocw.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                        {resources.mitocw.map(renderResourceCard)}
                                    </div>
                                ) : (
                                    renderEmptyState("mitocw")
                                )}
                            </ScrollArea>
                        )}
                    </TabsContent>
                    <TabsContent value="microsoftlearn" className="flex-1 overflow-hidden mt-0">
                        {tabLoading === "microsoftlearn" ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            </div>
                        ) : (
                            <ScrollArea className="h-full pr-4">
                                {resources.microsoftlearn && resources.microsoftlearn.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                        {resources.microsoftlearn.map(renderResourceCard)}
                                    </div>
                                ) : (
                                    renderEmptyState("microsoftlearn")
                                )}
                            </ScrollArea>
                        )}
                    </TabsContent>
                    <TabsContent value="openlibrary" className="flex-1 overflow-hidden mt-0">
                        {tabLoading === "openlibrary" ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            </div>
                        ) : (
                            <ScrollArea className="h-full pr-4">
                                {resources.openlibrary && resources.openlibrary.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                        {resources.openlibrary.map(renderResourceCard)}
                                    </div>
                                ) : (
                                    renderEmptyState("openlibrary")
                                )}
                            </ScrollArea>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
