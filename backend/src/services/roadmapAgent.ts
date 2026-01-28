import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Roadmap, RoadmapStage, RoadmapModule, LearningResource } from "../models/Roadmap";
import { YouTubeService } from "./youtubeService";
import { MicrosoftLearnService } from "./microsoftLearnService";
import { MITOCWService } from "./mitOcwService";
import { OpenLibraryService } from "./openLibraryService";
import axios from "axios";

interface UserProfile {
    learningStyles?: string[];
    timeAvailability?: string;
    learningGoals?: string[];
    age?: number;
}

interface SkillGap {
    skill: string;
    importance: "high" | "medium" | "low";
    currentLevel: number;
    requiredLevel: number;
}

/**
 * Intelligent Roadmap Generation Agent using LangChain
 * 
 * This agent uses AI to generate personalized learning roadmaps based on:
 * - User profile and learning preferences
 * - CV analysis and skill gaps
 * - Job description requirements
 * - Hybrid analysis combining CV and JD
 */
export class RoadmapAgent {
    private llm: ChatOllama;
    private youtubeService: YouTubeService;
    private microsoftLearnService: MicrosoftLearnService;
    private mitOcwService: MITOCWService;
    private openLibraryService: OpenLibraryService;

    constructor(ollamaBaseUrl: string = "http://127.0.0.1:11434", ollamaModel: string = "gpt-oss:20b-cloud") {
        // Initialize LLM with same configuration as chatController
        this.llm = new ChatOllama({
            model: ollamaModel,
            baseUrl: ollamaBaseUrl,
            temperature: 0.7, // Balanced creativity and consistency
        });

        // Initialize learning material services
        this.youtubeService = new YouTubeService();
        this.microsoftLearnService = new MicrosoftLearnService();
        this.mitOcwService = new MITOCWService();
        this.openLibraryService = new OpenLibraryService();
    }

    /**
     * Check if Ollama is accessible
     */
    async checkOllamaConnection(): Promise<{ available: boolean; error?: string }> {
        try {
            const baseUrl = (this.llm as any).baseUrl || 'http://127.0.0.1:11434';
            const response = await axios.get(`${baseUrl}/api/tags`, {
                timeout: 5000
            });
            return { available: true };
        } catch (error: any) {
            return {
                available: false,
                error: error.message || 'Ollama is not accessible'
            };
        }
    }

    /**
     * Generate roadmap from user profile
     */
    async generateFromProfile(
        userId: string,
        profile: UserProfile,
        category?: string
    ): Promise<Roadmap> {
        const context = this.buildProfileContext(profile);
        const detectedCategory = category || this.determineCategoryFromGoals(profile.learningGoals || []);

        const roadmapData = await this.generateRoadmapWithAI(
            context,
            profile,
            detectedCategory,
            "profile"
        );

        return this.formatRoadmap(userId, roadmapData, detectedCategory, "profile", profile);
    }

    /**
     * Generate roadmap from CV analysis
     */
    async generateFromCV(
        userId: string,
        profile: UserProfile,
        cvText: string,
        skillGaps?: SkillGap[]
    ): Promise<Roadmap> {
        const context = this.buildCVContext(cvText, skillGaps, profile);
        const category = this.determineCategoryFromSkills(cvText);

        const roadmapData = await this.generateRoadmapWithAI(
            context,
            profile,
            category,
            "cv-analysis"
        );

        return this.formatRoadmap(
            userId,
            roadmapData,
            category,
            "cv-analysis",
            profile,
            { cvSource: "uploaded-cv" }
        );
    }

    /**
     * Generate roadmap from job description
     */
    async generateFromJD(
        userId: string,
        profile: UserProfile,
        jdText: string
    ): Promise<Roadmap> {
        const context = this.buildJDContext(jdText, profile);
        const category = this.determineCategoryFromSkills(jdText);

        const roadmapData = await this.generateRoadmapWithAI(
            context,
            profile,
            category,
            "jd-analysis"
        );

        return this.formatRoadmap(
            userId,
            roadmapData,
            category,
            "jd-analysis",
            profile,
            { jdSource: "uploaded-jd" }
        );
    }

