"use client";

import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import Link from "next/link";
import { Loader2, Github, Facebook, ArrowRight, ArrowLeft, Quote, Star } from "lucide-react";

export default function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError("");

        try {
            const res = await fetch("http://localhost:3001/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Login failed");
            }

            login(data.token, data.user);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const [showCard, setShowCard] = useState(true);

    return (
        <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-violet-600 via-pink-500 to-orange-400 font-sans">
            {/* Main Glass Card */}
            <div className="w-full max-w-5xl overflow-hidden rounded-[2.5rem] bg-black/20 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col lg:flex-row min-h-[600px]">

                {/* Left Side - Login Form */}
                <div className="flex-1 p-8 lg:p-12 flex flex-col justify-center relative">
                    <div className="mb-2">
                        {/* Logo Placeholder */}
                        <div className="flex items-center gap-2 mb-8">
                            <div className="h-8 w-8 bg-gradient-to-tr from-white to-white/50 rounded-lg transform rotate-45" />
                        </div>
                        <h1 className="text-4xl font-bold text-white mb-2">Welcome back</h1>
                        <p className="text-white/60 text-sm">Please Enter your Account details</p>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200 border border-red-500/20">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5 mt-6">
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-white/80 ml-1">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-12 rounded-full border-none bg-black/40 px-6 text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-pink-500/50 transition-all font-medium"
                                placeholder="johndoe@gmail.com"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-white/80 ml-1">Password</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-12 rounded-full border-none bg-black/40 px-6 text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-pink-500/50 transition-all font-medium"
                                placeholder="••••••••"
                            />
                        </div>

                        <div className="flex items-center justify-between text-xs px-1">
                            <label className="flex items-center gap-2 text-white/60 cursor-pointer hover:text-white transition-colors">
                                <input type="checkbox" className="rounded border-white/20 bg-white/10 text-pink-500 focus:ring-offset-0 focus:ring-0 w-3 h-3" />
                                Keep me logged in
                            </label>
                            <Link href="#" className="text-white/60 hover:text-white underline decoration-white/30 transition-colors">
                                Forgot Password
                            </Link>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 rounded-full bg-[#FF9F89] text-black font-bold text-sm hover:bg-[#ff8f75] hover:shadow-lg hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 mt-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin h-5 w-5 mx-auto text-black" /> : "Sign in"}
                        </button>

                        <div className="text-center text-sm text-white/50">
                            Don&apos;t have an account?{" "}
                            <Link href="/signup" className="text-white hover:underline font-medium">
                                Sign up
                            </Link>
                        </div>
                    </form>

                    <div className="mt-8 flex justify-center gap-4">
                        <button className="h-10 w-10 bg-white rounded-full flex items-center justify-center hover:scale-110 transition-transform">
                            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                        </button>
                        <button className="h-10 w-10 bg-white rounded-full flex items-center justify-center hover:scale-110 transition-transform text-black">
                            <Github className="w-5 h-5" fill="currentColor" />
                        </button>
                        <button className="h-10 w-10 bg-white rounded-full flex items-center justify-center hover:scale-110 transition-transform text-blue-600">
                            <Facebook className="w-5 h-5" fill="currentColor" />
                        </button>
                    </div>
                </div>

                {/* Right Side - Testimonial */}
                <div className="hidden lg:flex flex-1 p-4">
                    <div className="w-full h-full bg-[#0d0f14] rounded-[2rem] p-10 flex flex-col justify-between relative overflow-hidden group">

                        {/* Background Decoration */}
                        <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-blue-600/20 blur-[100px] rounded-full" />
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-pink-600/10 blur-[80px] rounded-full" />

                        {/* Starburst Graphic Implementation with CSS/SVG */}
                        <div className="absolute top-1/2 right-10 -translate-y-1/2 opacity-40 pointer-events-none">
                            <svg viewBox="0 0 200 200" className="w-[400px] h-[400px] text-blue-400/30 animate-pulse-slow">
                                <path d="M100 0 L110 90 L200 100 L110 110 L100 200 L90 110 L0 100 L90 90 Z" fill="currentColor" />
                            </svg>
                        </div>

                        <div className="relative z-10">
                            <h2 className="text-5xl font-bold text-white leading-[1.1]">
                                From Learning  <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60"> to Leading</span>
                            </h2>
                            <Quote className="text-white h-10 w-10 mt-8 mb-4 fill-white" />
                            <p className="text-lg text-white/80 leading-relaxed max-w-md">
                                &ldquo; Finally, a platform that understands my skill level. I stopped wasting time on tutorials that were too easy &rdquo;
                            </p>

                            <div className="mt-8">
                                <h4 className="text-white font-bold text-xl">Tharusha Kulasinghe</h4>
                                <p className="text-white/60 text-sm">Student at IIT</p>
                            </div>

                            <div className="flex gap-4 mt-8">
                                <button className="h-12 w-12 rounded-xl bg-[#FF9F89] flex items-center justify-center text-black hover:bg-[#ff8f75] transition-colors opacity-50 cursor-not-allowed">
                                    <ArrowLeft className="w-6 h-6" />
                                </button>
                                <Link href="/signup">
                                    <button className="h-12 w-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                                        <ArrowRight className="w-6 h-6" />
                                    </button>
                                </Link>
                            </div>
                        </div>

                        {/* Floating Card Toggle */}
                        {!showCard && (
                            <button
                                onClick={() => setShowCard(true)}
                                className="absolute bottom-8 right-8 bg-white/10 hover:bg-white/20 p-3 rounded-full text-white backdrop-blur-md transition-all hover:scale-110 z-20 group"
                                title="Show details"
                            >
                                <Star className="w-6 h-6 fill-white text-white group-hover:rotate-180 transition-transform duration-500" />
                            </button>
                        )}

                        {/* Floating Card */}
                        {showCard && (
                            <div className="absolute -bottom-2 -right-2 bg-white rounded-tl-[2.5rem] p-8 w-[320px] shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-500 z-10">
                                {/* Close Button */}
                                <button
                                    onClick={() => setShowCard(false)}
                                    className="absolute top-6 right-6 text-gray-400 hover:text-black transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                </button>

                                <div className="absolute -top-10 right-0 w-10 h-10 bg-transparent shadow-[15px_15px_0_0_#fff] rounded-br-[20px]" />
                                <div className="absolute bottom-0 -left-10 w-10 h-10 bg-transparent shadow-[15px_15px_0_0_#fff] rounded-br-[20px]" />

                                <h3 className="text-black font-bold text-xl mb-2 pr-4">Get your right job and right place apply now</h3>
                                <p className="text-gray-500 text-xs mb-4">Be among the first founders to experience the easiest way to start run a business.</p>

                                <div className="flex -space-x-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white overflow-hidden"><img src={`https://ui-avatars.com/api/?name=A`} alt="User" /></div>
                                    <div className="w-8 h-8 rounded-full bg-gray-300 border-2 border-white overflow-hidden"><img src={`https://ui-avatars.com/api/?name=B`} alt="User" /></div>
                                    <div className="w-8 h-8 rounded-full bg-gray-400 border-2 border-white overflow-hidden"><img src={`https://ui-avatars.com/api/?name=C`} alt="User" /></div>
                                    <div className="w-8 h-8 rounded-full bg-black text-white border-2 border-white flex items-center justify-center text-[10px] font-bold">+2</div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

            </div>


        </div>
    );
}
