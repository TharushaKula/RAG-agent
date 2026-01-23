import { EmbeddingService } from './embeddingService';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

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

export class SemanticMatcher {
    private embeddingService: EmbeddingService;
    private similarityThreshold: number;

    constructor(embeddingService: EmbeddingService, similarityThreshold: number = 0.45) {
        this.embeddingService = embeddingService;
        // Lower threshold to focus on semantic meaning rather than exact text matching
        // This allows the model to recognize that different wording can express the same meaning
        this.similarityThreshold = similarityThreshold;
    }

    /**
     * Extract requirements from job description text
     * Improved to handle various formats and extract meaningful requirements
     */
    async extractRequirements(jdText: string): Promise<Requirement[]> {
        const requirements: Requirement[] = [];
        const seen = new Set<string>(); // Deduplicate
        
        // First, try to extract structured requirements (bullet points, numbered lists)
        const lines = jdText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        
        for (const line of lines) {
            // Skip headers and very short lines
            if (line.length < 15) continue;
            
            // Check for bullet points, numbered lists, dashes
            const bulletPattern = /^[\d\-\•\*●○▪▫]\s+(.+)$/;
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
        
        // If we didn't find enough structured requirements, use sentence-level extraction
        if (requirements.length < 5) {
            // Split by sentences, but keep meaningful chunks
            const sentences = jdText
                .split(/[.!?]+/)
                .map(s => s.trim())
                .filter(s => s.length > 25 && s.length < 500); // Meaningful length
            
            for (const sentence of sentences) {
                const normalized = sentence.toLowerCase();
                if (!seen.has(normalized) && requirements.length < 30) {
                    seen.add(normalized);
                    requirements.push({
                        text: sentence,
                        type: this.classifyRequirement(sentence),
                    });
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

        return requirements.slice(0, 30); // Limit to 30 requirements
    }

    /**
     * Classify requirement type based on content
     */
    private classifyRequirement(text: string): Requirement['type'] {
        const lower = text.toLowerCase();
        
        // Experience-related keywords
        if (lower.match(/\b(years?|experience|worked|previous|prior|background|history)\b/)) {
            return 'experience';
        }
        
        // Skill-related keywords
        if (lower.match(/\b(skill|proficient|knowledge|familiar|expert|expertise|ability|capable|competent)\b/)) {
            return 'skill';
        }
        
        // Qualification-related keywords
        if (lower.match(/\b(degree|education|qualification|certification|certified|diploma|bachelor|master|phd)\b/)) {
            return 'qualification';
        }
        
        return 'other';
    }

    /**
     * Extract sections from CV text
     */
    async extractCVSections(cvText: string): Promise<CVSection[]> {
        const sections: CVSection[] = [];
        
        // Common CV section headers
        const sectionPatterns = [
            { pattern: /(?:^|\n)\s*(?:skills?|technical skills?|core competencies?)\s*:?\s*/i, type: 'skills' as const },
            { pattern: /(?:^|\n)\s*(?:experience|work experience|employment|professional experience)\s*:?\s*/i, type: 'experience' as const },
            { pattern: /(?:^|\n)\s*(?:education|academic|qualifications?)\s*:?\s*/i, type: 'education' as const },
            { pattern: /(?:^|\n)\s*(?:summary|profile|objective|about)\s*:?\s*/i, type: 'summary' as const },
        ];

        // Split by sections
        let remainingText = cvText;
        const foundSections: { type: CVSection['type']; text: string }[] = [];

        for (const { pattern, type } of sectionPatterns) {
            const match = remainingText.match(pattern);
            if (match) {
                const startIndex = match.index! + match[0].length;
                // Find next section or end of text
                let endIndex = remainingText.length;
                for (const nextPattern of sectionPatterns) {
                    const nextMatch = remainingText.substring(startIndex).match(nextPattern.pattern);
                    if (nextMatch) {
                        endIndex = Math.min(endIndex, startIndex + nextMatch.index!);
                    }
                }
                
                const sectionText = remainingText.substring(startIndex, endIndex).trim();
                if (sectionText.length > 20) {
                    foundSections.push({ type, text: sectionText });
                }
            }
        }

        // If no structured sections found, chunk the entire CV
        if (foundSections.length === 0) {
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 300,
                chunkOverlap: 50,
            });
            const chunks = await splitter.createDocuments([cvText]);
            for (const chunk of chunks) {
                sections.push({
                    text: chunk.pageContent,
                    type: 'other',
                });
            }
        } else {
            for (const section of foundSections) {
                sections.push({
                    text: section.text,
                    type: section.type,
                });
            }
        }

        return sections;
    }

    /**
     * Perform semantic matching between JD requirements and CV sections
     */
    async match(cvText: string, jdText: string, userId: string, cvSource: string, jdSource: string): Promise<MatchResult> {
        console.log('🔍 Starting semantic matching...');
        
        // Note: We prioritize semantic meaning over text similarity
        // Even if texts are similar, we use semantic embeddings to understand meaning
        // This allows the model to recognize that different wording can express the same meaning
        
        // Extract requirements and CV sections
        const [requirements, cvSections] = await Promise.all([
            this.extractRequirements(jdText),
            this.extractCVSections(cvText),
        ]);

        console.log(`📋 Extracted ${requirements.length} requirements from JD`);
        console.log(`📄 Extracted ${cvSections.length} sections from CV`);

        if (requirements.length === 0) {
            throw new Error('No requirements found in job description');
        }

        if (cvSections.length === 0) {
            throw new Error('No sections found in CV');
        }

        // Generate embeddings for requirements
        console.log('🔄 Generating embeddings for requirements...');
        const requirementTexts = requirements.map(r => r.text);
        const requirementEmbeddings = await this.embeddingService.embedBatch(requirementTexts);
        console.log(`✅ Generated ${requirementEmbeddings.length} requirement embeddings`);

        // Generate embeddings for CV sections
        console.log('🔄 Generating embeddings for CV sections...');
        const cvTexts = cvSections.map(s => s.text);
        const cvEmbeddings = await this.embeddingService.embedBatch(cvTexts);
        console.log(`✅ Generated ${cvEmbeddings.length} CV section embeddings`);
        
        // Validate embeddings
        if (requirementEmbeddings.length === 0 || cvEmbeddings.length === 0) {
            throw new Error('Failed to generate embeddings');
        }
        
        // Log sample embedding dimensions for debugging
        if (requirementEmbeddings[0] && cvEmbeddings[0]) {
            console.log(`📊 Embedding dimensions - Requirements: ${requirementEmbeddings[0].length}, CV: ${cvEmbeddings[0].length}`);
        }

        // Calculate similarities
        console.log('🔢 Calculating similarity scores...');
        const requirementMatches: RequirementMatch[] = [];

        for (let i = 0; i < requirements.length; i++) {
            const requirement = requirements[i];
            const reqEmbedding = requirementEmbeddings[i];
            const matchedSections: MatchedSection[] = [];
            let bestSimilarity = 0;
            let bestSection: { text: string; type: string } | null = null;

            // Find best matches in CV sections using semantic similarity
            // Focus on meaning rather than exact text matching
            for (let j = 0; j < cvSections.length; j++) {
                const cvSection = cvSections[j];
                const cvEmbedding = cvEmbeddings[j];
                
                // Use semantic embedding similarity as primary method
                // This analyzes the meaning, not just word/sentence structure
                let similarity = EmbeddingService.cosineSimilarity(reqEmbedding, cvEmbedding);
                
                // Only use text matching as a bonus for exact matches (not primary method)
                // This ensures we prioritize semantic meaning over literal text
                const reqNormalized = requirement.text.trim().toLowerCase();
                const cvNormalized = cvSection.text.trim().toLowerCase();
                
                // Small bonus for exact matches, but don't override semantic similarity
                if (reqNormalized === cvNormalized) {
                    // Exact match gets a small boost, but trust embeddings for meaning
                    similarity = Math.min(1.0, similarity + 0.05);
                } else if (similarity < 0.3 && (reqNormalized.includes(cvNormalized) || cvNormalized.includes(reqNormalized))) {
                    // Only boost if semantic similarity is very low but text overlaps
                    // This handles cases where embeddings might miss obvious connections
                    const longer = reqNormalized.length > cvNormalized.length ? reqNormalized : cvNormalized;
                    const shorter = reqNormalized.length > cvNormalized.length ? cvNormalized : reqNormalized;
                    const textOverlap = shorter.length / longer.length;
                    similarity = Math.max(similarity, textOverlap * 0.4); // Cap at 40% for text-only matches
                }
                
                // Track the best similarity regardless of threshold
                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestSection = { text: cvSection.text, type: cvSection.type };
                }
                
                // Only add to matchedSections if above threshold (for display)
                if (similarity >= this.similarityThreshold) {
                    matchedSections.push({
                        cvSection: cvSection.text.substring(0, 200), // Truncate for display
                        similarity,
                        sectionType: cvSection.type,
                    });
                }
            }

            // Sort by similarity (highest first)
            matchedSections.sort((a, b) => b.similarity - a.similarity);

            // Determine match status based on best similarity
            let status: RequirementMatch['status'] = 'not_matched';
            const matchScore = bestSimilarity; // Always use the best similarity, even if below threshold

            if (matchScore >= 0.75) {
                status = 'matched';
            } else if (matchScore >= this.similarityThreshold) {
                status = 'partially_matched';
            }

            // If we have a best match but it wasn't added to matchedSections (below threshold),
            // add it so users can see why the score is what it is
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
                matchedSections: matchedSections.slice(0, 3), // Top 3 matches
                matchScore,
                status,
            });
        }

