import { ObjectId } from "mongodb";
import { Roadmap, RoadmapStage, RoadmapModule, LearningResource } from "../models/Roadmap";
import { getUsersCollection } from "../models/User";
import { getVectorStore } from "./ragService";
import { EmbeddingService } from "./embeddingService";
import { SemanticMatcher } from "./semanticMatcher";

interface UserProfile {
    learningStyles?: string[];
    timeAvailability?: string;
    learningGoals?: string[];
    age?: number;
}

interface SkillGap {
    skill: string;
    importance: "high" | "medium" | "low";
    currentLevel: number; // 0-100
    requiredLevel: number; // 0-100
}

export class RoadmapGenerator {
    private embeddingService: EmbeddingService;
    private semanticMatcher: SemanticMatcher;

    constructor(embeddingServiceUrl?: string) {
        this.embeddingService = new EmbeddingService(embeddingServiceUrl);
        this.semanticMatcher = new SemanticMatcher(this.embeddingService, 0.45);
    }

    /**
     * Main generation method
     */
    async generateRoadmap(
        userId: string,
        source: "profile" | "cv" | "jd" | "hybrid",
        inputData: {
            profile?: UserProfile;
            cvText?: string;
            jdText?: string;
            cvSource?: string;
            jdSource?: string;
            semanticMatchResult?: any;
        }
    ): Promise<Roadmap> {
        // Get user profile
        const users = await getUsersCollection();
        const user = await users.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            throw new Error("User not found");
        }

        const userProfile: UserProfile = {
            learningStyles: user.learningStyles || [],
            timeAvailability: user.timeAvailability || "moderate",
            learningGoals: user.learningGoals || [],
            age: user.age
        };

        let roadmap: Roadmap;

        switch (source) {
            case "profile":
                roadmap = await this.generateFromProfile(userId, userProfile);
                break;
            case "cv":
                if (!inputData.cvText) throw new Error("CV text is required");
                roadmap = await this.generateFromCV(userId, userProfile, inputData.cvText);
                break;
            case "jd":
                if (!inputData.jdText) throw new Error("Job description text is required");
                roadmap = await this.generateFromJD(userId, userProfile, inputData.jdText);
                break;
            case "hybrid":
                if (!inputData.cvText || !inputData.jdText) {
                    throw new Error("Both CV and JD text are required for hybrid generation");
                }
                roadmap = await this.generateHybrid(
                    userId,
                    userProfile,
                    inputData.cvText,
                    inputData.jdText,
                    inputData.semanticMatchResult
                );
                break;
            default:
                throw new Error(`Unknown source: ${source}`);
        }

