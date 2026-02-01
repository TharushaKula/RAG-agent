"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    FileSearch, 
    Brain, 
    Sparkles, 
    BookOpen, 
    CheckCircle2,
    Loader2
} from "lucide-react";

interface GenerationStep {
    id: string;
    title: string;
    description: string;
    icon: React.ElementType;
    duration: number; // estimated duration in ms
    targetProgress: number; // progress percentage at end of this step
}

// Steps with target progress - we'll hold at 95% until backend completes
const GENERATION_STEPS: GenerationStep[] = [
    {
        id: "analyzing",
        title: "Analyzing Your Profile",
        description: "Reading your CV and job requirements",
        icon: FileSearch,
        duration: 3000,
        targetProgress: 15
    },
    {
        id: "matching",
        title: "Finding Similar Profiles",
        description: "Searching our database for relevant career paths",
        icon: Brain,
        duration: 5000,
        targetProgress: 30
    },
    {
        id: "generating",
        title: "AI Generating Roadmap",
        description: "Creating personalized learning stages and modules",
        icon: Sparkles,
        duration: 15000,
        targetProgress: 65
    },
    {
        id: "resources",
        title: "Fetching Learning Resources",
        description: "Finding courses, videos, and books for each module",
        icon: BookOpen,
        duration: 20000,
        targetProgress: 95
    },
    {
        id: "complete",
        title: "Roadmap Complete!",
        description: "Your personalized learning path is ready",
        icon: CheckCircle2,
        duration: 1000,
        targetProgress: 100
    }
];

interface RoadmapProgressProps {
    isGenerating: boolean;
    isComplete?: boolean; // NEW: indicates backend has actually completed
    onComplete?: () => void;
}

