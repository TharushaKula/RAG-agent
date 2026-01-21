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

    constructor(embeddingService: EmbeddingService, similarityThreshold: number = 0.6) {
        this.embeddingService = embeddingService;
        this.similarityThreshold = similarityThreshold;
    }

    /**
     * Extract requirements from job description text
     */
    async extractRequirements(jdText: string): Promise<Requirement[]> {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 200,
            chunkOverlap: 50,
        });

        const chunks = await splitter.createDocuments([jdText]);
        
        // Simple extraction: look for bullet points, numbered lists, or sentences
        const requirements: Requirement[] = [];
        
        for (const chunk of chunks) {
            const lines = chunk.pageContent.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                const trimmed = line.trim();
                // Skip very short lines
                if (trimmed.length < 10) continue;
                
                // Remove bullet points, numbers, dashes
                const cleaned = trimmed.replace(/^[\d\-\•\*]\s*/, '').trim();
                
                if (cleaned.length > 10) {
                    // Simple classification based on keywords
                    let type: Requirement['type'] = 'other';
                    const lower = cleaned.toLowerCase();
                    
                    if (lower.includes('experience') || lower.includes('years') || lower.includes('worked')) {
                        type = 'experience';
                    } else if (lower.includes('skill') || lower.includes('proficient') || lower.includes('knowledge')) {
                        type = 'skill';
                    } else if (lower.includes('degree') || lower.includes('education') || lower.includes('certification')) {
                        type = 'qualification';
                    }
                    
                    requirements.push({
                        text: cleaned,
                        type,
                    });
                }
            }
        }

        // If no structured requirements found, split by sentences
        if (requirements.length === 0) {
            const sentences = jdText.split(/[.!?]+/).filter(s => s.trim().length > 20);
            for (const sentence of sentences.slice(0, 20)) { // Limit to 20 sentences
                requirements.push({
                    text: sentence.trim(),
                    type: 'other',
                });
            }
        }

        return requirements.slice(0, 30); // Limit to 30 requirements
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

        // Generate embeddings for CV sections
        console.log('🔄 Generating embeddings for CV sections...');
        const cvTexts = cvSections.map(s => s.text);
        const cvEmbeddings = await this.embeddingService.embedBatch(cvTexts);

        // Calculate similarities
        console.log('🔢 Calculating similarity scores...');
        const requirementMatches: RequirementMatch[] = [];

        for (let i = 0; i < requirements.length; i++) {
            const requirement = requirements[i];
            const reqEmbedding = requirementEmbeddings[i];
            const matchedSections: MatchedSection[] = [];

            // Find best matches in CV sections
            for (let j = 0; j < cvSections.length; j++) {
                const cvSection = cvSections[j];
                const cvEmbedding = cvEmbeddings[j];
                
                const similarity = EmbeddingService.cosineSimilarity(reqEmbedding, cvEmbedding);
                
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

            // Determine match status
            let status: RequirementMatch['status'] = 'not_matched';
            let matchScore = 0;

            if (matchedSections.length > 0) {
                matchScore = matchedSections[0].similarity;
                if (matchScore >= 0.75) {
                    status = 'matched';
                } else if (matchScore >= this.similarityThreshold) {
                    status = 'partially_matched';
                }
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
        const averageScore = requirementMatches.reduce((sum, m) => sum + m.matchScore, 0) / requirementMatches.length;
        const overallScore = averageScore;

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
}
