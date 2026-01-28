"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Loader2,
  User as UserIcon,
  Mail,
  Brain,
  Clock,
  Target,
  Calendar,
  Check,
  Save,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "../../context/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const LEARNING_STYLES = [
  { id: "video", label: "Video lectures" },
  { id: "text", label: "Text / books" },
  { id: "interactive", label: "Interactive quizzes" },
  { id: "hands-on", label: "Hands-on projects" },
  { id: "podcasts", label: "Podcasts" },
] as const;

const TIME_AVAILABILITY = [
  { id: "minimal", label: "< 5 hours / week" },
  { id: "moderate", label: "5–15 hours / week" },
  { id: "intensive", label: "15–30 hours / week" },
  { id: "fulltime", label: "40+ hours / week" },
] as const;

const LEARNING_GOALS = [
  { id: "exams", label: "Prepare for exams" },
  { id: "career_skills", label: "Build career skills" },
  { id: "personal_interest", label: "Personal interest" },
  { id: "certifications", label: "Get certifications" },
  { id: "switch_career", label: "Switch career" },
] as const;

type LearningStyleId = (typeof LEARNING_STYLES)[number]["id"];
type TimeAvailabilityId = (typeof TIME_AVAILABILITY)[number]["id"];
type LearningGoalId = (typeof LEARNING_GOALS)[number]["id"];

export function ProfilePanel() {
  const { user, token, updateUser, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [learningStyles, setLearningStyles] = useState<LearningStyleId[]>([]);
  const [timeAvailability, setTimeAvailability] = useState<TimeAvailabilityId | "">("");
  const [learningGoals, setLearningGoals] = useState<LearningGoalId[]>([]);
  const [targetProfession, setTargetProfession] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user) {
      setName(user.name || "");
      setAge(user.age?.toString() || "");
      setLearningStyles((user.learningStyles || []) as LearningStyleId[]);
      setTimeAvailability((user.timeAvailability || "") as TimeAvailabilityId | "");
      setLearningGoals((user.learningGoals || []) as LearningGoalId[]);
      setTargetProfession((user as any).targetProfession || "");
    }
  }, [user, authLoading, router]);

  const toggleItem = <T extends string>(
    item: T,
    state: T[],
    setState: (val: T[]) => void,
  ) => {
    setState(state.includes(item) ? state.filter((i) => i !== item) : [...state, item]);
  };

  const handleSave = async () => {
    if (!token) return;

    const numericAge = age ? parseInt(age, 10) : undefined;
    if (age && Number.isNaN(numericAge)) {
      toast.error("Please enter a valid age.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          age: numericAge,
          learningStyles,
          timeAvailability,
          learningGoals,
          targetProfession,
        }),
      });

      if (!res.ok) throw new Error("Failed to update profile");

      updateUser({
        name,
        age: numericAge,
        learningStyles,
        timeAvailability,
        learningGoals,
        targetProfession,
      } as any);

      toast.success("Profile updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div
      className="flex flex-1 flex-col gap-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Your profile</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account details and learning preferences.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-background/40 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <div className="flex flex-col">
              <span className="font-medium text-foreground/80">
                Learning profile
              </span>
              <span>Helps the agent tailor recommendations to you.</span>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save changes
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
        <Card className="border-white/10 bg-background/80 backdrop-blur">
          <div className="flex items-center gap-4 border-b border-white/5 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserIcon className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium leading-none">{user.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" />
                {user.email}
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Full name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Age
                </label>
                <Input
                  type="number"
                  min={0}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 22"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Target Profession
              </label>
              <Input
                value={targetProfession}
                onChange={(e) => setTargetProfession(e.target.value)}
                placeholder="e.g., Software Engineer, Data Scientist, Product Manager"
              />
            </div>

            <Separator className="my-2" />

            <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-background/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>Time commitment</span>
                </div>
                <span className="font-medium text-foreground/80">
                  {TIME_AVAILABILITY.find((t) => t.id === timeAvailability)?.label ??
                    "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-background/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-primary" />
                  <span>Goals tracked</span>
                </div>
                <span className="font-medium text-foreground/80">
                  {learningGoals.length || 0}
                </span>
              </div>
            </div>
            {targetProfession && (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-xs">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
                <span className="text-muted-foreground">Target profession:</span>
                <span className="font-medium text-foreground/80">{targetProfession}</span>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-background/80 backdrop-blur">
            <div className="flex items-center justify-between gap-2 border-b border-white/5 p-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Learning style</p>
                  <p className="text-xs text-muted-foreground">
                    How do you like to learn?
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                Personalization
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2 p-4">
              {LEARNING_STYLES.map((style) => {
                const active = learningStyles.includes(style.id);
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() =>
                      toggleItem(style.id, learningStyles, setLearningStyles)
                    }
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-white/10 bg-background/60 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {style.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="border-white/10 bg-background/80 backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/5 p-4">
              <Clock className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Time availability</p>
                <p className="text-xs text-muted-foreground">
                  How many hours can you invest each week?
                </p>
              </div>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {TIME_AVAILABILITY.map((time) => {
                const active = timeAvailability === time.id;
                return (
                  <button
                    key={time.id}
                    type="button"
                    onClick={() => setTimeAvailability(time.id)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-white/10 bg-background/60 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                    }`}
                  >
                    <span>{time.label}</span>
                    {active && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="border-white/10 bg-background/80 backdrop-blur">
            <div className="flex items-center gap-2 border-b border-white/5 p-4">
              <Target className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Learning goals</p>
                <p className="text-xs text-muted-foreground">
                  What are you hoping to achieve?
                </p>
              </div>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {LEARNING_GOALS.map((goal) => {
                const active = learningGoals.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() =>
                      toggleItem(goal.id, learningGoals, setLearningGoals)
                    }
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-white/10 bg-background/60 text-muted-foreground hover:border-primary/60 hover:text-foreground"
                    }`}
                  >
                    <span>{goal.label}</span>
                    {active && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