        // Calculate summary statistics
        const matchedCount = requirementMatches.filter(m => m.status === 'matched').length;
        const partiallyMatchedCount = requirementMatches.filter(m => m.status === 'partially_matched').length;
        const unmatchedCount = requirementMatches.filter(m => m.status === 'not_matched').length;
        
        // Use weighted average focusing on semantic similarity scores
        // This prioritizes meaning-based matches over text-based matches
        const scores = requirementMatches.map(m => m.matchScore).sort((a, b) => b - a);
        
        // Use top 75% of scores to focus on best semantic matches
        // This gives more weight to requirements that have strong semantic alignment
        const topScores = scores.slice(0, Math.ceil(scores.length * 0.75));
        const averageScore = topScores.length > 0 
            ? topScores.reduce((sum, s) => sum + s, 0) / topScores.length
            : scores.reduce((sum, s) => sum + s, 0) / (scores.length || 1);
        
        // The overall score is based purely on semantic similarity
        // No text-based bonuses - we trust the embedding model's understanding of meaning
        const overallScore = Math.min(1.0, averageScore);

        // Generate recommendations
        const recommendations = this.generateRecommendations(requirementMatches, cvText);

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

        console.log(`✅ Matching complete. Overall score: ${(overallScore * 100).toFixed(1)}%`);
        
