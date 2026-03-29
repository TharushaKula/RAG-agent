import { EmbeddingService } from './embeddingService';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { createLangfuseHandler } from "../utils/langfuse";

export interface Requirement {
    text: string;
    type: 'skill' | 'experience' | 'qualification' | 'other';
}

export interface CVSection {
    text: string;
    type: 'skills' | 'experience' | 'education' | 'summary' | 'other';
}

export interface MatchedSection {
    cvSection: string;
    similarity: number;
    sectionType: string;
}

export interface RequirementMatch {
    requirement: string;
    requirementType: string;
    matchedSections: MatchedSection[];
    matchScore: number;
    status: 'matched' | 'partially_matched' | 'not_matched';
}

export interface MatchResult {
    matchId: string;
    userId: string;
    cvSource: string;
    jdSource: string;
    overallScore: number;
    timestamp: string;
    requirements: RequirementMatch[];
    summary: {
        totalRequirements: number;
        matchedRequirements: number;
        partiallyMatchedRequirements: number;
        unmatchedRequirements: number;
        averageScore: number;
    };
    recommendations: string[];
}

// Type weights for overall score calculation:
// Skills and experience matter more than generic "other" requirements
const TYPE_WEIGHTS: Record<string, number> = {
    skill: 1.3,
    experience: 1.3,
    qualification: 1.1,
    other: 0.7,
};

export class SemanticMatcher {
    private embeddingService: EmbeddingService;
    private similarityThreshold: number;
    private llm: ChatOllama | null;

    constructor(
        embeddingService: EmbeddingService,
        similarityThreshold: number = 0.45,
        llm?: ChatOllama
    ) {
        this.embeddingService = embeddingService;
        this.similarityThreshold = similarityThreshold;
        this.llm = llm || null;
    }

    // ──────────────────────────────────────────────
    //  1. REQUIREMENT EXTRACTION (LLM + regex fallback)
    // ──────────────────────────────────────────────

    /**
     * Extract requirements from the JD.
     * Tries LLM-based structured extraction first; falls back to regex + sentence parsing.
     */
    async extractRequirements(jdText: string): Promise<Requirement[]> {
        // Try LLM extraction first (much more accurate)
        if (this.llm) {
            try {
                const llmReqs = await this.extractRequirementsWithLLM(jdText);
                if (llmReqs.length >= 3) {
                    console.log(`LLM extracted ${llmReqs.length} requirements`);
                    return llmReqs.slice(0, 30);
                }
            } catch (err: any) {
                console.warn(`LLM requirement extraction failed, falling back to regex: ${err.message}`);
            }
        }

        // Fallback: regex-based extraction
        return this.extractRequirementsWithRegex(jdText);
    }

