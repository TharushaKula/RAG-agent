"use client";

import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowRight, ArrowLeft, Check, Sparkles, Brain, Target, Rocket, Clock, Calendar, GraduationCap, Briefcase, Heart, Award, Repeat, Briefcase as BriefcaseIcon } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
    {
        id: "age",
        title: "About You",
        description: "How old are you? This helps us tailor content for your stage in life.",
        icon: UserIcon,
    },
    {
        id: "style",
        title: "Learning Style",
        description: "How do you absorb information best?",
        icon: Brain,
    },
    {
        id: "availability",
        title: "Commitment",
        description: "How much time can you dedicate to your growth?",
        icon: Clock,
    },
    {
        id: "goals",
        title: "Your Mission",
        description: "What are your primary objectives?",
        icon: Target,
    },
    {
        id: "profession",
        title: "Target Profession",
        description: "What career or profession are you aiming for?",
        icon: BriefcaseIcon,
    },
];

function UserIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    )
}

const LEARNING_STYLES = [
    { id: "video", label: "Video Lectures", icon: Rocket },
    { id: "text", label: "Text/Books", icon: Brain },
    { id: "interactive", label: "Interactive Quizzes", icon: Sparkles },
    { id: "hands-on", label: "Hands-on Projects", icon: Briefcase },
    { id: "podcasts", label: "Podcasts", icon: Rocket },
];

const TIME_AVAILABILITY = [
    { id: "minimal", label: "< 5 hours / week", desc: "Just dipping my toes in." },
    { id: "moderate", label: "5-15 hours / week", desc: "Steady progress." },
    { id: "intensive", label: "15-30 hours / week", desc: "Serious learning mode." },
    { id: "fulltime", label: "40+ hours / week", desc: "Immersion & fast-track." },
];

const LEARNING_GOALS = [
    { id: "exams", label: "Prepare for Exams", desc: "School or University success.", icon: GraduationCap },
    { id: "career_skills", label: "Build Career Skills", desc: "Up-skill for my current job.", icon: Briefcase },
    { id: "personal_interest", label: "Personal Interest", desc: "Learning for fun or a hobby.", icon: Heart },
    { id: "certifications", label: "Get Certifications", desc: "Boost my resume with credentials.", icon: Award },
    { id: "switch_career", label: "Switch Career", desc: "Transitioning to a new field.", icon: Repeat },
];