export function RoadmapProgress({ isGenerating, isComplete = false, onComplete }: RoadmapProgressProps) {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isWaitingForBackend, setIsWaitingForBackend] = useState(false);
    const startTimeRef = useRef<number>(Date.now());

    const currentStep = GENERATION_STEPS[currentStepIndex];
    const isLastStep = currentStepIndex === GENERATION_STEPS.length - 1;

    // Handle actual completion from backend
    useEffect(() => {
        if (isComplete && isGenerating) {
            // Backend is done! Jump to 100%
            setCurrentStepIndex(GENERATION_STEPS.length - 1);
            setProgress(100);
            setIsWaitingForBackend(false);
            
            if (onComplete) {
                setTimeout(() => onComplete(), 500);
            }
        }
    }, [isComplete, isGenerating, onComplete]);

    // Reset when generation starts/stops
    useEffect(() => {
        if (isGenerating) {
            startTimeRef.current = Date.now();
            setCurrentStepIndex(0);
            setProgress(0);
            setElapsedTime(0);
            setIsWaitingForBackend(false);
        } else {
            setCurrentStepIndex(0);
            setProgress(0);
            setElapsedTime(0);
            setIsWaitingForBackend(false);
        }
    }, [isGenerating]);

    // Smooth progress animation with intelligent pacing
    useEffect(() => {
        if (!isGenerating || isComplete) return;

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTimeRef.current;
            setElapsedTime(elapsed);

            // Calculate which step we should be on based on elapsed time
            let accumulatedTime = 0;
            let stepIndex = 0;
            
            for (let i = 0; i < GENERATION_STEPS.length - 1; i++) { // Exclude "complete" step
                if (elapsed < accumulatedTime + GENERATION_STEPS[i].duration) {
                    stepIndex = i;
                    break;
                }
                accumulatedTime += GENERATION_STEPS[i].duration;
                stepIndex = i + 1;
            }

            // Don't go to the last step (complete) until backend is done
            stepIndex = Math.min(stepIndex, GENERATION_STEPS.length - 2);
            setCurrentStepIndex(stepIndex);

            // Calculate progress within current step
            const currentStepData = GENERATION_STEPS[stepIndex];
            const prevTargetProgress = stepIndex > 0 ? GENERATION_STEPS[stepIndex - 1].targetProgress : 0;
            const timeInCurrentStep = elapsed - accumulatedTime;
            const stepProgress = Math.min(timeInCurrentStep / currentStepData.duration, 1);
            const progressRange = currentStepData.targetProgress - prevTargetProgress;
            
            let calculatedProgress = prevTargetProgress + (stepProgress * progressRange);
            
            // Cap at 95% until backend completes
            calculatedProgress = Math.min(calculatedProgress, 95);
            
            // If we've hit 95%, we're waiting for backend
            if (calculatedProgress >= 95) {
                setIsWaitingForBackend(true);
                
                // Slowly creep from 95% to 98% while waiting (psychological effect)
                const waitingTime = elapsed - (accumulatedTime + GENERATION_STEPS[stepIndex].duration);
                const creepProgress = Math.min(waitingTime / 60000 * 3, 3); // Max 3% over 60 seconds
                calculatedProgress = Math.min(95 + creepProgress, 98);
            }
            
            setProgress(calculatedProgress);
        }, 100); // Update every 100ms

        return () => clearInterval(interval);
    }, [isGenerating, isComplete]);

    if (!isGenerating) return null;

    const Icon = currentStep.icon;

    const isCompleteStep = progress >= 100;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full"
            >
                {/* Main Progress Card */}
                <motion.div 
                    className={`backdrop-blur-xl border rounded-2xl p-8 shadow-2xl transition-all duration-500 ${
                        isCompleteStep 
                            ? "bg-linear-to-br from-green-900/40 via-emerald-900/30 to-teal-900/40 border-green-500/30"
                            : "bg-linear-to-br from-purple-900/40 via-pink-900/30 to-blue-900/40 border-white/10"
                    }`}
                    animate={isCompleteStep ? { scale: [1, 1.02, 1] } : {}}
                    transition={{ duration: 0.5 }}
                >
                    
                    {/* Icon and Title */}
                    <div className="flex items-center gap-4 mb-6">
                        <motion.div
                            key={currentStep.id}
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 15 }}
                            className="relative"
                        >
                            <div className={`absolute inset-0 rounded-full blur-xl opacity-50 animate-pulse transition-colors duration-500 ${
                                isCompleteStep 
                                    ? "bg-linear-to-r from-green-500 to-emerald-500" 
                                    : "bg-linear-to-r from-purple-500 to-pink-500"
                            }`} />
                            <div className={`relative p-4 rounded-full transition-colors duration-500 ${
                                isCompleteStep 
                                    ? "bg-linear-to-r from-green-500 to-emerald-500" 
                                    : "bg-linear-to-r from-purple-500 to-pink-500"
                            }`}>
                                <Icon className="h-8 w-8 text-white" />
                            </div>
                        </motion.div>

                        <div className="flex-1">
                            <motion.h3
                                key={currentStep.title}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="text-2xl font-bold text-white mb-1"
                            >
                                {currentStep.title}
                            </motion.h3>
                            <motion.p
                                key={currentStep.description}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 }}
                                className="text-sm text-white/60"
                            >
                                {currentStep.description}
                            </motion.p>
                        </div>

                        <div className="text-right">
                            <div className="text-3xl font-bold text-white">
                                {Math.round(progress)}%
                            </div>
                            <div className="text-xs text-white/40">
                                {Math.round(elapsedTime / 1000)}s elapsed
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="relative h-3 bg-black/30 rounded-full overflow-hidden mb-6">
                        <motion.div
                            className={`absolute inset-0 transition-colors duration-500 ${
                                isCompleteStep 
                                    ? "bg-linear-to-r from-green-500 via-emerald-500 to-teal-500" 
                                    : "bg-linear-to-r from-purple-500 via-pink-500 to-blue-500"
                            }`}
                            initial={{ width: "0%" }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                        />
                        
                        {/* Shimmer effect - hide when complete */}
                        {!isCompleteStep && (
                            <motion.div
                                className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent"
                                animate={{ x: ["0%", "200%"] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                style={{ width: "50%" }}
                            />
                        )}
                    </div>

                    {/* Steps Timeline */}
                    <div className="flex justify-between items-start gap-2">
                        {GENERATION_STEPS.map((step, index) => {
                            const StepIcon = step.icon;
                            const isActive = index === currentStepIndex;
                            const isCompleted = index < currentStepIndex;
                            const isFuture = index > currentStepIndex;

                            return (
                                <div key={step.id} className="flex flex-col items-center flex-1">
                                    {/* Step Circle */}
                                    <motion.div
                                        initial={false}
                                        animate={{
                                            scale: isActive ? 1.2 : 1,
                                            backgroundColor: isCompleted 
                                                ? "rgba(168, 85, 247, 0.8)" 
                                                : isActive 
                                                ? "rgba(236, 72, 153, 0.8)"
                                                : "rgba(255, 255, 255, 0.1)"
                                        }}
                                        className="relative w-10 h-10 rounded-full flex items-center justify-center border-2 border-white/20 mb-2"
                                    >
                                        {isCompleted ? (
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                            >
                                                <CheckCircle2 className="h-5 w-5 text-white" />
                                            </motion.div>
                                        ) : isActive ? (
                                            <motion.div
                                                animate={{ rotate: 360 }}
                                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                            >
                                                <Loader2 className="h-5 w-5 text-white" />
                                            </motion.div>
                                        ) : (
                                            <StepIcon className="h-4 w-4 text-white/40" />
                                        )}

                                        {/* Pulse effect for active step */}
                                        {isActive && (
                                            <motion.div
                                                className="absolute inset-0 rounded-full bg-pink-500"
                                                initial={{ scale: 1, opacity: 0.5 }}
                                                animate={{ scale: 1.5, opacity: 0 }}
                                                transition={{ duration: 1.5, repeat: Infinity }}
                                            />
                                        )}
                                    </motion.div>

                                    {/* Step Label */}
                                    <div className="text-center">
                                        <p className={`text-xs font-medium transition-colors ${
                                            isActive 
                                                ? "text-pink-400" 
                                                : isCompleted 
                                                ? "text-purple-400" 
                                                : "text-white/30"
                                        }`}>
                                            {step.title.split(" ").slice(0, 2).join(" ")}
                                        </p>
                                    </div>

                                    {/* Connector Line */}
                                    {index < GENERATION_STEPS.length - 1 && (
                                        <div className="absolute top-5 left-[calc(50%+20px)] w-[calc(100%-40px)] h-0.5 bg-white/10">
                                            <motion.div
                                                className="h-full bg-linear-to-r from-purple-500 to-pink-500"
                                                initial={{ width: "0%" }}
                                                animate={{ 
                                                    width: isCompleted ? "100%" : "0%"
                                                }}
                                                transition={{ duration: 0.5 }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Fun Messages */}
                    <motion.div
                        key={isWaitingForBackend ? "waiting" : currentStep.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-6 text-center"
                    >
                        <p className="text-sm text-white/50 italic">
                            {isWaitingForBackend && !isComplete && "⏳ Almost there... finalizing your personalized roadmap..."}
                            {!isWaitingForBackend && currentStep.id === "analyzing" && "🔍 Deep diving into your profile..."}
                            {!isWaitingForBackend && currentStep.id === "matching" && "🧠 Learning from thousands of career paths..."}
                            {!isWaitingForBackend && currentStep.id === "generating" && "✨ AI is crafting your personalized roadmap..."}
                            {!isWaitingForBackend && currentStep.id === "resources" && "📚 Curating the best learning materials..."}
                            {currentStep.id === "complete" && "🎉 Your journey to success starts now!"}
                        </p>
                    </motion.div>

                    {/* Pro Tip - show only when not complete */}
                    {!isLastStep && !isCompleteStep && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 2 }}
                            className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
                        >
                            <p className="text-xs text-blue-300">
                                💡 <strong>Pro Tip:</strong> Your roadmap will be tailored to your learning style and time availability for maximum efficiency!
                            </p>
                        </motion.div>
                    )}

                    {/* Success Message */}
                    {isCompleteStep && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 15 }}
                            className="mt-4 p-4 bg-green-500/20 border border-green-500/30 rounded-lg"
                        >
                            <p className="text-sm text-green-300 text-center font-medium">
                                🎉 <strong>Success!</strong> Your personalized learning roadmap is ready. Preparing to show your results...
                            </p>
                        </motion.div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
