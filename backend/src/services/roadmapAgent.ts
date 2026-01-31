import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Roadmap, RoadmapStage, RoadmapModule, LearningResource } from "../models/Roadmap";
import { YouTubeService } from "./youtubeService";
import { MicrosoftLearnService } from "./microsoftLearnService";
import { MITOCWService } from "./mitOcwService";
import { OpenLibraryService } from "./openLibraryService";
import { RoadmapValidatorAgent } from "./roadmapValidatorAgent";
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
    private validatorAgent: RoadmapValidatorAgent;

    constructor(ollamaBaseUrl: string = "http://127.0.0.1:11434", ollamaModel: string = "gpt-oss:20b-cloud") {
        // Initialize LLM with same configuration as chatController
        this.llm = new ChatOllama({
            model: ollamaModel,
            baseUrl: ollamaBaseUrl,
            temperature: 0.7, // Balanced creativity and consistency
        });

        // Initialize learning material services (YouTube, MS Learn, MIT OCW, Open Library / Books)
        this.youtubeService = new YouTubeService();
        this.microsoftLearnService = new MicrosoftLearnService();
        this.mitOcwService = new MITOCWService();
        this.openLibraryService = new OpenLibraryService();

        // Second agent: validates roadmap and provides feedback for refinement
        this.validatorAgent = new RoadmapValidatorAgent(ollamaBaseUrl, ollamaModel);
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
     * Determine learning/career category using AI from CV or JD text.
     * Supports many domains: frontend, backend, data-science, devops, fullstack,
     * business-analytics, qa, project-management, product-management, design, cybersecurity, etc.
     */
    async determineCategoryWithAI(text: string): Promise<string> {
        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                `You are a career and learning path classifier. Given a job description or CV/resume text, choose the single best learning category for a personalized roadmap.

Choose exactly ONE category from this list (use the slug as-is):
- frontend (web UI, React, Vue, Angular, CSS, JavaScript/TypeScript)
- backend (APIs, servers, databases, Node, Python, Java backends)
- fullstack (both frontend and backend)
- data-science (data analysis, ML, AI, Python, pandas, statistics)
- business-analytics (BI, reporting, SQL, Tableau, Power BI, analytics)
- devops (CI/CD, Docker, Kubernetes, cloud, infrastructure)
- qa (quality assurance, testing, test automation, Selenium)
- project-management (agile, scrum, PMP, delivery, planning)
- product-management (product, roadmap, stakeholders, UX collaboration)
- design (UX, UI design, Figma, user research)
- cybersecurity (security, penetration testing, compliance)
- mobile (iOS, Android, React Native, Flutter)
- general (if none of the above fit clearly)

Respond with valid JSON only: {{ "category": "slug", "reason": "one short sentence why" }} using one of the slugs above.`,
            ],
            ["user", "Classify this text:\n\n{text}\n\nRespond with JSON only: {{ \"category\": \"slug\", \"reason\": \"one short sentence why\" }}"],
        ]);
        const chain = RunnableSequence.from([prompt, this.llm, new StringOutputParser()]);
        const timeoutMs = 15000;
        try {
            const response = (await Promise.race([
                chain.invoke({ text: text.slice(0, 3000) }),
                new Promise<string>((_, reject) =>
                    setTimeout(() => reject(new Error("Category classification timed out")), timeoutMs)
                ),
            ])) as string;
            const cleaned = response.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                const slug = typeof parsed?.category === "string" ? parsed.category.trim().toLowerCase().replace(/\s+/g, "-") : "";
                const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() : "";
                if (slug && /^[a-z0-9-]+$/.test(slug)) {
                    console.log(`📂 Category: ${slug} — Why: ${reason || "(no reason given)"}`);
                    return slug;
                }
            }
        } catch (err: any) {
            console.warn("Category AI classification failed, using fallback:", err?.message || err);
        }
        const fallbackSlug = this.determineCategoryFromSkills(text);
        console.log(`📂 Category: ${fallbackSlug} (fallback from keywords — AI classification failed)`);
        return fallbackSlug;
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
        const category = await this.determineCategoryWithAI(cvText);

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
        const category = await this.determineCategoryWithAI(jdText);

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
        const category = await this.determineCategoryWithAI(jdText);

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

