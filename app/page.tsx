import { ChatInterface } from "@/components/chat/chat-interface";
import { Toaster } from "@/components/ui/sonner";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <ChatInterface />
      <Toaster />
    </main>
  );
}
