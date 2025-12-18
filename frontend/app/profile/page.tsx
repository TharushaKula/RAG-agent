"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft, Check, Save, User as UserIcon, Mail, Brain, Clock, Target, Calendar } from "lucide-react";
import { toast } from "sonner";

const LEARNING_STYLES = [
    { id: "video", label: "Video Lectures" },
    { id: "text", label: "Text/Books" },
    { id: "interactive", label: "Interactive Quizzes" },
    { id: "hands-on", label: "Hands-on Projects" },
    { id: "podcasts", label: "Podcasts" },
];

const TIME_AVAILABILITY = [
    { id: "minimal", label: "< 5 hours / week" },
    { id: "moderate", label: "5-15 hours / week" },
    { id: "intensive", label: "15-30 hours / week" },
    { id: "fulltime", label: "40+ hours / week" },
];

const LEARNING_GOALS = [
    { id: "exams", label: "Prepare for Exams" },
    { id: "career_skills", label: "Build Career Skills" },
    { id: "personal_interest", label: "Personal Interest" },
    { id: "certifications", label: "Get Certifications" },
    { id: "switch_career", label: "Switch Career" },
];

export default function ProfilePage() {
    const { user, token, updateUser, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [name, setName] = useState("");
    const [age, setAge] = useState("");
    const [learningStyles, setLearningStyles] = useState<string[]>([]);
    const [timeAvailability, setTimeAvailability] = useState("");
    const [learningGoals, setLearningGoals] = useState<string[]>([]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/login");
        } else if (user) {
            setName(user.name || "");
            setAge(user.age?.toString() || "");
            setLearningStyles(user.learningStyles || []);
            setTimeAvailability(user.timeAvailability || "");
            setLearningGoals(user.learningGoals || []);
        }
    }, [user, authLoading, router]);

    const toggleItem = (item: string, state: string[], setState: (val: string[]) => void) => {
        setState(state.includes(item)
            ? state.filter(i => i !== item)
            : [...state, item]
        );
    };

    const handleSave = async () => {
        if (!token) return;
        setIsSaving(true);
        try {
            const res = await fetch("http://localhost:3001/api/auth/profile", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    age: parseInt(age),
                    learningStyles,
                    timeAvailability,
                    learningGoals
                }),
            });

            if (!res.ok) throw new Error("Failed to update profile");

            updateUser({
                name,
                age: parseInt(age),
                learningStyles,
                timeAvailability,
                learningGoals
            });
            toast.success("Profile updated successfully!");
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (authLoading || !user) {
        return <div className="flex h-screen items-center justify-center bg-black"><Loader2 className="animate-spin text-white w-8 h-8" /></div>;
    }

    return (
        <div className="flex min-h-screen w-full items-center justify-center p-4 lg:p-8 bg-gradient-to-br from-violet-600 via-pink-500 to-orange-400 font-sans">
            <div className="w-full max-w-7xl bg-black/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col lg:flex-row relative">

                {/* Left Sidebar - Profile Summary */}
                <div className="lg:w-1/4 bg-white/5 p-8 lg:p-12 flex flex-col items-center text-center border-b lg:border-b-0 lg:border-r border-white/10">
                    <button
                        onClick={() => router.back()}
                        className="absolute top-6 left-6 p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>

                    <div className="relative mb-6">
                        <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-[#FF9F89] to-[#ff8f75] flex items-center justify-center text-black shadow-2xl">
                            <UserIcon className="w-16 h-16" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-black" title="Active Account" />
                    </div>

                    <h2 className="text-3xl font-black text-white mb-2 tracking-tight">{user.name}</h2>
                    <p className="text-white/40 mb-8 flex items-center gap-2 text-sm">
                        <Mail className="w-4 h-4" />
                        {user.email}
                    </p>

                    <div className="w-full space-y-4">
                        <div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between text-left">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-violet-500/20 rounded-lg text-violet-400">
                                    <Clock className="w-4 h-4" />
                                </div>
                                <span className="text-white/60 text-sm">Member Since</span>
                            </div>
                            <span className="text-white text-sm font-bold">2025</span>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-4 flex items-center justify-between text-left">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
                                    <Target className="w-4 h-4" />
                                </div>
                                <span className="text-white/60 text-sm">Goals Met</span>
                            </div>
                            <span className="text-white text-sm font-bold">12</span>
                        </div>
                    </div>
                </div>

                {/* Right Content - Full Settings */}
                <div className="flex-1 p-8 lg:p-12 flex flex-col gap-10">
                    <div>
                        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Your Profile</h1>
                        <p className="text-white/50 text-lg">Manage your learning preferences and personal details.</p>
                    </div>

                    <div className="space-y-8 h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                        {/* Section: Basic Info */}
                        <section className="space-y-4">
                            <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                                <UserIcon className="w-4 h-4" />
                                Basic Information
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-white/30 ml-2 uppercase">Full Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-[#FF9F89]/50 transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-white/30 ml-2 uppercase">Age</label>
                                    <input
                                        type="number"
                                        value={age}
                                        onChange={(e) => setAge(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-[#FF9F89]/50 transition-all"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Section: Learning Style */}
                        <section className="space-y-4">
                            <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                                <Brain className="w-4 h-4" />
                                Learning Style
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {LEARNING_STYLES.map(style => (
                                    <button
                                        key={style.id}
                                        onClick={() => toggleItem(style.id, learningStyles, setLearningStyles)}
                                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${learningStyles.includes(style.id)
                                                ? "bg-[#FF9F89] border-transparent text-black"
                                                : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                            }`}
                                    >
                                        {style.label}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Section: Commitment */}
                        <section className="space-y-4">
                            <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                Time Commitment
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {TIME_AVAILABILITY.map(time => (
                                    <button
                                        key={time.id}
                                        onClick={() => setTimeAvailability(time.id)}
                                        className={`p-4 rounded-xl border transition-all text-left flex items-center justify-between ${timeAvailability === time.id
                                                ? "bg-[#FF9F89] border-transparent text-black"
                                                : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                            }`}
                                    >
                                        <span className="font-bold text-sm">{time.label}</span>
                                        {timeAvailability === time.id && <Check className="w-4 h-4" />}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Section: Learning Goals */}
                        <section className="space-y-4">
                            <h3 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-2">
                                <Target className="w-4 h-4" />
                                Learning Goals
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {LEARNING_GOALS.map(goal => (
                                    <button
                                        key={goal.id}
                                        onClick={() => toggleItem(goal.id, learningGoals, setLearningGoals)}
                                        className={`p-4 rounded-xl border transition-all text-left flex items-center justify-between ${learningGoals.includes(goal.id)
                                                ? "bg-[#FF9F89] border-transparent text-black"
                                                : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                            }`}
                                    >
                                        <span className="font-bold text-sm">{goal.label}</span>
                                        {learningGoals.includes(goal.id) && <Check className="w-4 h-4" />}
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className="mt-2 border-t border-white/5 pt-8">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full bg-[#FF9F89] text-black h-16 rounded-2xl font-black text-base tracking-widest flex items-center justify-center gap-3 hover:bg-[#ffb09e] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_16px_32px_-8px_rgba(255,159,137,0.4)] hover:shadow-[0_20px_40px_-8px_rgba(255,159,137,0.5)] active:scale-[0.98]"
                        >
                            {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                                <>
                                    SAVE CHANGES
                                    <Save className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Glassy Background Blurs */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-600/10 blur-[150px] rounded-full pointer-events-none" />
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}
