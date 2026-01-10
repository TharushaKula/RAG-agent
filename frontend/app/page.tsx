import { ChatInterface } from "@/components/chat/chat-interface";
import { Toaster } from "@/components/ui/sonner";

export default function Home() {
  return (
    <main className="dark min-h-screen w-full bg-background text-foreground">
      <ChatInterface />
      <Toaster />
    </main>
  );
}