    /**
     * LLM-based structured requirement extraction.
     * Asks the LLM to read the JD and output a JSON array of requirements with types.
     */
    private async extractRequirementsWithLLM(jdText: string): Promise<Requirement[]> {
        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                `You are a job description analyzer. Extract all specific requirements from the given job description.

For each requirement, classify it as one of:
- "skill": Technical or soft skill (e.g., "Proficient in Python", "Strong communication skills")
- "experience": Work experience requirement (e.g., "3+ years in backend development")
- "qualification": Education or certification (e.g., "Bachelor's degree in CS", "AWS certified")
- "other": Any other requirement that doesn't fit the above

IMPORTANT RULES:
- Extract ONLY actual requirements (skills, experience, qualifications the candidate must have)
- Do NOT extract company descriptions, benefits, perks, or general information
- Each requirement should be a single, clear statement (one skill/requirement per item)
- If a bullet point contains multiple requirements, split them into separate items
- Aim for 8-25 requirements total
- Respond with ONLY valid JSON — no markdown, no explanation

Response format:
[{"text": "requirement text", "type": "skill|experience|qualification|other"}, ...]`
            ],
            ["user", "{jdText}"]
        ]);

        const chain = RunnableSequence.from([prompt, this.llm!, new StringOutputParser()]);
        const lfHandler = createLangfuseHandler({ traceName: "matcher-extract-requirements", tags: ["matcher"] });
        const response = await chain.invoke({ jdText: jdText.slice(0, 6000) }, { callbacks: lfHandler ? [lfHandler] : [] });
        await lfHandler?.shutdownAsync();

        // Parse JSON from response (handle potential markdown wrapping)
        const jsonStr = response.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        if (!Array.isArray(parsed)) return [];

        const seen = new Set<string>();
        const requirements: Requirement[] = [];

        for (const item of parsed) {
            if (!item.text || typeof item.text !== 'string') continue;
            const text = item.text.trim();
            if (text.length < 10) continue;
            const normalized = text.toLowerCase();
            if (seen.has(normalized)) continue;
            seen.add(normalized);

            const validTypes = ['skill', 'experience', 'qualification', 'other'];
            const type = validTypes.includes(item.type) ? item.type : this.classifyRequirement(text);

            requirements.push({ text, type: type as Requirement['type'] });
        }

        return requirements;
    }

    /**
     * Regex + sentence-based requirement extraction (fallback).
     */
    private async extractRequirementsWithRegex(jdText: string): Promise<Requirement[]> {
        const requirements: Requirement[] = [];
        const seen = new Set<string>();

        const lines = jdText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

        for (const line of lines) {
            if (line.length < 15) continue;

            // Expanded bullet pattern: handles indented bullets, parenthesized numbers, letters
            const bulletPattern = /^\s*(?:[\d]+[.)]\s*|[a-z][.)]\s*|\([a-z\d]+\)\s*|[-–—\•\*●○▪▫►▸✓✔☐]\s*)(.+)$/i;
            const match = line.match(bulletPattern);

            if (match) {
                const cleaned = match[1].trim();
                if (cleaned.length > 15 && !seen.has(cleaned.toLowerCase())) {
                    seen.add(cleaned.toLowerCase());
                    requirements.push({
                        text: cleaned,
                        type: this.classifyRequirement(cleaned),
                    });
                }
            }
        }

        // If not enough structured requirements, use sentence-level extraction
        if (requirements.length < 5) {
            const sentences = jdText
                .split(/[.!?]+/)
                .map(s => s.trim())
                .filter(s => s.length > 25 && s.length < 500);

            for (const sentence of sentences) {
                const normalized = sentence.toLowerCase();
                if (!seen.has(normalized) && requirements.length < 30) {
                    // Skip likely non-requirement sentences (company descriptions, benefits)
                    if (this.isLikelyRequirement(sentence)) {
                        seen.add(normalized);
                        requirements.push({
                            text: sentence,
                            type: this.classifyRequirement(sentence),
                        });
                    }
                }
            }
        }

        // If still not enough, use intelligent chunking
        if (requirements.length < 3) {
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 300,
                chunkOverlap: 100,
            });
            const chunks = await splitter.createDocuments([jdText]);

            for (const chunk of chunks.slice(0, 20)) {
                const text = chunk.pageContent.trim();
                if (text.length > 50 && !seen.has(text.toLowerCase())) {
                    seen.add(text.toLowerCase());
                    requirements.push({
                        text: text,
                        type: this.classifyRequirement(text),
                    });
                }
            }
        }

        return requirements.slice(0, 30);
    }

    /**
     * Heuristic to filter out non-requirement sentences (company descriptions, benefits, etc.)
     */
    private isLikelyRequirement(text: string): boolean {
        const lower = text.toLowerCase();
        // Positive signals: looks like a requirement
        const requirementSignals = /\b(must|should|require|experience|proficien|knowledge|skill|ability|familiar|degree|certification|years?|minimum|strong|excellent|understanding|competent|capable|responsible for|work with|develop|design|implement|manage|maintain)\b/;
        // Negative signals: looks like company description or benefits
        const nonRequirementSignals = /\b(we offer|our company|benefits include|salary|vacation|insurance|founded in|headquartered|employees worldwide|equal opportunity|we are a|join our)\b/;

        if (nonRequirementSignals.test(lower)) return false;
        if (requirementSignals.test(lower)) return true;

        // Default: include if it's in a reasonable length range
        return text.length > 30 && text.length < 300;
    }

    /**
     * Classify requirement type based on content keywords.
     */
    private classifyRequirement(text: string): Requirement['type'] {
        const lower = text.toLowerCase();

        if (lower.match(/\b(years?|experience|worked|previous|prior|background|history|track record|hands-on)\b/)) {
            return 'experience';
        }
        if (lower.match(/\b(skill|proficien|knowledge|familiar|expert|expertise|ability|capable|competent|fluent|strong understanding|hands-on experience with)\b/)) {
            return 'skill';
        }
        if (lower.match(/\b(degree|education|qualification|certification|certified|diploma|bachelor|master|phd|mba|accredit)\b/)) {
            return 'qualification';
        }

        return 'other';
    }

    // ──────────────────────────────────────────────
    //  2. CV SECTION EXTRACTION (expanded headers + sub-chunking)
    // ──────────────────────────────────────────────

    /**
     * Extract sections from CV text using expanded header patterns,
     * then sub-chunk large sections into 150-300 char pieces for better embedding granularity.
     */
    async extractCVSections(cvText: string): Promise<CVSection[]> {
        // Expanded section header patterns to catch many CV formats
        const sectionPatterns: Array<{ pattern: RegExp; type: CVSection['type'] }> = [
            // Skills variations
            { pattern: /(?:^|\n)\s*(?:skills?|technical skills?|core competencies?|key skills?|areas of expertise|technical proficiencies|competencies|technologies|tech stack)\s*[:\-—]?\s*/i, type: 'skills' },
            // Experience variations
            { pattern: /(?:^|\n)\s*(?:experience|work experience|employment|professional experience|career history|work history|relevant experience|professional background|positions? held)\s*[:\-—]?\s*/i, type: 'experience' },
            // Education variations
            { pattern: /(?:^|\n)\s*(?:education|academic|qualifications?|academic background|educational background|degrees?|certifications?|training|professional development|licenses? (?:&|and) certifications?)\s*[:\-—]?\s*/i, type: 'education' },
            // Summary / profile variations
            { pattern: /(?:^|\n)\s*(?:summary|profile|objective|about|personal statement|professional summary|career objective|career summary|executive summary|overview)\s*[:\-—]?\s*/i, type: 'summary' },
        ];

        // Split CV by identified sections
        const foundSections: Array<{ type: CVSection['type']; text: string }> = [];

        // Find all section header positions
        const headerPositions: Array<{ type: CVSection['type']; startIndex: number; headerEnd: number }> = [];

        for (const { pattern, type } of sectionPatterns) {
            const match = cvText.match(pattern);
            if (match && match.index !== undefined) {
                headerPositions.push({
                    type,
                    startIndex: match.index,
                    headerEnd: match.index + match[0].length,
                });
            }
        }

        // Sort by position in document
        headerPositions.sort((a, b) => a.startIndex - b.startIndex);

        // Extract text between headers
        for (let i = 0; i < headerPositions.length; i++) {
            const current = headerPositions[i];
            const nextStart = i + 1 < headerPositions.length
                ? headerPositions[i + 1].startIndex
                : cvText.length;

            const sectionText = cvText.substring(current.headerEnd, nextStart).trim();
            if (sectionText.length > 20) {
                foundSections.push({ type: current.type, text: sectionText });
            }
        }

        // If any text precedes the first header, capture it as 'summary' or 'other'
        if (headerPositions.length > 0 && headerPositions[0].startIndex > 50) {
            const preHeaderText = cvText.substring(0, headerPositions[0].startIndex).trim();
            if (preHeaderText.length > 30) {
                foundSections.unshift({ type: 'summary', text: preHeaderText });
            }
        }

        // If no structured sections found, chunk the entire CV
        if (foundSections.length === 0) {
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 250,
                chunkOverlap: 50,
            });
            const chunks = await splitter.createDocuments([cvText]);
            return chunks.map(chunk => ({
                text: chunk.pageContent,
                type: 'other' as const,
            }));
        }

        // Sub-chunk large sections to keep embeddings topically focused
        const subChunked: CVSection[] = [];
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 250,
            chunkOverlap: 40,
        });

        for (const section of foundSections) {
            if (section.text.length <= 350) {
                // Small enough — keep as-is
                subChunked.push({ text: section.text, type: section.type });
            } else {
                // Sub-chunk and preserve the section type on each chunk
                const chunks = await splitter.createDocuments([section.text]);
                for (const chunk of chunks) {
                    const text = chunk.pageContent.trim();
                    if (text.length > 20) {
                        subChunked.push({ text, type: section.type });
                    }
                }
            }
        }

        return subChunked;
    }

    // ──────────────────────────────────────────────
    //  3. CORE MATCHING
    // ──────────────────────────────────────────────

    /**
     * Perform semantic matching between JD requirements and CV sections.
     */
    async match(
        cvText: string,
        jdText: string,
        userId: string,
        cvSource: string,
        jdSource: string
    ): Promise<MatchResult> {
        console.log('Starting semantic matching...');

        const [requirements, cvSections] = await Promise.all([
            this.extractRequirements(jdText),
            this.extractCVSections(cvText),
        ]);

        console.log(`Extracted ${requirements.length} requirements from JD, ${cvSections.length} sub-chunks from CV`);

        if (requirements.length === 0) {
            throw new Error('No requirements found in job description');
        }
        if (cvSections.length === 0) {
            throw new Error('No sections found in CV');
        }

        const [requirementEmbeddings, cvEmbeddings] = await Promise.all([
            this.embeddingService.embedBatch(requirements.map(r => r.text)),
            this.embeddingService.embedBatch(cvSections.map(s => s.text)),
        ]);

        if (requirementEmbeddings.length === 0 || cvEmbeddings.length === 0) {
            throw new Error('Failed to generate embeddings');
        }

        const requirementMatches: RequirementMatch[] = [];

        for (let i = 0; i < requirements.length; i++) {
            const requirement = requirements[i];
            const reqEmbedding = requirementEmbeddings[i];
            const matchedSections: MatchedSection[] = [];
            let bestSimilarity = 0;
            let bestSection: { text: string; type: string } | null = null;

            for (let j = 0; j < cvSections.length; j++) {
                const cvSection = cvSections[j];
                const cvEmbedding = cvEmbeddings[j];

                let similarity = EmbeddingService.cosineSimilarity(reqEmbedding, cvEmbedding);

                // Small bonus for exact text overlap (handles edge cases embeddings might miss)
                const reqNorm = requirement.text.trim().toLowerCase();
                const cvNorm = cvSection.text.trim().toLowerCase();

                if (reqNorm === cvNorm) {
                    similarity = Math.min(1.0, similarity + 0.05);
                } else if (similarity < 0.3) {
                    // Check for substring containment as a safety net
                    if (reqNorm.includes(cvNorm) || cvNorm.includes(reqNorm)) {
                        const longer = reqNorm.length > cvNorm.length ? reqNorm : cvNorm;
                        const shorter = reqNorm.length > cvNorm.length ? cvNorm : reqNorm;
                        const overlap = shorter.length / longer.length;
                        similarity = Math.max(similarity, overlap * 0.4);
                    }
                }

                // Level-awareness modifier: detect same-domain but different expertise level.
                // When the JD asks for "5+ years" / "advanced" / "expert" but the CV says
                // "basic" / "some exposure" / "1 year", the SBERT cosine sim will be high
                // (same domain) but the candidate doesn't truly "match".
                // Apply a penalty to push these into the partial_match zone.
                if (similarity >= 0.40) {
                    const levelPenalty = SemanticMatcher.computeLevelPenalty(reqNorm, cvNorm);
                    if (levelPenalty > 0) {
                        similarity = similarity * (1.0 - levelPenalty);
                    }
                }

                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestSection = { text: cvSection.text, type: cvSection.type };
                }

                if (similarity >= this.similarityThreshold) {
                    matchedSections.push({
                        cvSection: cvSection.text.substring(0, 200),
                        similarity,
                        sectionType: cvSection.type,
                    });
                }
            }

            matchedSections.sort((a, b) => b.similarity - a.similarity);

            // Determine match status
            // Thresholds widened to give partial_match a wider band (0.38–0.58)
            // Calibrated against SBERT avg positive similarity (~0.60)
            let status: RequirementMatch['status'] = 'not_matched';
            if (bestSimilarity >= 0.58) {
                status = 'matched';
            } else if (bestSimilarity >= 0.38) {
                status = 'partially_matched';
            }

            // Always show at least the best match so users understand the score
            if (bestSection && matchedSections.length === 0 && bestSimilarity > 0) {
                matchedSections.push({
                    cvSection: bestSection.text.substring(0, 200),
                    similarity: bestSimilarity,
                    sectionType: bestSection.type,
                });
            }

            requirementMatches.push({
                requirement: requirement.text,
                requirementType: requirement.type,
                matchedSections: matchedSections.slice(0, 3),
                matchScore: bestSimilarity,
                status,
            });
        }

        // ── Overall score: weighted average of ALL requirements ──
        const matchedCount = requirementMatches.filter(m => m.status === 'matched').length;
        const partiallyMatchedCount = requirementMatches.filter(m => m.status === 'partially_matched').length;
        const unmatchedCount = requirementMatches.filter(m => m.status === 'not_matched').length;

        let weightedSum = 0;
        let weightTotal = 0;
        for (const m of requirementMatches) {
            const w = TYPE_WEIGHTS[m.requirementType] ?? 1.0;
            weightedSum += m.matchScore * w;
            weightTotal += w;
        }
        const averageScore = weightTotal > 0 ? weightedSum / weightTotal : 0;
        const overallScore = Math.min(1.0, averageScore);

        // Generate recommendations (LLM if available, else template)
        const recommendations = await this.generateRecommendations(requirementMatches, cvText, jdText);

        const matchResult: MatchResult = {
            matchId: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            cvSource,
            jdSource,
            overallScore,
            timestamp: new Date().toISOString(),
            requirements: requirementMatches,
            summary: {
                totalRequirements: requirements.length,
                matchedRequirements: matchedCount,
                partiallyMatchedRequirements: partiallyMatchedCount,
                unmatchedRequirements: unmatchedCount,
                averageScore,
            },
            recommendations,
        };

        console.log(`Matching complete. Overall score: ${(overallScore * 100).toFixed(1)}%`);
        return matchResult;
    }

    // ──────────────────────────────────────────────
    //  4. RECOMMENDATIONS (LLM + template fallback)
    // ──────────────────────────────────────────────

    /**
     * Generate actionable recommendations using LLM if available, else template-based.
     */
    private async generateRecommendations(
        matches: RequirementMatch[],
        cvText: string,
        jdText: string
    ): Promise<string[]> {
        // Try LLM-powered recommendations
        if (this.llm) {
            try {
                return await this.generateRecommendationsWithLLM(matches, jdText);
            } catch (err: any) {
                console.warn(`LLM recommendation generation failed, falling back to template: ${err.message}`);
            }
        }

        return this.generateTemplateRecommendations(matches);
    }

    /**
     * LLM-powered recommendation generation.
     * Passes the match analysis to the LLM for specific, actionable advice.
     */
    private async generateRecommendationsWithLLM(
        matches: RequirementMatch[],
        jdText: string
    ): Promise<string[]> {
        const matched = matches.filter(m => m.status === 'matched');
        const partial = matches.filter(m => m.status === 'partially_matched');
        const unmatched = matches.filter(m => m.status === 'not_matched');

        const overallScore = matches.reduce((s, m) => s + m.matchScore, 0) / matches.length;

        // Build a concise summary for the LLM
        const unmatchedList = unmatched
            .map(m => `- [${m.requirementType}] "${m.requirement}" (score: ${(m.matchScore * 100).toFixed(0)}%)`)
            .slice(0, 8)
            .join('\n');
        const partialList = partial
            .map(m => `- [${m.requirementType}] "${m.requirement}" (score: ${(m.matchScore * 100).toFixed(0)}%)`)
            .slice(0, 5)
            .join('\n');

        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                `You are a career coach analyzing how well a candidate's CV matches a job description.

Given the match analysis below, provide 4-6 specific, actionable recommendations to improve the candidate's chances.

RULES:
- Be specific: reference actual skills, technologies, or experience areas from the unmatched/partial requirements
- Be actionable: tell the candidate exactly what to do (add to CV, learn, highlight, reword, etc.)
- Prioritize the most impactful gaps (skills and experience over "other")
- If overall score is high (>70%), focus on fine-tuning rather than major gaps
- Keep each recommendation to 1-2 sentences
- Respond with ONLY a JSON array of strings — no markdown, no explanation

Example response format:
["Add Python and data analysis experience to your skills section — the role specifically requires proficiency in Python.", "Your CV mentions team collaboration but doesn't highlight leadership. Reword your experience to emphasize project leadership and mentoring."]`
            ],
            [
                "user",
                `Overall match score: ${(overallScore * 100).toFixed(0)}%
Matched: ${matched.length} | Partially matched: ${partial.length} | Not matched: ${unmatched.length}

NOT MATCHED requirements:
${unmatchedList || '(none)'}

PARTIALLY MATCHED requirements:
${partialList || '(none)'}

Job Description (first 2000 chars):
${jdText.slice(0, 2000)}`
            ]
        ]);

        const chain = RunnableSequence.from([prompt, this.llm!, new StringOutputParser()]);
        const lfRecHandler = createLangfuseHandler({ traceName: "matcher-generate-recommendations", tags: ["matcher"] });
        const response = await chain.invoke({}, { callbacks: lfRecHandler ? [lfRecHandler] : [] });
        await lfRecHandler?.shutdownAsync();

        const jsonStr = response.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.filter((r: any) => typeof r === 'string' && r.length > 10).slice(0, 6);
        }

        // Fallback if LLM returns unexpected format
        return this.generateTemplateRecommendations(matches);
    }

    /**
     * Template-based recommendations (fallback when LLM is unavailable).
     */
    private generateTemplateRecommendations(matches: RequirementMatch[]): string[] {
        const recommendations: string[] = [];

        // Unmatched skills and experience — most actionable
        const unmatched = matches.filter(m => m.status === 'not_matched');
        const unmatchedSkills = unmatched.filter(m => m.requirementType === 'skill').slice(0, 2);
        const unmatchedExp = unmatched.filter(m => m.requirementType === 'experience').slice(0, 2);
        const unmatchedQual = unmatched.filter(m => m.requirementType === 'qualification').slice(0, 1);

        for (const m of unmatchedSkills) {
            recommendations.push(
                `Your CV is missing a key skill the role requires: "${m.requirement.substring(0, 120)}". Add relevant projects, certifications, or coursework that demonstrate this skill.`
            );
        }
        for (const m of unmatchedExp) {
            recommendations.push(
                `The role requires experience that isn't reflected in your CV: "${m.requirement.substring(0, 120)}". Consider rewording existing experience to highlight related work, or pursue relevant projects.`
            );
        }
        for (const m of unmatchedQual) {
            recommendations.push(
                `A required qualification is missing: "${m.requirement.substring(0, 120)}". If you have equivalent credentials, make sure they're clearly stated in your Education section.`
            );
        }

        // Partially matched — can be improved by rewording
        const partial = matches.filter(m => m.status === 'partially_matched');
        if (partial.length > 0) {
            const topPartial = partial.sort((a, b) => a.matchScore - b.matchScore).slice(0, 2);
            for (const m of topPartial) {
                recommendations.push(
                    `Your CV partially addresses "${m.requirement.substring(0, 80)}" (${(m.matchScore * 100).toFixed(0)}% match). Use keywords and phrasing from the job description to strengthen this alignment.`
                );
            }
        }

        // Overall guidance
        const overallScore = matches.reduce((sum, m) => sum + m.matchScore, 0) / (matches.length || 1);
        if (overallScore < 0.5) {
            recommendations.push('Overall alignment is limited. Focus on the top 3-4 unmatched requirements above — addressing those will make the biggest difference.');
        } else if (overallScore < 0.7) {
            recommendations.push('You have moderate alignment with this role. Tailor your CV by mirroring the job description\'s language for your existing skills and experience.');
        } else {
            recommendations.push('Strong alignment! Fine-tune by ensuring your most relevant achievements are prominently placed and quantified where possible.');
        }

        return recommendations.slice(0, 6);
    }

    // ──────────────────────────────────────────────
    //  5. LEVEL-AWARENESS PENALTY
    // ──────────────────────────────────────────────

    /**
     * Detect when two texts share the same domain but differ in expertise level.
     * Returns a penalty between 0 (no mismatch) and 0.25 (strong mismatch).
     *
     * Examples where penalty applies:
     *   JD: "5+ years of backend development" vs CV: "1 year internship"
     *   JD: "Expert-level database admin" vs CV: "Basic SQL queries"
     *   JD: "Advanced Docker + Kubernetes" vs CV: "Basic Docker for local dev"
     */
    static computeLevelPenalty(jdNorm: string, cvNorm: string): number {
        let penalty = 0;

        // 1. Experience-year gap detection
        const yearPattern = /(\d+)\+?\s*years?/g;
        const jdYears = [...jdNorm.matchAll(yearPattern)].map(m => parseInt(m[1]));
        const cvYears = [...cvNorm.matchAll(yearPattern)].map(m => parseInt(m[1]));

        if (jdYears.length > 0 && cvYears.length > 0) {
            const jdMax = Math.max(...jdYears);
            const cvMax = Math.max(...cvYears);
            if (jdMax > 0 && cvMax < jdMax) {
                // Larger gap = bigger penalty, capped at 0.20
                const gap = (jdMax - cvMax) / jdMax;
                penalty = Math.max(penalty, gap * 0.20);
            }
        } else if (jdYears.length > 0 && jdYears[0] >= 3 && cvYears.length === 0) {
            // JD requires years but CV doesn't mention any → moderate penalty
            const hasExperienceSignal = /\b(experience|worked|built|developed|managed|led)\b/.test(cvNorm);
            if (!hasExperienceSignal) {
                penalty = Math.max(penalty, 0.12);
            }
        }

        // 2. Expertise-level word mismatch
        const highLevelWords = /\b(expert|advanced|strong|proficien|extensive|deep|senior|lead|architect|principal)\b/;
        const lowLevelWords = /\b(basic|beginner|some exposure|introduct|fundament|familiar|personal project|university|coursework|online course|learning|junior|intern)\b/;

        const jdIsHigh = highLevelWords.test(jdNorm);
        const cvIsLow = lowLevelWords.test(cvNorm);

        if (jdIsHigh && cvIsLow) {
            // JD asks for advanced, CV shows beginner → penalty
            penalty = Math.max(penalty, 0.18);
        }

        // 3. Scale mismatch (production vs personal, large vs small)
        const productionWords = /\b(production|enterprise|at scale|large-scale|distributed|team of \d{2,}|multiple)\b/;
        const personalWords = /\b(personal project|small|capstone|assignment|hobby|tutorial|toy|demo)\b/;

        const jdIsProduction = productionWords.test(jdNorm);
        const cvIsPersonal = personalWords.test(cvNorm);

        if (jdIsProduction && cvIsPersonal) {
            penalty = Math.max(penalty, 0.15);
        }

        // Cap total penalty at 0.25 (don't push match → no_match, just match → partial)
        return Math.min(penalty, 0.25);
    }
}
