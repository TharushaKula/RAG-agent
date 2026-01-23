import axios, { AxiosInstance } from 'axios';

interface MicrosoftLearnResource {
    id: string;
    title: string;
    description: string;
    url: string;
    thumbnail?: string;
    duration?: string;
    level?: string;
    type?: string;
    role?: string[];
    products?: string[];
}

interface MicrosoftLearnCatalogResponse {
    modules?: any[];
    learningPaths?: any[];
    courses?: any[];
    certifications?: any[];
}

export class MicrosoftLearnService {
    private client: AxiosInstance;
    private baseUrl = 'https://learn.microsoft.com/api/catalog';

    constructor() {
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,
        });
    }

    /**
     * Search for learning resources using Microsoft Learn Catalog API
     */
    async searchResources(
        query: string,
        maxResults: number = 10,
        type: 'modules' | 'learningPaths' | 'courses' | 'all' = 'all'
    ): Promise<MicrosoftLearnResource[]> {
        try {
            // Microsoft Learn Catalog API structure
            // We'll fetch all content types and filter by query
            const params: any = {
                locale: 'en-us',
            };

            // Try to fetch resources - the API might return all content or support filtering
            const response = await this.client.get('/', { params });

            // If the API supports query parameter, use it
            if (!response.data || Object.keys(response.data).length === 0) {
                // Try with query parameter
                const queryResponse = await this.client.get('/', {
                    params: { ...params, q: query },
                });
                return this.formatResources(queryResponse.data, query, maxResults);
            }

            return this.formatResources(response.data, query, maxResults);
        } catch (error: any) {
            console.error('Microsoft Learn API Error:', error.response?.data || error.message);
            // Return empty array instead of throwing to allow graceful degradation
            return [];
        }
    }

    /**
     * Search for resources by topic/category
     */
    async searchByTopic(
        topic: string,
        maxResults: number = 10
    ): Promise<MicrosoftLearnResource[]> {
        // Map common topics to Microsoft Learn relevant queries
        const topicQueries: Record<string, string[]> = {
            'javascript': ['javascript', 'web development', 'node.js'],
            'react': ['react', 'frontend', 'web development'],
            'python': ['python', 'programming', 'azure'],
            'web-development': ['web development', 'html', 'css', 'javascript'],
            'machine-learning': ['machine learning', 'azure ml', 'artificial intelligence'],
            'data-science': ['data science', 'azure', 'analytics'],
            'frontend': ['web development', 'frontend', 'react'],
            'backend': ['backend', 'azure', 'api', 'server'],
            'programming': ['programming', 'development', 'code'],
            'cloud': ['azure', 'cloud', 'microsoft azure'],
        };

        const queries = topicQueries[topic.toLowerCase()] || [topic];
        const allResources: MicrosoftLearnResource[] = [];

        // Search with multiple queries and combine results
        for (const query of queries.slice(0, 2)) {
            try {
                const resources = await this.searchResources(query, Math.ceil(maxResults / queries.length));
                allResources.push(...resources);
            } catch (error) {
                console.error(`Error searching for "${query}":`, error);
            }
        }

        // Remove duplicates and limit results
        const uniqueResources = Array.from(
            new Map(allResources.map(r => [r.id, r])).values()
        ).slice(0, maxResults);

        return uniqueResources;
    }

    /**
     * Format Microsoft Learn API response to our resource format
     */
    private formatResources(
        data: MicrosoftLearnCatalogResponse | any,
        query: string,
        maxResults: number
    ): MicrosoftLearnResource[] {
        const resources: MicrosoftLearnResource[] = [];

        // Extract resources from different content types
        const contentTypes = [
            { key: 'modules', items: data.modules },
            { key: 'learningPaths', items: data.learningPaths },
            { key: 'courses', items: data.courses },
            { key: 'certifications', items: data.certifications },
        ];

        for (const contentType of contentTypes) {
            if (contentType.items && Array.isArray(contentType.items)) {
                for (const item of contentType.items) {
                    // Filter by query if provided (case-insensitive search in title/description)
                    if (query) {
                        const searchText = `${item.title || ''} ${item.summary || item.description || ''}`.toLowerCase();
                        if (!searchText.includes(query.toLowerCase())) {
                            continue;
                        }
                    }

                    const resource: MicrosoftLearnResource = {
                        id: item.uid || item.id || `mslearn-${Math.random().toString(36).substr(2, 9)}`,
                        title: item.title || 'Untitled Resource',
                        description: item.summary || item.description || '',
                        url: item.url || `https://learn.microsoft.com/${item.uid || ''}`,
                        thumbnail: item.icon_url || item.image_url,
                        duration: item.duration_in_minutes 
                            ? `${Math.floor(item.duration_in_minutes / 60)}h ${item.duration_in_minutes % 60}m`
                            : undefined,
                        level: item.level || item.difficulty,
                        type: contentType.key.slice(0, -1), // Remove 's' from plural
                        role: item.roles || (item.role ? [item.role] : undefined),
                        products: item.products || (item.product ? [item.product] : undefined),
                    };

                    resources.push(resource);

                    if (resources.length >= maxResults) {
                        return resources;
                    }
                }
            }
        }

        return resources.slice(0, maxResults);
    }

    /**
     * Check if service is configured (always true for Microsoft Learn as it's public)
     */
    isConfigured(): boolean {
        return true; // Microsoft Learn API is public, no API key needed
    }
}
