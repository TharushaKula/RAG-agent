"use client";

import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Brain, Target, Rocket } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
    {
        id: "skill",
        title: "Identify Your Level",
        description: "Where are you currently in your learning journey?",
        icon: Brain,
    },
    {
        id: "interests",
        title: "What Interests You?",
        description: "Select the areas you want to master.",
        icon: Sparkles,
    },
    {
        id: "goals",
        title: "What's Your Goal?",
        description: "Help us understand what you want to achieve.",
        icon: Target,
    },
];

const SKILL_LEVELS = [
    { id: "beginner", label: "Beginner", desc: "No prior experience, starting from scratch." },
    { id: "intermediate", label: "Intermediate", desc: "Know the basics, want to go deeper." },
    { id: "advanced", label: "Advanced", desc: "Experienced, looking for specialized knowledge." },
];

const POPULAR_INTERESTS = [
    "JavaScript", "TypeScript", "React", "Node.js", "Python",
    "Machine Learning", "Generative AI", "Data Science",
    "Cybersecurity", "Cloud Computing", "DevOps", "UI/UX Design",
    "Blockchain", "Mobile Dev", "Soft Skills"
];

export default function OnboardingPage() {
    const { token, updateUser } = useAuth();
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Form State
    const [skillLevel, setSkillLevel] = useState("");
    const [interests, setInterests] = useState<string[]>([]);
    const [goals, setGoals] = useState("");

    const toggleInterest = (interest: string) => {
        setInterests(prev =>
            prev.includes(interest)
                ? prev.filter(i => i !== interest)
                : [...prev, interest]
        );
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            handleFinish();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleFinish = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const res = await fetch("http://localhost:3001/api/auth/profile", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ skillLevel, interests, goals }),
            });

            if (!res.ok) throw new Error("Failed to save profile");

            updateUser({ skillLevel, interests, goals, onboardingCompleted: true });
            toast.success("Profile updated! Personalizing your experience...");
            router.push("/");
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const isNextDisabled = () => {
        if (currentStep === 0) return !skillLevel;
        if (currentStep === 1) return interests.length === 0;
        if (currentStep === 2) return !goals.trim();
        return false;
    };

    return (
        <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-violet-600 via-pink-500 to-orange-400 font-sans">
            <div className="w-full max-w-2xl bg-black/30 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden relative min-h-[500px] flex flex-col">

                {/* Progress Bar */}
                <div className="absolute top-0 left-0 w-full h-1.5 flex gap-1 p-1">
                    {STEPS.map((_, idx) => (
                        <div
                            key={idx}
                            className={`flex-1 rounded-full transition-all duration-500 ${idx <= currentStep ? "bg-[#FF9F89]" : "bg-white/10"}`}
                        />
                    ))}
                </div>

                <div className="flex-1 p-8 lg:p-12 flex flex-col">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                            className="flex-1 flex flex-col"
                        >
                            <div className="mb-8">
                                <div className="h-12 w-12 bg-[#FF9F89] rounded-2xl flex items-center justify-center text-black mb-6">
                                    {(() => {
                                        const Icon = STEPS[currentStep].icon;
                                        return <Icon className="w-6 h-6" />;
                                    })()}
                                </div>
                                <h1 className="text-3xl font-bold text-white mb-2">{STEPS[currentStep].title}</h1>
                                <p className="text-white/60">{STEPS[currentStep].description}</p>
                            </div>

                            <div className="flex-1 flex flex-col">
                                {currentStep === 0 && (
                                    <div className="space-y-4">
                                        {SKILL_LEVELS.map((level) => (
                                            <button
                                                key={level.id}
                                                onClick={() => setSkillLevel(level.id)}
                                                className={`w-full p-6 rounded-2xl border transition-all text-left flex items-center justify-between group ${skillLevel === level.id
                                                        ? "bg-[#FF9F89] border-transparent text-black"
                                                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                                    }`}
                                            >
                                                <div>
                                                    <h3 className="font-bold text-lg">{level.label}</h3>
                                                    <p className={`text-sm ${skillLevel === level.id ? "text-black/60" : "text-white/50"}`}>
                                                        {level.desc}
                                                    </p>
                                                </div>
                                                {skillLevel === level.id && <Check className="w-6 h-6" />}
                                                {skillLevel !== level.id && <ArrowRight className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {currentStep === 1 && (
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {POPULAR_INTERESTS.map((interest) => (
                                            <button
                                                key={interest}
                                                onClick={() => toggleInterest(interest)}
                                                className={`px-4 py-2 rounded-full border transition-all text-sm font-medium ${interests.includes(interest)
                                                        ? "bg-[#FF9F89] border-transparent text-black"
                                                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                                    }`}
                                            >
                                                {interest}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {currentStep === 2 && (
                                    <div className="flex-1 flex flex-col pt-2">
                                        <label className="text-xs font-medium text-white/50 mb-2 ml-1 uppercase tracking-wider">Example: "I want to become a Senior Frontend Engineer in 6 months"</label>
                                        <textarea
                                            value={goals}
                                            onChange={(e) => setGoals(e.target.value)}
                                            placeholder="Tell us about your career or learning ambitions..."
                                            className="w-full flex-1 min-h-[200px] bg-white/5 border border-white/10 rounded-2xl p-6 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#FF9F89]/50 transition-all resize-none"
                                        />
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    {/* Footer Actions */}
                    <div className="mt-12 flex items-center justify-between border-t border-white/10 pt-8">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0 || isLoading}
                            className={`flex items-center gap-2 text-sm font-bold transition-all ${currentStep === 0 ? "opacity-0 pointer-events-none" : "text-white/60 hover:text-white"
                                }`}
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={isNextDisabled() || isLoading}
                            className="bg-[#FF9F89] text-black h-12 px-8 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-[#ff8f75] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : currentStep === STEPS.length - 1 ? (
                                <>
                                    Complete Setup
                                    <Rocket className="w-4 h-4" />
                                </>
                            ) : (
                                <>
                                    Next Step
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Decorative background blur inside the card */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
            </div>
        </div>
    );
}
