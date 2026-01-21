import axios, { AxiosInstance } from 'axios';

interface EmbeddingResponse {
    embedding: number[];
    dimensions: number;
}

interface BatchEmbeddingResponse {
    embeddings: number[][];
    dimensions: number;
}

interface HealthResponse {
    status: string;
    service: string;
    model: string;
}

export class EmbeddingService {
    private client: AxiosInstance;
    private baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8000';
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000, // 30 seconds timeout
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Check if the embedding service is healthy
     */
    async healthCheck(): Promise<HealthResponse> {
        try {
            console.log(`🔍 Checking embedding service health at: ${this.baseUrl}/health`);
            const response = await this.client.get<HealthResponse>('/health');
            console.log(`✅ Embedding service is healthy:`, response.data);
            return response.data;
        } catch (error: any) {
            let errorMessage = 'Unknown error';
            
            if (error.code === 'ECONNREFUSED') {
                errorMessage = `Connection refused. Is the embedding service running at ${this.baseUrl}?`;
            } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                errorMessage = `Connection timeout. The embedding service at ${this.baseUrl} did not respond in time.`;
            } else if (error.code === 'ENOTFOUND') {
                errorMessage = `Host not found. Cannot resolve ${this.baseUrl}`;
            } else if (error.response) {
                errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            console.error(`❌ Embedding service health check failed:`, {
                url: `${this.baseUrl}/health`,
                code: error.code,
                message: errorMessage,
                fullError: error
            });
            
            throw new Error(`Embedding service health check failed: ${errorMessage}`);
        }
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string): Promise<number[]> {
        if (!text || !text.trim()) {
            throw new Error('Text cannot be empty');
        }

        try {
            const response = await this.client.post<EmbeddingResponse>('/embed', {
                text: text.trim(),
            });
            return response.data.embedding;
        } catch (error: any) {
            if (error.response) {
                throw new Error(`Embedding service error: ${error.response.data.detail || error.message}`);
            }
            throw new Error(`Failed to generate embedding: ${error.message}`);
        }
    }

    /**
     * Generate embeddings for multiple texts in batch
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            throw new Error('Texts array cannot be empty');
        }

        // Filter out empty texts
        const validTexts = texts.filter(text => text && text.trim());
        if (validTexts.length === 0) {
            throw new Error('No valid texts provided');
        }

        try {
            const response = await this.client.post<BatchEmbeddingResponse>('/embed/batch', {
                texts: validTexts,
            });
            return response.data.embeddings;
        } catch (error: any) {
            if (error.response) {
                throw new Error(`Embedding service error: ${error.response.data.detail || error.message}`);
            }
            throw new Error(`Failed to generate embeddings: ${error.message}`);
        }
    }

    /**
     * Calculate cosine similarity between two embeddings
     */
    static cosineSimilarity(embedding1: number[], embedding2: number[]): number {
        if (embedding1.length !== embedding2.length) {
            throw new Error('Embeddings must have the same dimension');
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < embedding1.length; i++) {
            dotProduct += embedding1[i] * embedding2[i];
            norm1 += embedding1[i] * embedding1[i];
            norm2 += embedding2[i] * embedding2[i];
        }

        const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
        if (denominator === 0) {
            return 0;
        }

        return dotProduct / denominator;
    }
}
