import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import axios from "axios";

export interface ValidationResult {
    valid: boolean;
    issues?: string[];
    feedback?: string;
}

/**
 * Roadmap Validator Agent
 *
 * Second agent in the two-agent roadmap flow. It checks the correctness and
 * suitability of a generated roadmap and provides feedback so the creator
 * agent can fix issues and regenerate if needed.
 */
export class RoadmapValidatorAgent {
    private llm: ChatOllama;

    constructor(ollamaBaseUrl: string = "http://127.0.0.1:11434", ollamaModel: string = "gpt-oss:20b-cloud") {
        this.llm = new ChatOllama({
            model: ollamaModel,
            baseUrl: ollamaBaseUrl,
            temperature: 0.3, // Lower temperature for consistent validation
        });
    }

    /**
     * Validate a generated roadmap against the original context and requirements.
     * Returns whether the roadmap is acceptable and, if not, concrete issues and feedback
     * for the creator agent to fix.
     */
    async validate(
        roadmapData: { title: string; description: string; stages: any[] },
        context: string,
        category: string,
        source: string
    ): Promise<ValidationResult> {
        const prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                `You are a strict quality assurance agent for learning roadmaps. Your job is to validate that a generated roadmap is correct and suitable.

Check for:
1. RELEVANCE: All stages and modules must align with the user's context (CV, job description, or hybrid). Reject modules that are off-topic or not suitable for the stated goals.
2. STRUCTURE: Roadmap should have 3-5 stages, each with 3-6 modules. No empty stages. No duplicate module titles anywhere in the roadmap.
3. PREREQUISITES: Dependencies between modules must be logical (e.g. "Advanced X" should require "Introduction to X"). Prerequisite IDs must refer to existing module ids.
4. PROGRESSION: Order should go from fundamentals → intermediate → advanced. No advanced topics before basics. Stage order must be 1, 2, 3...
5. UNWANTED CONTENT: Flag any modules that are too generic, irrelevant to the domain, or not actionable for learning.
6. TIME ESTIMATES: Each module should have estimatedHours (number). Flag if missing or unreasonably high (e.g. > 200) or zero.

You must respond with valid JSON only, in this exact format:
- If the roadmap is acceptable: {{ "valid": true }}
- If the roadmap has issues: {{ "valid": false, "issues": ["issue 1", "issue 2", ...], "feedback": "Clear instructions for the creator agent on what to change and how to fix the roadmap." }}

Be concise. "feedback" should be actionable so another agent can fix the roadmap.`,
            ],
            [
                "user",
                `Validate this roadmap.

User context and requirements:
{context}

Category: {category}
Source: {source}

Roadmap to validate (JSON):
{roadmapJson}

Respond with JSON only: either {{ "valid": true }} or {{ "valid": false, "issues": [...], "feedback": "..." }}.`,
            ],
        ]);

        const chain = RunnableSequence.from([
            prompt,
            this.llm,
            new StringOutputParser(),
        ]);

        try {
            const response = (await chain.invoke({
                context,
                category,
                source,
                roadmapJson: JSON.stringify(roadmapData, null, 2),
            })) as string;

            const parsed = this.parseValidationResponse(response);
            if (parsed.valid === false && parsed.issues?.length === 0 && !parsed.feedback) {
                parsed.feedback = "Roadmap did not meet quality criteria. Please review relevance and structure.";
            }
            return parsed;
        } catch (error: any) {
            console.error("Roadmap validation error:", error?.message);
            // On validator failure, accept the roadmap to avoid blocking the user
            return { valid: true };
        }
    }

    private parseValidationResponse(response: string): ValidationResult {
        let jsonText = response.trim();
        jsonText = jsonText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return { valid: true };
        }
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                valid: parsed.valid === true,
                issues: Array.isArray(parsed.issues) ? parsed.issues : undefined,
                feedback: typeof parsed.feedback === "string" ? parsed.feedback : undefined,
            };
        } catch {
            return { valid: true };
        }
    }

    async checkOllamaConnection(): Promise<{ available: boolean; error?: string }> {
        try {
            const baseUrl = (this.llm as any).baseUrl || "http://127.0.0.1:11434";
            await axios.get(`${baseUrl}/api/tags`, { timeout: 5000 });
            return { available: true };
        } catch (error: any) {
            return {
                available: false,
                error: error.message || "Ollama is not accessible",
            };
        }
    }
}
