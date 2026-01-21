import { EmbeddingService } from '../services/embeddingService';

/**
 * Utility function to check if embedding service is available
 * Can be used for startup checks or health monitoring
 */
export async function checkEmbeddingService(): Promise<{ available: boolean; message: string; details?: any }> {
    const embeddingServiceUrl = process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8000';
    const embeddingService = new EmbeddingService(embeddingServiceUrl);
    
    try {
        const health = await embeddingService.healthCheck();
        return {
            available: true,
            message: 'Embedding service is healthy',
            details: health
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            available: false,
            message: 'Embedding service is not available',
            details: {
                url: embeddingServiceUrl,
                error: errorMessage
            }
        };
    }
}
