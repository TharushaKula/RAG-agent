import { ObjectId } from "mongodb";
import { Roadmap, RoadmapStage, RoadmapModule, LearningResource } from "../models/Roadmap";
import { getUsersCollection } from "../models/User";
import { getVectorStore } from "./ragService";
import { EmbeddingService } from "./embeddingService";
import { SemanticMatcher } from "./semanticMatcher";
import { RoadmapAgent } from "./roadmapAgent";

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
    private roadmapAgent: RoadmapAgent;

    constructor(embeddingServiceUrl?: string) {
        this.embeddingService = new EmbeddingService(embeddingServiceUrl);
        this.semanticMatcher = new SemanticMatcher(this.embeddingService, 0.45);
        
        // Initialize AI-powered Roadmap Agent
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
        const ollamaModel = process.env.OLLAMA_MODEL || "gpt-oss:20b-cloud";
        this.roadmapAgent = new RoadmapAgent(ollamaBaseUrl, ollamaModel);
    }

    /**
     * Main generation method
     */
    async generateRoadmap(
        userId: string,
        source: "cv" | "jd" | "hybrid",
        inputData: {
            profile?: UserProfile;
            cvText?: string;
            jdText?: string;
            cvSource?: string;
            jdSource?: string;
            semanticMatchResult?: any;
        }
    ): Promise<Roadmap> {
        // Get user profile (used for CV/JD/hybrid personalization)
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
     * Generate roadmap from CV analysis using AI Agent
     */
    private async generateFromCV(userId: string, profile: UserProfile, cvText: string): Promise<Roadmap> {
        // Extract skills from CV for gap analysis
        const currentSkills = await this.extractSkillsFromCV(cvText);
        
        // Identify skill gaps based on learning goals
        const skillGaps = await this.analyzeSkillGaps(currentSkills, profile.learningGoals || []);
        
        // Use AI-powered Roadmap Agent
        const roadmap = await this.roadmapAgent.generateFromCV(userId, profile, cvText, skillGaps);
        
        // Ensure userId is ObjectId
        roadmap.userId = new ObjectId(userId);
        
        return roadmap;
    }

    /**
     * Generate roadmap from job description using AI Agent
     */
    private async generateFromJD(userId: string, profile: UserProfile, jdText: string): Promise<Roadmap> {
        // Use AI-powered Roadmap Agent
        const roadmap = await this.roadmapAgent.generateFromJD(userId, profile, jdText);
        
        // Ensure userId is ObjectId
        roadmap.userId = new ObjectId(userId);
        
        return roadmap;
    }

    /**
     * Generate hybrid roadmap from CV + JD using AI Agent
     */
    private async generateHybrid(
        userId: string,
        profile: UserProfile,
        cvText: string,
        jdText: string,
        semanticMatchResult?: any
    ): Promise<Roadmap> {
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
                const currentSkills = await this.extractSkillsFromCV(cvText);
                const requirements = await this.semanticMatcher.extractRequirements(jdText);
                const requiredSkills = requirements.map(r => r.text);
                skillGaps = await this.analyzeSkillGaps(currentSkills, requiredSkills);
            }
        }
        
        // Use AI-powered Roadmap Agent
        const roadmap = await this.roadmapAgent.generateHybrid(
            userId,
            profile,
            cvText,
            jdText,
            skillGaps,
            semanticMatchResult?.overallScore
        );
        
        // Ensure userId is ObjectId
        roadmap.userId = new ObjectId(userId);
        
        return roadmap;
    }

    // Removed: generateWithAI, generateFromTemplate, and getTemplate methods
    // These are now handled by the RoadmapAgent service

    // Removed: calculateTimeEstimate method
    // Time estimation is now handled by RoadmapAgent

    // Removed: recommendResources method
    // Resource recommendation is now handled by RoadmapAgent which fetches real resources

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