    /**
     * Generate hybrid roadmap from CV + JD
     */
    async generateHybrid(
        userId: string,
        profile: UserProfile,
        cvText: string,
        jdText: string,
        skillGaps?: SkillGap[],
        semanticMatchScore?: number
    ): Promise<Roadmap> {
        const context = this.buildHybridContext(cvText, jdText, skillGaps, profile);
        const category = this.determineCategoryFromSkills(jdText);

        const roadmapData = await this.generateRoadmapWithAI(
            context,
            profile,
            category,
            "hybrid"
        );

        return this.formatRoadmap(
            userId,
            roadmapData,
            category,
            "hybrid",
            profile,
            {
                cvSource: "uploaded-cv",
                jdSource: "uploaded-jd",
                semanticMatchScore
            }
        );
    }

    /**
     * Core AI generation method using LangChain
     */
    private async generateRoadmapWithAI(
        context: string,
        profile: UserProfile,
        category: string,
        source: string
    ): Promise<{ title: string; description: string; stages: RoadmapStage[] }> {
        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                `You are an expert AI learning path architect. Your task is to create comprehensive, personalized learning roadmaps.

Your roadmaps must:
1. Be structured in 3-5 progressive stages (Fundamentals → Intermediate → Advanced → Specialization)
2. Each stage should have 3-6 modules
3. Modules should have clear prerequisites and dependencies
4. Be tailored to the user's learning style, time availability, and goals
5. Include realistic time estimates based on the user's availability

IMPORTANT: You must respond with valid JSON only, following this exact structure:
{
  "title": "Roadmap title (e.g., 'Full-Stack Web Development Roadmap')",
  "description": "Brief description of the roadmap (2-3 sentences)",
  "stages": [
    {
      "id": "stage-id-1",
      "name": "Stage Name",
      "description": "Stage description",
      "order": 1,
      "modules": [
        {
          "id": "module-id-1",
          "title": "Module Title",
          "description": "Detailed module description (2-3 sentences)",
          "order": 1,
          "estimatedHours": 40,
          "prerequisites": []
        }
      ]
    }
  ]
}

User Context:
{context}

User Profile:
- Learning Styles: ${profile.learningStyles?.join(", ") || "Not specified"}
- Time Availability: ${profile.timeAvailability || "moderate"}
- Learning Goals: ${profile.learningGoals?.join(", ") || "Not specified"}

Category: ${category}
Source: ${source}

Generate a comprehensive, personalized roadmap. Focus on practical, actionable learning paths.`,
            ],
            [
                "user",
                `Create a detailed learning roadmap based on the provided context. Ensure the roadmap is:
- Progressive (each stage builds on previous)
- Practical (focus on skills that can be applied)
- Realistic (time estimates match user's availability)
- Comprehensive (cover all necessary topics)

Return ONLY valid JSON, no additional text.`
            ],
        ]);

        const chain = RunnableSequence.from([
            prompt,
            this.llm,
            new StringOutputParser()
        ]);

        try {
            // Check Ollama connection first
            const ollamaCheck = await this.checkOllamaConnection();
            if (!ollamaCheck.available) {
                console.error("Ollama is not accessible:", ollamaCheck.error);
                throw new Error(`Ollama service is not available: ${ollamaCheck.error}. Please ensure Ollama is running (ollama serve)`);
            }

            console.log(`🤖 Generating roadmap with AI (category: ${category}, source: ${source})...`);
            
            // Add timeout wrapper for the chain invocation
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Roadmap generation timed out after 2 minutes")), 120000);
            });
            
            const response = await Promise.race([
                chain.invoke({ context }),
                timeoutPromise
            ]) as string;
            
            // Parse JSON response - try to extract JSON from markdown code blocks or plain JSON
            let jsonText = response.trim();
            
            // Remove markdown code blocks if present
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // Try to find JSON object
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error("No JSON found in LLM response. Response:", response.slice(0, 500));
                throw new Error("No JSON found in LLM response. The AI model may not be responding correctly.");
            }

            let roadmapData;
            try {
                roadmapData = JSON.parse(jsonMatch[0]);
            } catch (parseError: any) {
                console.error("JSON parse error:", parseError.message);
                console.error("Attempted to parse:", jsonMatch[0].slice(0, 500));
                throw new Error(`Failed to parse JSON from AI response: ${parseError.message}`);
            }

            // Validate basic structure
            if (!roadmapData.stages || !Array.isArray(roadmapData.stages)) {
                throw new Error("Invalid roadmap structure: missing stages array");
            }

            if (roadmapData.stages.length === 0) {
                throw new Error("Invalid roadmap structure: no stages generated");
            }

            console.log(`✅ AI generated ${roadmapData.stages.length} stages`);
            
            // Validate and enrich with resources
            return await this.enrichRoadmapWithResources(roadmapData, category, profile);
        } catch (error: any) {
            console.error("Roadmap generation error:", error);
            console.error("Error stack:", error.stack);
            
            // If it's an Ollama connection error, don't fallback - throw it
            if (error.message?.includes("Ollama service is not available")) {
                throw error;
            }
            
            // Fallback to template-based generation if AI fails
            console.warn("Falling back to basic roadmap structure");
            return this.generateFallbackRoadmap(category, profile);
        }
    }

    /**
     * Enrich roadmap modules with real learning resources
     */
    private async enrichRoadmapWithResources(
        roadmapData: any,
        category: string,
        profile: UserProfile
    ): Promise<{ title: string; description: string; stages: RoadmapStage[] }> {
        const enrichedStages: RoadmapStage[] = [];

        try {
            for (const stage of roadmapData.stages || []) {
                const enrichedModules: RoadmapModule[] = [];

                for (const module of stage.modules || []) {
                    try {
                        // Fetch resources for this module (with timeout)
                        const resources = await Promise.race([
                            this.fetchLearningResources(
                                module.title,
                                module.description || '',
                                category,
                                profile.learningStyles || []
                            ),
                            new Promise<LearningResource[]>((resolve) => 
                                setTimeout(() => resolve([]), 10000) // 10s timeout per module
                            )
                        ]);

                        // Calculate time estimates based on user availability
                        const { estimatedTime, estimatedHours } = this.calculateTimeEstimate(
                            module.estimatedHours || 40,
                            profile.timeAvailability || "moderate"
                        );

                        enrichedModules.push({
                            id: module.id || `${stage.id}-${module.order || enrichedModules.length + 1}`,
                            title: module.title || 'Untitled Module',
                            description: module.description || '',
                            status: (enrichedModules.length === 0 && enrichedStages.length === 0) ? "available" : "locked",
                            order: module.order || enrichedModules.length + 1,
                            estimatedTime,
                            estimatedHours,
                            resources: resources.slice(0, 8), // Limit to 8 resources per module
                            prerequisites: module.prerequisites || [],
                            progress: 0
                        });
                    } catch (moduleError: any) {
                        console.warn(`Error processing module "${module.title}":`, moduleError.message);
                        // Continue with module even if resource fetching fails
                        const { estimatedTime, estimatedHours } = this.calculateTimeEstimate(
                            module.estimatedHours || 40,
                            profile.timeAvailability || "moderate"
                        );
                        
                        enrichedModules.push({
                            id: module.id || `${stage.id}-${module.order || enrichedModules.length + 1}`,
                            title: module.title || 'Untitled Module',
                            description: module.description || '',
                            status: (enrichedModules.length === 0 && enrichedStages.length === 0) ? "available" : "locked",
                            order: module.order || enrichedModules.length + 1,
                            estimatedTime,
                            estimatedHours,
                            resources: [], // Empty resources if fetch fails
                            prerequisites: module.prerequisites || [],
                            progress: 0
                        });
                    }
                }

                enrichedStages.push({
                    id: stage.id || `stage-${enrichedStages.length + 1}`,
                    name: stage.name || `Stage ${enrichedStages.length + 1}`,
                    description: stage.description || '',
                    order: stage.order || enrichedStages.length + 1,
                    modules: enrichedModules,
                    prerequisites: stage.prerequisites || []
                });
            }
        } catch (error: any) {
            console.error("Error enriching roadmap with resources:", error);
            throw new Error(`Failed to enrich roadmap: ${error.message}`);
        }

        if (enrichedStages.length === 0) {
            throw new Error("No stages were successfully processed");
        }

        return {
            title: roadmapData.title || `${category} Learning Roadmap`,
            description: roadmapData.description || "A comprehensive learning path",
            stages: enrichedStages
        };
    }

    /**
     * Fetch learning resources from multiple services
     */
    private async fetchLearningResources(
        moduleTitle: string,
        moduleDescription: string,
        category: string,
        learningStyles: string[]
    ): Promise<LearningResource[]> {
        const resources: LearningResource[] = [];
        const searchQuery = `${moduleTitle} ${category}`;

        // Fetch from multiple sources in parallel
        const [youtubeVideos, msLearnResources, mitCourses, books] = await Promise.allSettled([
            this.youtubeService.isConfigured()
                ? this.youtubeService.searchVideos(searchQuery, 3).catch(() => [])
                : Promise.resolve([]),
            this.microsoftLearnService.searchResources(searchQuery, 3).catch(() => []),
            this.mitOcwService.searchCourses(searchQuery, 2).catch(() => []),
            this.openLibraryService.searchBooks(searchQuery, 2).catch(() => [])
        ]);

        // Process YouTube videos
        if (youtubeVideos.status === "fulfilled" && youtubeVideos.value.length > 0) {
            for (const video of youtubeVideos.value) {
                resources.push({
                    id: `yt-${video.id}`,
                    type: "video",
                    title: video.title,
                    url: video.url,
                    description: video.description.slice(0, 200),
                    duration: video.duration,
                    difficulty: this.inferDifficulty(video.title, video.description),
                    completed: false
                });
            }
        }

        // Process Microsoft Learn resources
        if (msLearnResources.status === "fulfilled" && msLearnResources.value.length > 0) {
            for (const resource of msLearnResources.value) {
                resources.push({
                    id: `mslearn-${resource.id}`,
                    type: resource.type === "course" ? "course" : "article",
                    title: resource.title,
                    url: resource.url,
                    description: resource.description.slice(0, 200),
                    duration: resource.duration,
                    difficulty: this.mapDifficulty(resource.level),
                    completed: false
                });
            }
        }

        // Process MIT OCW courses
        if (mitCourses.status === "fulfilled" && mitCourses.value.length > 0) {
            for (const course of mitCourses.value) {
                resources.push({
                    id: `mit-${course.id}`,
                    type: "course",
                    title: course.title,
                    url: course.url,
                    description: course.description.slice(0, 200),
                    difficulty: this.mapDifficulty(course.level),
                    completed: false
                });
            }
        }

        // Process books
        if (books.status === "fulfilled" && books.value.length > 0) {
            for (const book of books.value) {
                resources.push({
                    id: `book-${book.id}`,
                    type: "book",
                    title: book.title,
                    url: book.url,
                    description: book.description.slice(0, 200),
                    difficulty: "intermediate",
                    completed: false
                });
            }
        }

        // Prioritize resources based on learning styles
        return this.prioritizeResources(resources, learningStyles);
    }

    /**
     * Prioritize resources based on learning styles
     */
    private prioritizeResources(
        resources: LearningResource[],
        learningStyles: string[]
    ): LearningResource[] {
        if (learningStyles.length === 0) return resources;

        return resources.sort((a, b) => {
            const aScore = this.getLearningStyleScore(a, learningStyles);
            const bScore = this.getLearningStyleScore(b, learningStyles);
            return bScore - aScore;
        });
    }

    /**
     * Calculate learning style match score
     */
    private getLearningStyleScore(resource: LearningResource, learningStyles: string[]): number {
        const styleMap: Record<string, string[]> = {
            "visual": ["video", "course"],
            "reading": ["article", "book"],
            "hands-on": ["project", "course"],
            "audio": ["video", "podcast"]
        };

        let score = 0;
        for (const style of learningStyles) {
            const preferredTypes = styleMap[style.toLowerCase()] || [];
            if (preferredTypes.includes(resource.type)) {
                score += 1;
            }
        }
        return score;
    }

    /**
     * Infer difficulty from text
     */
    private inferDifficulty(title: string, description: string): "beginner" | "intermediate" | "advanced" {
        const text = `${title} ${description}`.toLowerCase();
        
        if (text.match(/\b(beginner|intro|basics|getting started|101|fundamentals)\b/)) {
            return "beginner";
        }
        if (text.match(/\b(advanced|expert|master|deep dive|advanced topics)\b/)) {
            return "advanced";
        }
        return "intermediate";
    }

    /**
     * Map service difficulty levels to our format
     */
    private mapDifficulty(level?: string): "beginner" | "intermediate" | "advanced" {
        if (!level) return "intermediate";
        
        const levelLower = level.toLowerCase();
        if (levelLower.includes("beginner") || levelLower.includes("introductory")) {
            return "beginner";
        }
        if (levelLower.includes("advanced") || levelLower.includes("expert")) {
            return "advanced";
        }
        return "intermediate";
    }

    /**
     * Calculate time estimates based on user availability
     */
    private calculateTimeEstimate(
        baseHours: number,
        timeAvailability: string
    ): { estimatedTime: string; estimatedHours: number } {
        const timeMultipliers: Record<string, number> = {
            minimal: 2.0,      // < 5 hours/week
            moderate: 1.0,     // 5-15 hours/week
            intensive: 0.7,   // 15-30 hours/week
            fulltime: 0.5      // 40+ hours/week
        };

        const multiplier = timeMultipliers[timeAvailability] || 1.0;
        const adjustedHours = Math.round(baseHours * multiplier);

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
     * Build context for profile-based generation
     */
    private buildProfileContext(profile: UserProfile): string {
        return `User wants to create a learning roadmap based on their profile:
- Learning Goals: ${profile.learningGoals?.join(", ") || "General skill development"}
- Learning Styles: ${profile.learningStyles?.join(", ") || "Mixed learning styles"}
- Time Availability: ${profile.timeAvailability || "moderate"}
- Age: ${profile.age || "Not specified"}

Create a comprehensive roadmap that aligns with their goals and learning preferences.`;
    }

    /**
     * Build context for CV-based generation
     */
    private buildCVContext(cvText: string, skillGaps?: SkillGap[], profile?: UserProfile): string {
        const gapsText = skillGaps && skillGaps.length > 0
            ? `\n\nIdentified Skill Gaps:\n${skillGaps.map(g => `- ${g.skill} (${g.importance} priority, current: ${g.currentLevel}%, required: ${g.requiredLevel}%)`).join("\n")}`
            : "";

        return `Generate a learning roadmap based on CV analysis:
${cvText.slice(0, 2000)}${gapsText}

Focus on filling skill gaps and building upon existing knowledge.`;
    }

    /**
     * Build context for JD-based generation
     */
    private buildJDContext(jdText: string, profile?: UserProfile): string {
        return `Generate a learning roadmap to meet these job requirements:
${jdText.slice(0, 2000)}

Create a structured path to acquire all necessary skills for this role.`;
    }

    /**
     * Build context for hybrid generation
     */
    private buildHybridContext(
        cvText: string,
        jdText: string,
        skillGaps?: SkillGap[],
        profile?: UserProfile
    ): string {
        const gapsText = skillGaps && skillGaps.length > 0
            ? `\n\nCritical Skill Gaps to Address:\n${skillGaps
                .filter(g => g.importance === "high")
                .slice(0, 10)
                .map(g => `- ${g.skill} (current: ${g.currentLevel}%, required: ${g.requiredLevel}%)`)
                .join("\n")}`
            : "";

        return `Generate a hybrid learning roadmap combining CV analysis and job requirements:

Current Skills (from CV):
${cvText.slice(0, 1000)}

Job Requirements:
${jdText.slice(0, 1000)}${gapsText}

Create a focused roadmap that bridges the gap between current skills and job requirements.`;
    }

    /**
     * Format roadmap data into Roadmap interface
     */
    private formatRoadmap(
        userId: string,
        roadmapData: { title: string; description: string; stages: RoadmapStage[] },
        category: string,
        source: "profile" | "cv-analysis" | "jd-analysis" | "hybrid",
        profile: UserProfile,
        sourceData?: any
    ): Roadmap {
        const totalHours = roadmapData.stages.reduce((sum, stage) => {
            return sum + stage.modules.reduce((moduleSum, module) => {
                return moduleSum + (module.estimatedHours || 0);
            }, 0);
        }, 0);

        const estimatedCompletionTime = this.calculateTotalTime(
            roadmapData.stages,
            profile.timeAvailability || "moderate"
        );

        return {
            userId: userId as any, // Will be converted to ObjectId in service
            title: roadmapData.title,
            description: roadmapData.description,
            category,
            source,
            sourceData,
            stages: roadmapData.stages,
            overallProgress: 0,
            estimatedCompletionTime,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    /**
     * Calculate total completion time
     */
    private calculateTotalTime(stages: RoadmapStage[], timeAvailability: string): string {
        const totalHours = stages.reduce((sum, stage) => {
            return sum + stage.modules.reduce((moduleSum, module) => {
                return moduleSum + (module.estimatedHours || 0);
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

    /**
     * Determine category from learning goals
     */
    private determineCategoryFromGoals(goals: string[]): string {
        const goalText = goals.join(" ").toLowerCase();
        
        if (goalText.match(/\b(frontend|react|vue|angular|ui|ux|html|css)\b/)) {
            return "frontend";
        }
        if (goalText.match(/\b(backend|node|api|server|database)\b/)) {
            return "backend";
        }
        if (goalText.match(/\b(data science|machine learning|ai|ml|python|analytics)\b/)) {
            return "data-science";
        }
        if (goalText.match(/\b(devops|docker|kubernetes|aws|azure|cloud)\b/)) {
            return "devops";
        }
        if (goalText.match(/\b(full.?stack|fullstack|web development)\b/)) {
            return "fullstack";
        }
        
        return "frontend"; // Default
    }

    /**
     * Determine category from skills text
     */
    private determineCategoryFromSkills(skillsText: string): string {
        const text = skillsText.toLowerCase();
        
        if (text.match(/\b(react|vue|angular|frontend|ui|ux|css|html|javascript|typescript)\b/)) {
            return "frontend";
        }
        if (text.match(/\b(node|backend|api|server|database|sql|nosql|express|fastapi)\b/)) {
            return "backend";
        }
        if (text.match(/\b(python|data|machine learning|ai|ml|data science|pandas|numpy|tensorflow)\b/)) {
            return "data-science";
        }
        if (text.match(/\b(devops|docker|kubernetes|aws|azure|cloud|terraform|ci\/cd)\b/)) {
            return "devops";
        }
        if (text.match(/\b(full.?stack|fullstack|mern|mean|web development)\b/)) {
            return "fullstack";
        }
        
        return "frontend"; // Default
    }

    /**
     * Fallback roadmap generation if AI fails
     */
    private generateFallbackRoadmap(
        category: string,
        profile: UserProfile
    ): { title: string; description: string; stages: RoadmapStage[] } {
        // Simple fallback structure
        return {
            title: `${category} Learning Roadmap`,
            description: "A structured learning path to master the fundamentals and advanced topics",
            stages: [
                {
                    id: "fundamentals",
                    name: "Fundamentals",
                    description: "Build a strong foundation",
                    order: 1,
                    modules: [
                        {
                            id: "intro",
                            title: "Introduction",
                            description: "Get started with the basics",
                            status: "available",
                            order: 1,
                            estimatedTime: "1-2 weeks",
                            estimatedHours: 20,
                            resources: [],
                            progress: 0
                        }
                    ]
                }
            ]
        };
    }
}