export default function OnboardingPage() {
    const { token, updateUser } = useAuth();
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Form State
    const [age, setAge] = useState<string>("");
    const [learningStyles, setLearningStyles] = useState<string[]>([]);
    const [timeAvailability, setTimeAvailability] = useState<string>("");
    const [learningGoals, setLearningGoals] = useState<string[]>([]);
    const [targetProfession, setTargetProfession] = useState<string>("");

    const toggleItem = (item: string, state: string[], setState: (val: string[]) => void) => {
        setState(state.includes(item)
            ? state.filter(i => i !== item)
            : [...state, item]
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
                body: JSON.stringify({
                    age: parseInt(age),
                    learningStyles,
                    timeAvailability,
                    learningGoals,
                    targetProfession
                }),
            });

            if (!res.ok) throw new Error("Failed to save profile");

            updateUser({
                age: parseInt(age),
                learningStyles,
                timeAvailability,
                learningGoals,
                targetProfession,
                onboardingCompleted: true
            });
            toast.success("Profile ready! Welcome to RAG Agent.");
            router.push("/");
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const isNextDisabled = () => {
        if (currentStep === 0) return !age || isNaN(parseInt(age));
        if (currentStep === 1) return learningStyles.length === 0;
        if (currentStep === 2) return !timeAvailability;
        if (currentStep === 3) return learningGoals.length === 0;
        if (currentStep === 4) return !targetProfession.trim();
        return false;
    };

    const progress = ((currentStep + 1) / STEPS.length) * 100;

    return (
        <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-violet-600 via-pink-500 to-orange-400 font-sans">
            <div className="w-full max-w-2xl bg-black/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden relative min-h-[600px] flex flex-col">

                {/* Amazing Progress Bar */}
                <div className="absolute top-0 left-0 w-full h-2 bg-white/5 overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-[#FF9F89] via-pink-400 to-violet-400 shadow-[0_0_20px_rgba(255,159,137,0.6)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ type: "spring", stiffness: 100, damping: 20 }}
                    />
                </div>

                <div className="flex-1 p-8 lg:p-12 flex flex-col">
                    {/* Step Navigation Dots */}
                    <div className="flex justify-center gap-2 mb-10">
                        {STEPS.map((_, idx) => (
                            <div
                                key={idx}
                                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentStep ? "w-8 bg-[#FF9F89]" : "w-1.5 bg-white/20"
                                    }`}
                            />
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, x: -20, filter: "blur(10px)" }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="flex-1 flex flex-col"
                        >
                            <div className="mb-10 text-center">
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="h-16 w-16 bg-gradient-to-br from-[#FF9F89] to-[#ff8f75] rounded-3xl flex items-center justify-center text-black mb-6 mx-auto shadow-2xl shadow-[#FF9F89]/20"
                                >
                                    {(() => {
                                        const Icon = STEPS[currentStep].icon;
                                        return <Icon className="w-8 h-8" />;
                                    })()}
                                </motion.div>
                                <h1 className="text-4xl font-black text-white mb-3 tracking-tight">{STEPS[currentStep].title}</h1>
                                <p className="text-white/50 text-lg max-w-md mx-auto">{STEPS[currentStep].description}</p>
                            </div>

                            <div className="flex-1 flex flex-col justify-center">
                                {currentStep === 0 && (
                                    <div className="max-w-xs mx-auto w-full">
                                        <div className="relative group">
                                            <input
                                                type="number"
                                                value={age}
                                                onChange={(e) => setAge(e.target.value)}
                                                placeholder="Enter age"
                                                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-6 text-center text-4xl font-bold text-white placeholder-white/10 focus:outline-none focus:border-[#FF9F89]/50 focus:bg-white/10 transition-all hover:bg-white/10"
                                                autoFocus
                                            />
                                            <div className="absolute inset-0 rounded-2xl border-2 border-[#FF9F89] opacity-0 group-focus-within:opacity-20 transition-opacity pointer-events-none" />
                                        </div>
                                        <p className="text-center text-white/30 mt-4 text-sm font-medium">Numbers only, please!</p>
                                    </div>
                                )}

                                {currentStep === 1 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                        {LEARNING_STYLES.map((style) => (
                                            <button
                                                key={style.id}
                                                onClick={() => toggleItem(style.id, learningStyles, setLearningStyles)}
                                                className={`p-4 rounded-2xl border transition-all text-left flex items-center gap-4 group ${learningStyles.includes(style.id)
                                                        ? "bg-[#FF9F89] border-transparent text-black"
                                                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                                    }`}
                                            >
                                                <div className={`p-3 rounded-xl ${learningStyles.includes(style.id) ? "bg-black/10" : "bg-white/5"}`}>
                                                    <style.icon className="w-5 h-5" />
                                                </div>
                                                <span className="font-bold text-sm tracking-wide">{style.label}</span>
                                                {learningStyles.includes(style.id) && <Check className="w-5 h-5 ml-auto" />}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {currentStep === 2 && (
                                    <div className="space-y-3 pt-2">
                                        {TIME_AVAILABILITY.map((time) => (
                                            <button
                                                key={time.id}
                                                onClick={() => setTimeAvailability(time.id)}
                                                className={`w-full p-5 rounded-2xl border transition-all text-left flex items-center justify-between group ${timeAvailability === time.id
                                                        ? "bg-[#FF9F89] border-transparent text-black"
                                                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                                    }`}
                                            >
                                                <div>
                                                    <h3 className="font-bold text-base">{time.label}</h3>
                                                    <p className={`text-xs ${timeAvailability === time.id ? "text-black/60" : "text-white/40"}`}>
                                                        {time.desc}
                                                    </p>
                                                </div>
                                                {timeAvailability === time.id ? (
                                                    <Check className="w-6 h-6" />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full border border-white/20 group-hover:border-white/40 transition-colors" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {currentStep === 3 && (
                                    <div className="space-y-3 pt-2">
                                        {LEARNING_GOALS.map((goal) => (
                                            <button
                                                key={goal.id}
                                                onClick={() => toggleItem(goal.id, learningGoals, setLearningGoals)}
                                                className={`w-full p-5 rounded-2xl border transition-all text-left flex items-center gap-4 group ${learningGoals.includes(goal.id)
                                                        ? "bg-[#FF9F89] border-transparent text-black"
                                                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                                    }`}
                                            >
                                                <div className={`p-3 rounded-xl ${learningGoals.includes(goal.id) ? "bg-black/10" : "bg-white/5"}`}>
                                                    <goal.icon className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-base leading-tight">{goal.label}</h3>
                                                    <p className={`text-xs ${learningGoals.includes(goal.id) ? "text-black/60" : "text-white/40"}`}>
                                                        {goal.desc}
                                                    </p>
                                                </div>
                                                {learningGoals.includes(goal.id) && <Check className="w-6 h-6" />}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {currentStep === 4 && (
                                    <div className="max-w-md mx-auto w-full">
                                        <div className="relative group">
                                            <input
                                                type="text"
                                                value={targetProfession}
                                                onChange={(e) => setTargetProfession(e.target.value)}
                                                placeholder="e.g., Software Engineer, Data Scientist, Product Manager"
                                                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-6 text-center text-xl font-semibold text-white placeholder-white/20 focus:outline-none focus:border-[#FF9F89]/50 focus:bg-white/10 transition-all hover:bg-white/10"
                                                autoFocus
                                            />
                                            <div className="absolute inset-0 rounded-2xl border-2 border-[#FF9F89] opacity-0 group-focus-within:opacity-20 transition-opacity pointer-events-none" />
                                        </div>
                                        <p className="text-center text-white/30 mt-4 text-sm font-medium">This helps us create more targeted learning paths for you.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>

                    {/* Footer Actions */}
                    <div className="mt-12 flex items-center justify-between pt-8 border-t border-white/5">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0 || isLoading}
                            className={`group flex items-center gap-3 text-sm font-black transition-all ${currentStep === 0 ? "opacity-0 pointer-events-none" : "text-white/40 hover:text-white"
                                }`}
                        >
                            <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 group-hover:border-white/30 transition-colors">
                                <ArrowLeft className="w-4 h-4" />
                            </div>
                            BACK
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={isNextDisabled() || isLoading}
                            className="bg-[#FF9F89] text-black h-14 px-10 rounded-full font-black text-sm tracking-widest flex items-center gap-3 hover:bg-[#ffb09e] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_16px_32px_-8px_rgba(255,159,137,0.4)] hover:shadow-[0_20px_40px_-8px_rgba(255,159,137,0.5)] hover:scale-[1.05] active:scale-[0.95]"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : currentStep === STEPS.length - 1 ? (
                                <>
                                    LAUNCH APP
                                    <Rocket className="w-4 h-4" />
                                </>
                            ) : (
                                <>
                                    CONTINUE
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Decorative background glow inside the card */}
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-violet-600/20 blur-[100px] rounded-full pointer-events-none" />
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-orange-600/20 blur-[100px] rounded-full pointer-events-none" />
            </div>
        </div>
    );
}