        return matchResult;
    }

    /**
     * Generate recommendations based on match results
     */
    private generateRecommendations(matches: RequirementMatch[], cvText: string): string[] {
        const recommendations: string[] = [];
        
        // Find unmatched high-importance requirements
        const unmatched = matches.filter(m => m.status === 'not_matched');
        const importantUnmatched = unmatched
            .filter(m => m.requirementType === 'skill' || m.requirementType === 'experience')
            .slice(0, 3);

        for (const match of importantUnmatched) {
            recommendations.push(`Consider adding experience or skills related to: "${match.requirement.substring(0, 100)}"`);
        }

        // Find partially matched requirements
        const partiallyMatched = matches.filter(m => m.status === 'partially_matched');
        if (partiallyMatched.length > 0) {
            recommendations.push(`You have some relevant experience for ${partiallyMatched.length} requirements. Consider highlighting these more prominently in your resume.`);
        }

        // Overall score recommendations
        const overallScore = matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length;
        if (overallScore < 0.5) {
            recommendations.push('Your resume shows limited alignment with the job requirements. Consider gaining more relevant experience or skills.');
        } else if (overallScore < 0.7) {
            recommendations.push('Your resume shows moderate alignment. Focus on highlighting relevant experience and skills more clearly.');
        } else {
            recommendations.push('Great! Your resume shows strong alignment with the job requirements.');
        }

        return recommendations.slice(0, 5); // Limit to 5 recommendations
    }

    /**
     * Calculate text similarity using Jaccard similarity and character-level comparison
     */
    private calculateTextSimilarity(text1: string, text2: string): number {
        // Exact match
        if (text1 === text2) return 1.0;
        
        // Jaccard similarity on words
        const words1 = new Set(text1.split(/\s+/));
        const words2 = new Set(text2.split(/\s+/));
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        const jaccard = intersection.size / union.size;
        
        // Character-level similarity (Levenshtein-like)
        const longer = text1.length > text2.length ? text1 : text2;
        const shorter = text1.length > text2.length ? text2 : text1;
        const editDistance = this.levenshteinDistance(text1, text2);
        const charSimilarity = 1 - (editDistance / longer.length);
        
        // Weighted average
        return (jaccard * 0.6 + charSimilarity * 0.4);
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix: number[][] = [];
        const len1 = str1.length;
        const len2 = str2.length;

        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j - 1] + 1
                    );
                }
            }
        }

        return matrix[len1][len2];
    }

    /**
     * Optimized matching for identical or near-identical texts
     */
    private async matchIdenticalTexts(
        cvText: string,
        jdText: string,
        userId: string,
        cvSource: string,
        jdSource: string,
        textSimilarity: number
    ): Promise<MatchResult> {
        // Use sentence-level matching for better accuracy
        const sentences = jdText.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const requirements: Requirement[] = sentences.slice(0, 30).map(sentence => ({
            text: sentence.trim(),
            type: 'other' as const
        }));

        // Use same sentence-level chunks for CV
        const cvSentences = cvText.split(/[.!?]+/).filter(s => s.trim().length > 20);
        const cvSections: CVSection[] = cvSentences.slice(0, 30).map(sentence => ({
            text: sentence.trim(),
            type: 'other' as const
        }));

        console.log(`📋 Using sentence-level matching: ${requirements.length} requirements, ${cvSections.length} CV sections`);

        // Generate embeddings
        const requirementTexts = requirements.map(r => r.text);
        const cvTexts = cvSections.map(s => s.text);
        
        const [requirementEmbeddings, cvEmbeddings] = await Promise.all([
            this.embeddingService.embedBatch(requirementTexts),
            this.embeddingService.embedBatch(cvTexts)
        ]);

        // Calculate similarities with exact match bonus
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
                
                // Primary method: Use semantic embedding similarity (analyzes meaning)
                let similarity = EmbeddingService.cosineSimilarity(reqEmbedding, cvEmbedding);
                
                // Text matching only as a small bonus for exact matches
                const reqNormalized = requirement.text.trim().toLowerCase();
                const cvNormalized = cvSection.text.trim().toLowerCase();
                
                if (reqNormalized === cvNormalized) {
                    // Exact match gets small boost, but trust embeddings for meaning
                    similarity = Math.min(1.0, similarity + 0.05);
                } else if (similarity < 0.3 && (reqNormalized.includes(cvNormalized) || cvNormalized.includes(reqNormalized))) {
                    // Only boost if semantic similarity is very low but text overlaps
                    similarity = Math.max(similarity, 0.4);
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

            let status: RequirementMatch['status'] = 'not_matched';
            const matchScore = bestSimilarity;

            if (matchScore >= 0.75) {
                status = 'matched';
            } else if (matchScore >= this.similarityThreshold) {
                status = 'partially_matched';
            }

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
                matchScore,
                status,
            });
        }

        // Calculate weighted average (give more weight to higher scores)
        const scores = requirementMatches.map(m => m.matchScore).sort((a, b) => b - a);
        const topScores = scores.slice(0, Math.ceil(scores.length * 0.7)); // Top 70%
        const averageScore = topScores.length > 0 
            ? topScores.reduce((sum, s) => sum + s, 0) / topScores.length
            : scores.reduce((sum, s) => sum + s, 0) / scores.length;
        
        // Boost score if text similarity is very high
        const overallScore = Math.min(1.0, averageScore * 0.9 + textSimilarity * 0.1);

        const matchedCount = requirementMatches.filter(m => m.status === 'matched').length;
        const partiallyMatchedCount = requirementMatches.filter(m => m.status === 'partially_matched').length;
        const unmatchedCount = requirementMatches.filter(m => m.status === 'not_matched').length;

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
                averageScore: overallScore,
            },
            recommendations: this.generateRecommendations(requirementMatches, cvText),
        };

        console.log(`✅ Optimized matching complete. Overall score: ${(overallScore * 100).toFixed(1)}%`);
        return matchResult;
    }
}