IMPORTANT: You must respond with valid JSON only. The JSON must include:
- "title": roadmap title (for example, "Full-Stack Web Development Roadmap")
- "description": brief roadmap description (2-3 sentences)
- "stages": an array of stage objects, each with:
  - "id"
  - "name"
  - "description"
  - "order"
  - "modules": an array of module objects, each with:
    - "id"
    - "title"
    - "description"
    - "order"
    - "estimatedHours"
    - "prerequisites" (array of module ids or names)

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
- Realistic (time estimates match the user's availability)
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

            // Second agent: validate roadmap; if invalid, refine up to MAX_REFINEMENT_ROUNDS times
            try {
                const MAX_REFINEMENT_ROUNDS = 2;
                const refinementPrompt = ChatPromptTemplate.fromMessages([
                    ["system", `You are an expert AI learning path architect. Your task is to create comprehensive, personalized learning roadmaps. You must respond with valid JSON only (title, description, stages with modules as previously specified).`],
                    [
                        "user",
                        `Previous roadmap was rejected by the validator. Fix the roadmap and return ONLY valid JSON.

Original context:
{context}

Validator feedback (you must address these):
{feedback}

Generate the corrected roadmap. Same JSON structure: title, description, stages (each with id, name, description, order, modules array). Each module: id, title, description, order, estimatedHours, prerequisites. Return ONLY valid JSON, no other text.`
                    ],
                ]);
                const refinementChain = RunnableSequence.from([refinementPrompt, this.llm, new StringOutputParser()]);

                for (let round = 0; round <= MAX_REFINEMENT_ROUNDS; round++) {
                    let validationResult: { valid: boolean; issues?: string[]; feedback?: string };
                    try {
                        validationResult = await this.validatorAgent.validate(
                            roadmapData,
                            context,
                            category,
                            source
                        );
                    } catch (validatorErr: any) {
                        console.warn("Validator error, skipping refinement:", validatorErr?.message || validatorErr);
                        break;
                    }
                    if (validationResult.valid) {
                        if (round > 0) {
                            console.log(`✅ Roadmap accepted after ${round} refinement(s)`);
                        }
                        break;
                    }
                    if (!validationResult.feedback || round === MAX_REFINEMENT_ROUNDS) {
                        if (round > 0) {
                            console.log(`⚠️ Using roadmap after ${round} refinement(s); validator still had concerns`);
                        }
                        break;
                    }
                    console.log(`🔍 Validator round ${round + 1}: ${validationResult.issues?.join("; ") || validationResult.feedback}`);
                    let refinementResponse: string;
                    try {
                        refinementResponse = await Promise.race([
                            refinementChain.invoke({ context, feedback: validationResult.feedback }),
                            timeoutPromise,
                        ]) as string;
                    } catch (refineErr: any) {
                        console.warn("Refinement error, using current roadmap:", refineErr?.message || refineErr);
                        break;
                    }
                    const refineText = refinementResponse.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
                    const refineMatch = refineText.match(/\{[\s\S]*\}/);
                    if (refineMatch) {
                        try {
                            const refined = JSON.parse(refineMatch[0]);
                            if (refined.stages && Array.isArray(refined.stages) && refined.stages.length > 0) {
                                roadmapData = refined;
                            }
                        } catch (_) {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            } catch (validationLoopErr: any) {
                console.warn("Validation/refinement loop error, continuing with current roadmap:", validationLoopErr?.message || validationLoopErr);
            }

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
     * Uses parallel processing and global timeout for efficiency
     */
    private async enrichRoadmapWithResources(
        roadmapData: any,
        category: string,
        profile: UserProfile
    ): Promise<{ title: string; description: string; stages: RoadmapStage[] }> {
        const GLOBAL_TIMEOUT = 45000; // 45 seconds max for entire enrichment
        const PER_MODULE_TIMEOUT = 5000; // 5 seconds per module
        const startTime = Date.now();

        console.log(`📚 Starting resource enrichment (timeout: ${GLOBAL_TIMEOUT / 1000}s). Sources: YouTube, MS Learn, MIT OCW, Open Library — unavailable sources are skipped.`);

        const enrichedStages: RoadmapStage[] = [];
        let isFirstModule = true;

        try {
            for (const stage of roadmapData.stages || []) {
                // Check global timeout before processing each stage
                if (Date.now() - startTime > GLOBAL_TIMEOUT) {
                    console.warn(`⏱️ Global timeout reached during enrichment. Skipping remaining stages.`);
                    break;
                }

                const stageModules = stage.modules || [];
                
                // Process all modules in a stage in parallel for speed
                const modulePromises = stageModules.map(async (module: any, moduleIndex: number) => {
                    const moduleStartTime = Date.now();
                    
                    // Skip resource fetching if we're running low on time
                    const remainingTime = GLOBAL_TIMEOUT - (Date.now() - startTime);
                    const shouldFetchResources = remainingTime > PER_MODULE_TIMEOUT;

                    let resources: LearningResource[] = [];
                    
                    if (shouldFetchResources) {
                        try {
                            resources = await Promise.race([
                                this.fetchLearningResources(
                                    module.title,
                                    module.description || '',
                                    category,
                                    profile.learningStyles || []
                                ),
                                new Promise<LearningResource[]>((resolve) => 
                                    setTimeout(() => resolve([]), PER_MODULE_TIMEOUT)
                                )
                            ]);
                        } catch (err: any) {
                            console.warn(`⚠️ Resource fetch failed for "${module.title}": ${err.message}`);
                        }
                    }

                    const { estimatedTime, estimatedHours } = this.calculateTimeEstimate(
                        module.estimatedHours || 40,
                        profile.timeAvailability || "moderate"
                    );

                    return {
                        id: module.id || `${stage.id}-${module.order || moduleIndex + 1}`,
                        title: module.title || 'Untitled Module',
                        description: module.description || '',
                        status: "locked" as const, // Will set first module to "available" after
                        order: module.order || moduleIndex + 1,
                        estimatedTime,
                        estimatedHours,
                        resources: resources.slice(0, 6), // Limit to 6 resources per module
                        prerequisites: module.prerequisites || [],
                        progress: 0
                    };
                });

                // Wait for all modules in this stage (with overall timeout protection)
                const enrichedModules = await Promise.all(modulePromises);

                // Sort by order and set first module's status
                enrichedModules.sort((a, b) => a.order - b.order);
                
                // Set the very first module of the entire roadmap to "available"
                if (isFirstModule && enrichedModules.length > 0) {
                    enrichedModules[0].status = "available";
                    isFirstModule = false;
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
            // If we have at least one stage, continue with what we have
            if (enrichedStages.length === 0) {
                throw new Error(`Failed to enrich roadmap: ${error.message}`);
            }
        }

        if (enrichedStages.length === 0) {
            throw new Error("No stages were successfully processed");
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Resource enrichment completed in ${elapsed}s (${enrichedStages.length} stages)`);

        return {
            title: roadmapData.title || `${category} Learning Roadmap`,
            description: roadmapData.description || "A comprehensive learning path",
            stages: enrichedStages
        };
    }

    /**
     * Fetch learning resources from all available APIs (YouTube, MS Learn, MIT OCW, Open Library/Books).
     * Uses all APIs in parallel so each module gets a mix of videos, courses, articles, and books.
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
     * Fallback: determine category from keyword matching when AI classification fails.
     */
    private determineCategoryFromSkills(skillsText: string): string {
        const text = skillsText.toLowerCase();
        if (text.match(/\b(react|vue|angular|frontend|ui|ux|css|html|javascript|typescript)\b/)) return "frontend";
        if (text.match(/\b(node|backend|api|server|database|sql|nosql|express|fastapi)\b/)) return "backend";
        if (text.match(/\b(python|data|machine learning|ai|ml|data science|pandas|numpy|tensorflow)\b/)) return "data-science";
        if (text.match(/\b(devops|docker|kubernetes|aws|azure|cloud|terraform|ci\/cd)\b/)) return "devops";
        if (text.match(/\b(full.?stack|fullstack|mern|mean|web development)\b/)) return "fullstack";
        if (text.match(/\b(analytics|bi|tableau|power bi|reporting|business intelligence)\b/)) return "business-analytics";
        if (text.match(/\b(qa|testing|selenium|test automation|quality assurance)\b/)) return "qa";
        if (text.match(/\b(project management|agile|scrum|pmp|delivery)\b/)) return "project-management";
        if (text.match(/\b(product management|product owner|roadmap)\b/)) return "product-management";
        if (text.match(/\b(security|cybersecurity|penetration|compliance)\b/)) return "cybersecurity";
        return "general";
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
