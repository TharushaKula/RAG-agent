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

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ... existing imports

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
                    {role === "user" ? (
                        <div className="whitespace-pre-wrap">{content}</div>
                    ) : (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                table: ({ node, ...props }) => <div className="overflow-x-auto my-4"><table className="w-full border-collapse text-sm" {...props} /></div>,
                                th: ({ node, ...props }) => <th className="border border-white/20 px-4 py-2 bg-white/5 font-semibold text-left" {...props} />,
                                td: ({ node, ...props }) => <td className="border border-white/10 px-4 py-2" {...props} />,
                                p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2" {...props} />,
                                ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                                li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                                strong: ({ node, ...props }) => <strong className="font-bold text-blue-300" {...props} />,
                                h1: ({ node, ...props }) => <h1 className="text-xl font-bold mb-2 mt-4 text-purple-300" {...props} />,
                                h2: ({ node, ...props }) => <h2 className="text-lg font-bold mb-2 mt-4 text-purple-300" {...props} />,
                                h3: ({ node, ...props }) => <h3 className="text-md font-bold mb-1 mt-2 text-purple-300" {...props} />,
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    )}
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
