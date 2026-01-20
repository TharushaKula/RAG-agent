import { useEffect, useState } from "react";
import { BookOpen, Video, FileText, Headphones, Wrench, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Resource {
    id: string;
    title: string;
    platform: string;
    url: string;
    thumbnail: string;
    description?: string;
    channel?: string;
    duration?: string;
}

interface ResourcesData {
    visual: Resource[];
    auditory: Resource[];
    reading: Resource[];
    kinesthetic: Resource[];
}

export function LearningMaterials() {
    const [resources, setResources] = useState<ResourcesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchResources = async () => {
            try {
                const res = await fetch("/api/learning/resources");
                if (!res.ok) throw new Error("Failed to fetch resources");
                const data = await res.json();
                setResources(data.data);
            } catch (err: any) {
                console.error(err);
                setError("Could not load learning materials.");
            } finally {
                setLoading(false);
            }
        };

        fetchResources();
    }, []);

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
                {item.channel && (
                    <CardDescription className="text-xs text-white/50">
                        by {item.channel}
                    </CardDescription>
                )}
            </CardHeader>
            <CardContent className="p-4 pt-1 flex-1">
                {item.description && (
                    <p className="text-sm text-white/50 line-clamp-3">
                        {item.description}
                    </p>
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

    return (
        <div className="flex flex-1 flex-col overflow-hidden relative rounded-xl bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl text-white h-full">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-purple-400" />
                    <h2 className="text-lg font-semibold text-white/90">Learning Materials</h2>
                </div>
                <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/5">
                    Curated Resources
                </Badge>
            </div>

            <div className="flex-1 overflow-hidden p-6 pt-2">
                <Tabs defaultValue="visual" className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-4 bg-white/5 border border-white/10 mb-6">
                        <TabsTrigger value="visual" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <Video className="w-4 h-4 mr-2" />
                            Visual
                        </TabsTrigger>
                        <TabsTrigger value="auditory" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <Headphones className="w-4 h-4 mr-2" />
                            Auditory
                        </TabsTrigger>
                        <TabsTrigger value="reading" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <FileText className="w-4 h-4 mr-2" />
                            Reading/Writing
                        </TabsTrigger>
                        <TabsTrigger value="kinesthetic" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">
                            <Wrench className="w-4 h-4 mr-2" />
                            Kinesthetic
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="visual" className="flex-1 overflow-hidden mt-0">
                        <ScrollArea className="h-full pr-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                {resources.visual.map(renderResourceCard)}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                    <TabsContent value="auditory" className="flex-1 overflow-hidden mt-0">
                        <ScrollArea className="h-full pr-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                {resources.auditory.map(renderResourceCard)}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                    <TabsContent value="reading" className="flex-1 overflow-hidden mt-0">
                        <ScrollArea className="h-full pr-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                {resources.reading.map(renderResourceCard)}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                    <TabsContent value="kinesthetic" className="flex-1 overflow-hidden mt-0">
                        <ScrollArea className="h-full pr-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-6">
                                {resources.kinesthetic.map(renderResourceCard)}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
