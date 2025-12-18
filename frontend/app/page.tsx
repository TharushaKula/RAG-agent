import { ChatInterface } from "@/components/chat/chat-interface";
import { Toaster } from "@/components/ui/sonner";

export default function Home() {
  return (
    <main className="min-h-screen w-full">
      <ChatInterface />
      <Toaster />
    </main>
  );
}
