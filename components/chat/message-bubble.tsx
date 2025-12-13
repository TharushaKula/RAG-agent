import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User, Bot, FileText } from "lucide-react";

interface Source {
    source: string;
    content: string;
}

interface MessageProps {
    role: "user" | "assistant";
    content: string;
    sources?: Source[];
}

export function MessageBubble({ role, content, sources }: MessageProps) {
    return (
        <div
            className={cn(
                "flex w-full items-start gap-3 p-4",
                role === "user" ? "justify-end" : "justify-start"
            )}
        >
            {role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Bot size={16} />
                </div>
            )}

            <div className={cn("flex flex-col gap-2 max-w-[80%]", role === "user" ? "items-end" : "items-start")}>
                <div
                    className={cn(
                        "rounded-lg px-4 py-3 text-sm",
                        role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground border"
                    )}
                >
                    <div className="whitespace-pre-wrap">{content}</div>
                </div>

                {role === "assistant" && sources && sources.length > 0 && (
                    <Accordion type="single" collapsible className="w-full border rounded-md bg-background/50">
                        <AccordionItem value="sources" className="border-none">
                            <AccordionTrigger className="px-3 py-2 text-xs text-muted-foreground hover:no-underline">
                                <div className="flex items-center gap-1">
                                    <FileText size={12} />
                                    <span>View Promped Sources ({sources.length})</span>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-3 pb-3 text-xs text-muted-foreground">
                                <div className="flex flex-col gap-2">
                                    {sources.map((src, idx) => (
                                        <div key={idx} className="flex flex-col gap-1 border-b last:border-0 pb-2 last:pb-0">
                                            <span className="font-semibold text-[10px] uppercase tracking-wider opacity-70">Source {idx + 1}</span>
                                            <p className="line-clamp-3 italic">{src.content}</p>
                                            <span className="text-[10px] opacity-50">{src.source}</span>
                                        </div>
                                    ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}
            </div>

            {role === "user" && (
                <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <User size={16} />
                </div>
            )}
        </div>
    );
}