        return roadmap;
    }

    /**
     * Generate roadmap from user profile
     */
    private async generateFromProfile(userId: string, profile: UserProfile): Promise<Roadmap> {
        // Determine category from learning goals
        const category = this.determineCategoryFromGoals(profile.learningGoals || []);
        
        // Use AI to generate personalized roadmap
        const roadmap = await this.generateWithAI(
            `Create a learning roadmap for someone with these goals: ${profile.learningGoals?.join(", ")}. 
            Learning styles: ${profile.learningStyles?.join(", ")}. 
            Time availability: ${profile.timeAvailability}.`,
            profile,
            category
        );

        return {
            userId: new ObjectId(userId),
            title: roadmap.title,
            description: roadmap.description,
            category: category,
            source: "profile",
            stages: roadmap.stages,
            overallProgress: 0,
            estimatedCompletionTime: this.calculateTotalTime(roadmap.stages, profile.timeAvailability || "moderate"),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    /**
     * Generate roadmap from CV analysis
     */
    private async generateFromCV(userId: string, profile: UserProfile, cvText: string): Promise<Roadmap> {
        // Extract skills from CV
        const currentSkills = await this.extractSkillsFromCV(cvText);
        
        // Determine category from skills
        const category = this.determineCategoryFromSkills(currentSkills);
        
        // Identify skill gaps based on learning goals
        const skillGaps = await this.analyzeSkillGaps(currentSkills, profile.learningGoals || []);
        
        // Generate roadmap to fill gaps
        const roadmap = await this.generateWithAI(
            `Create a learning roadmap to fill these skill gaps: ${skillGaps.map(g => g.skill).join(", ")}.
            Current skills: ${currentSkills.join(", ")}.
            Learning goals: ${profile.learningGoals?.join(", ")}.
            Learning styles: ${profile.learningStyles?.join(", ")}.
            Time availability: ${profile.timeAvailability}.`,
            profile,
            category
        );

        return {
            userId: new ObjectId(userId),
            title: roadmap.title,
            description: roadmap.description,
            category: category,
            source: "cv-analysis",
            sourceData: {
                cvSource: "uploaded-cv"
            },
            stages: roadmap.stages,
            overallProgress: 0,
            estimatedCompletionTime: this.calculateTotalTime(roadmap.stages, profile.timeAvailability || "moderate"),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    /**
     * Generate roadmap from job description
     */
    private async generateFromJD(userId: string, profile: UserProfile, jdText: string): Promise<Roadmap> {
        // Extract requirements from JD
        const requirements = await this.semanticMatcher.extractRequirements(jdText);
        const requiredSkills = requirements.map(r => r.text);
        
        // Determine category from requirements
        const category = this.determineCategoryFromSkills(requiredSkills);
        
        // Generate roadmap to meet requirements
        const roadmap = await this.generateWithAI(
            `Create a learning roadmap to meet these job requirements: ${requiredSkills.slice(0, 10).join(", ")}.
            Learning styles: ${profile.learningStyles?.join(", ")}.
            Time availability: ${profile.timeAvailability}.`,
            profile,
            category
        );

        return {
            userId: new ObjectId(userId),
            title: roadmap.title,
            description: roadmap.description,
            category: category,
            source: "jd-analysis",
            sourceData: {
                jdSource: "uploaded-jd"
            },
            stages: roadmap.stages,
            overallProgress: 0,
            estimatedCompletionTime: this.calculateTotalTime(roadmap.stages, profile.timeAvailability || "moderate"),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    /**
     * Generate hybrid roadmap from CV + JD
     */
    private async generateHybrid(
        userId: string,
        profile: UserProfile,
        cvText: string,
        jdText: string,
        semanticMatchResult?: any
    ): Promise<Roadmap> {
        // Extract skills and requirements
        const currentSkills = await this.extractSkillsFromCV(cvText);
        const requirements = await this.semanticMatcher.extractRequirements(jdText);
        const requiredSkills = requirements.map(r => r.text);
        
        // Use semantic match results if available to identify gaps
        let skillGaps: SkillGap[] = [];
        if (semanticMatchResult) {
            skillGaps = this.extractGapsFromMatchResult(semanticMatchResult);
        } else {
            // Perform semantic matching to identify gaps
            try {
                const matchResult = await this.semanticMatcher.match(
                    cvText,
                    jdText,
                    userId,
                    "cv",
                    "jd"
                );
                skillGaps = this.extractGapsFromMatchResult(matchResult);
            } catch (error) {
                console.error("Error performing semantic match:", error);
                // Fallback to simple gap analysis
                skillGaps = await this.analyzeSkillGaps(currentSkills, requiredSkills);
            }
        }
        
        // Determine category
        const category = this.determineCategoryFromSkills(requiredSkills);
        
        // Generate roadmap focused on high-priority gaps
        const highPriorityGaps = skillGaps
            .filter(g => g.importance === "high")
            .map(g => g.skill)
            .slice(0, 10);
        
        const roadmap = await this.generateWithAI(
            `Create a learning roadmap to fill these skill gaps for a job application: ${highPriorityGaps.join(", ")}.
            Current skills: ${currentSkills.slice(0, 10).join(", ")}.
            Job requirements: ${requiredSkills.slice(0, 10).join(", ")}.
            Learning styles: ${profile.learningStyles?.join(", ")}.
            Time availability: ${profile.timeAvailability}.`,
            profile,
            category
        );

        return {
            userId: new ObjectId(userId),
            title: roadmap.title,
            description: roadmap.description,
            category: category,
            source: "hybrid",
            sourceData: {
                cvSource: "uploaded-cv",
                jdSource: "uploaded-jd",
                semanticMatchScore: semanticMatchResult?.overallScore
            },
            stages: roadmap.stages,
            overallProgress: 0,
            estimatedCompletionTime: this.calculateTotalTime(roadmap.stages, profile.timeAvailability || "moderate"),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    /**
     * Generate roadmap using AI/LLM
     */
    private async generateWithAI(
        context: string,
        profile: UserProfile,
        category: string
    ): Promise<{ title: string; description: string; stages: RoadmapStage[] }> {
        // For now, use template-based generation
        // TODO: Integrate with LLM for AI-powered generation
        return this.generateFromTemplate(category, profile);
    }

    /**
     * Generate roadmap from template
     */
    private generateFromTemplate(category: string, profile: UserProfile): { title: string; description: string; stages: RoadmapStage[] } {
        // Get template for category
        const template = this.getTemplate(category);
        
        // Customize based on profile
        const stages = template.stages.map((stage, stageIndex) => ({
            ...stage,
            order: stageIndex + 1,
            modules: stage.modules.map((module, moduleIndex) => {
                const { estimatedTime, estimatedHours } = this.calculateTimeEstimate(
                    module,
                    profile.timeAvailability || "moderate"
                );
                
                const resources = this.recommendResources(module, profile.learningStyles || []);
                
                return {
                    ...module,
                    id: `${category}-${stage.id}-${module.id}`,
                    order: moduleIndex + 1,
                    status: (moduleIndex === 0 ? "available" : "locked") as "available" | "locked" | "completed" | "in-progress",
                    estimatedTime,
                    estimatedHours,
                    resources,
                    progress: 0,
                    prerequisites: module.prerequisites?.map(p => `${category}-${stage.id}-${p}`)
                };
            })
        }));

        return {
            title: template.title,
            description: template.description,
            stages
        };
    }

    /**
     * Get roadmap template for category
     */
    private getTemplate(category: string): { title: string; description: string; stages: RoadmapStage[] } {
        // Default frontend template (can be expanded)
        const templates: Record<string, { title: string; description: string; stages: RoadmapStage[] }> = {
            frontend: {
                title: "Front-End Developer Roadmap",
                description: "A comprehensive guide to becoming a front-end developer",
                stages: [
                    {
                        id: "fundamentals",
                        name: "Fundamentals",
                        description: "Build a strong foundation",
                        order: 1,
                        modules: [
                            {
                                id: "html-css",
                                title: "HTML & CSS",
                                description: "Learn the building blocks of web development",
                                status: "available",
                                order: 1,
                                estimatedTime: "2-3 weeks",
                                estimatedHours: 40,
                                resources: [],
                                progress: 0
                            },
                            {
                                id: "javascript-basics",
                                title: "JavaScript Basics",
                                description: "Master the fundamentals of JavaScript programming",
                                status: "locked",
                                order: 2,
                                estimatedTime: "3-4 weeks",
                                estimatedHours: 60,
                                resources: [],
                                progress: 0,
                                prerequisites: ["html-css"]
                            },
                            {
                                id: "git",
                                title: "Version Control (Git)",
                                description: "Learn to track changes and collaborate with Git",
                                status: "locked",
                                order: 3,
                                estimatedTime: "1-2 weeks",
                                estimatedHours: 20,
                                resources: [],
                                progress: 0
                            },
                            {
                                id: "responsive-design",
                                title: "Responsive Design",
                                description: "Create layouts that work on all devices",
                                status: "locked",
                                order: 4,
                                estimatedTime: "2 weeks",
                                estimatedHours: 30,
                                resources: [],
                                progress: 0,
                                prerequisites: ["html-css"]
                            }
                        ]
                    },
                    {
                        id: "frameworks",
                        name: "Frameworks & Libraries",
                        description: "Modern development tools",
                        order: 2,
                        modules: [
                            {
                                id: "react",
                                title: "React",
                                description: "Build user interfaces with React",
                                status: "locked",
                                order: 1,
                                estimatedTime: "4-6 weeks",
                                estimatedHours: 80,
                                resources: [],
                                progress: 0,
                                prerequisites: ["javascript-basics"]
                            },
                            {
                                id: "typescript",
                                title: "TypeScript",
                                description: "Add type safety to JavaScript",
                                status: "locked",
                                order: 2,
                                estimatedTime: "2-3 weeks",
                                estimatedHours: 40,
                                resources: [],
                                progress: 0,
                                prerequisites: ["javascript-basics"]
                            },
                            {
                                id: "nextjs",
                                title: "Next.js",
                                description: "Full-stack React framework",
                                status: "locked",
                                order: 3,
                                estimatedTime: "3-4 weeks",
                                estimatedHours: 60,
                                resources: [],
                                progress: 0,
                                prerequisites: ["react"]
                            }
                        ]
                    },
                    {
                        id: "advanced",
                        name: "Advanced Topics",
                        description: "Take your skills to the next level",
                        order: 3,
                        modules: [
                            {
                                id: "state-management",
                                title: "State Management",
                                description: "Manage complex application state",
                                status: "locked",
                                order: 1,
                                estimatedTime: "2-3 weeks",
                                estimatedHours: 40,
                                resources: [],
                                progress: 0,
                                prerequisites: ["react"]
                            },
                            {
                                id: "performance",
                                title: "Performance Optimization",
                                description: "Make your apps fast and efficient",
                                status: "locked",
                                order: 2,
                                estimatedTime: "2-3 weeks",
                                estimatedHours: 40,
                                resources: [],
                                progress: 0,
                                prerequisites: ["react"]
                            },
                            {
                                id: "testing",
                                title: "Testing",
                                description: "Write reliable tests for your code",
                                status: "locked",
                                order: 3,
                                estimatedTime: "2-3 weeks",
                                estimatedHours: 40,
                                resources: [],
                                progress: 0,
                                prerequisites: ["react"]
                            },
                            {
                                id: "deployment",
                                title: "Deployment & DevOps",
                                description: "Deploy and maintain production apps",
                                status: "locked",
                                order: 4,
                                estimatedTime: "2-3 weeks",
                                estimatedHours: 40,
                                resources: [],
                                progress: 0,
                                prerequisites: ["nextjs"]
                            }
                        ]
                    }
                ]
            }
        };

        return templates[category] || templates.frontend;
    }

    /**
     * Calculate time estimate based on user availability
     */
    private calculateTimeEstimate(
        module: RoadmapModule,
        timeAvailability: string
    ): { estimatedTime: string; estimatedHours: number } {
        const baseHours = module.estimatedHours || 40;
        
        // Adjust based on time availability
        const timeMultipliers: Record<string, number> = {
            minimal: 2.0,      // < 5 hours/week - takes longer
            moderate: 1.0,     // 5-15 hours/week - normal pace
            intensive: 0.7,    // 15-30 hours/week - faster
            fulltime: 0.5      // 40+ hours/week - much faster
        };
        
        const multiplier = timeMultipliers[timeAvailability] || 1.0;
        const adjustedHours = Math.round(baseHours * multiplier);
        
        // Convert to weeks estimate
        const hoursPerWeek: Record<string, number> = {
            minimal: 3,
            moderate: 10,
            intensive: 22,
            fulltime: 40
        };
        
        const weeklyHours = hoursPerWeek[timeAvailability] || 10;
        const weeks = Math.ceil(adjustedHours / weeklyHours);
        
        let estimatedTime: string;
        if (weeks === 1) {
            estimatedTime = "1 week";
        } else if (weeks <= 2) {
            estimatedTime = "1-2 weeks";
        } else if (weeks <= 4) {
            estimatedTime = "2-4 weeks";
        } else if (weeks <= 6) {
            estimatedTime = "4-6 weeks";
        } else {
            estimatedTime = `${weeks} weeks`;
        }
        
        return { estimatedTime, estimatedHours: adjustedHours };
    }

    /**
     * Recommend resources based on learning styles
     */
    private recommendResources(
        module: RoadmapModule,
        learningStyles: string[]
    ): LearningResource[] {
        // Default resources for each module type
        const resourceTemplates: Record<string, LearningResource[]> = {
            "html-css": [
                {
                    id: "html-css-1",
                    type: "course",
                    title: "HTML & CSS Basics",
                    url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/",
                    description: "FreeCodeCamp Responsive Web Design",
                    difficulty: "beginner",
                    completed: false
                },
                {
                    id: "html-css-2",
                    type: "article",
                    title: "MDN HTML Guide",
                    url: "https://developer.mozilla.org/en-US/docs/Web/HTML",
                    description: "Comprehensive HTML documentation",
                    difficulty: "beginner",
                    completed: false
                }
            ],
            "javascript-basics": [
                {
                    id: "js-1",
                    type: "course",
                    title: "JavaScript Fundamentals",
                    url: "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/",
                    description: "FreeCodeCamp JavaScript course",
                    difficulty: "beginner",
                    completed: false
                },
                {
                    id: "js-2",
                    type: "book",
                    title: "Eloquent JavaScript",
                    url: "https://eloquentjavascript.net/",
                    description: "Free online book",
                    difficulty: "intermediate",
                    completed: false
                }
            ]
        };

        let resources = resourceTemplates[module.id] || [];
        
        // Filter and prioritize based on learning styles
        if (learningStyles.length > 0) {
            // Prioritize resources matching learning styles
            resources = resources.sort((a, b) => {
                const aMatch = learningStyles.includes(a.type) ? 1 : 0;
                const bMatch = learningStyles.includes(b.type) ? 1 : 0;
                return bMatch - aMatch;
            });
        }
        
        // Add default resources if none exist
        if (resources.length === 0) {
            resources = [
                {
                    id: `${module.id}-default-1`,
                    type: "article",
                    title: `${module.title} - Getting Started`,
                    description: `Learn ${module.title}`,
                    difficulty: "beginner",
                    completed: false
                }
            ];
        }
        
        return resources;
    }

    /**
     * Extract skills from CV text
     */
    private async extractSkillsFromCV(cvText: string): Promise<string[]> {
        const cvSections = await this.semanticMatcher.extractCVSections(cvText);
        const skills: string[] = [];
        
        // Extract from skills section
        const skillsSection = cvSections.find(s => s.type === "skills");
        if (skillsSection) {
            // Simple extraction - look for common skill patterns
            const skillPatterns = [
                /(?:proficient|experienced|skilled|expert)\s+in\s+([^,\.]+)/gi,
                /(?:technologies?|tools?|languages?|frameworks?):\s*([^\.]+)/gi,
                /(?:skills?|expertise):\s*([^\.]+)/gi
            ];
            
            for (const pattern of skillPatterns) {
                const matches = skillsSection.text.matchAll(pattern);
                for (const match of matches) {
                    const skillText = match[1]?.trim();
                    if (skillText && skillText.length > 2) {
                        skills.push(...skillText.split(/[,;]/).map(s => s.trim()));
                    }
                }
            }
        }
        
        // Also extract from experience sections
        const experienceSections = cvSections.filter(s => s.type === "experience");
        for (const section of experienceSections) {
            // Look for technology mentions
            const techPattern = /\b(?:React|Vue|Angular|Node\.?js|Python|Java|JavaScript|TypeScript|AWS|Docker|Kubernetes|MongoDB|PostgreSQL|MySQL|Git|Linux|Windows|MacOS)\b/gi;
            const matches = section.text.matchAll(techPattern);
            for (const match of matches) {
                if (!skills.includes(match[0])) {
                    skills.push(match[0]);
                }
            }
        }
        
        return skills.slice(0, 20); // Limit to top 20 skills
    }

    /**
     * Analyze skill gaps
     */
    private async analyzeSkillGaps(
        currentSkills: string[],
        requiredSkills: string[]
    ): Promise<SkillGap[]> {
        const gaps: SkillGap[] = [];
        const currentLower = currentSkills.map(s => s.toLowerCase());
        
        for (const required of requiredSkills) {
            const requiredLower = required.toLowerCase();
            
            // Check if skill exists in current skills
            const hasSkill = currentLower.some(current => 
                current.includes(requiredLower) || requiredLower.includes(current)
            );
            
            if (!hasSkill) {
                gaps.push({
                    skill: required,
                    importance: "medium", // Can be enhanced with semantic analysis
                    currentLevel: 0,
                    requiredLevel: 80
                });
            }
        }
        
        return gaps;
    }

    /**
     * Extract gaps from semantic match result
     */
    private extractGapsFromMatchResult(matchResult: any): SkillGap[] {
        const gaps: SkillGap[] = [];
        
        if (matchResult.requirements) {
            for (const req of matchResult.requirements) {
                if (req.status === "not_matched" || req.status === "partially_matched") {
                    gaps.push({
                        skill: req.requirement,
                        importance: req.matchScore < 0.3 ? "high" : "medium",
                        currentLevel: Math.round(req.matchScore * 100),
                        requiredLevel: 80
                    });
                }
            }
        }
        
        return gaps;
    }

    /**
     * Determine category from learning goals
     */
    private determineCategoryFromGoals(goals: string[]): string {
        const goalToCategory: Record<string, string> = {
            career_skills: "frontend", // Default
            certifications: "frontend",
            switch_career: "frontend",
            exams: "frontend",
            personal_interest: "frontend"
        };
        
        for (const goal of goals) {
            if (goalToCategory[goal]) {
                return goalToCategory[goal];
            }
        }
        
        return "frontend"; // Default
    }

    /**
     * Determine category from skills
     */
    private determineCategoryFromSkills(skills: string[]): string {
        const skillLower = skills.map(s => s.toLowerCase()).join(" ");
        
        if (skillLower.match(/\b(react|vue|angular|frontend|ui|ux|css|html)\b/)) {
            return "frontend";
        } else if (skillLower.match(/\b(node|backend|api|server|database|sql|nosql)\b/)) {
            return "backend";
        } else if (skillLower.match(/\b(python|data|machine learning|ai|ml|data science)\b/)) {
            return "data-science";
        } else if (skillLower.match(/\b(devops|docker|kubernetes|aws|azure|cloud)\b/)) {
            return "devops";
        }
        
        return "frontend"; // Default
    }

    /**
     * Calculate total completion time
     */
    private calculateTotalTime(stages: RoadmapStage[], timeAvailability: string): string {
        const totalHours = stages.reduce((sum, stage) => {
            return sum + stage.modules.reduce((moduleSum, module) => {
                return moduleSum + module.estimatedHours;
            }, 0);
        }, 0);
        
        const hoursPerWeek: Record<string, number> = {
            minimal: 3,
            moderate: 10,
            intensive: 22,
            fulltime: 40
        };
        
        const weeklyHours = hoursPerWeek[timeAvailability] || 10;
        const totalWeeks = Math.ceil(totalHours / weeklyHours);
        
        if (totalWeeks < 4) {
            return `${totalWeeks} weeks`;
        } else if (totalWeeks < 12) {
            return `${Math.round(totalWeeks / 4)} months`;
        } else {
            return `${Math.round(totalWeeks / 12)} year${Math.round(totalWeeks / 12) > 1 ? 's' : ''}`;
        }
    }
}
