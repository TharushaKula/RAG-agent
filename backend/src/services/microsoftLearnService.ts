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
     * Search for learning resources using Microsoft Learn Catalog API.
     * Uses type=modules,learningPaths,courses to get courses and modules (smaller response than full catalog).
     * Filters client-side by query on title/summary.
     */
    async searchResources(
        query: string,
        maxResults: number = 10,
        typeFilter: 'modules' | 'learningPaths' | 'courses' | 'all' = 'all'
    ): Promise<MicrosoftLearnResource[]> {
        try {
            const params: Record<string, string> = {
                locale: 'en-us',
            };
            if (typeFilter === 'all') {
                params['type'] = 'modules,learningPaths,courses';
            } else {
                params['type'] = typeFilter;
            }

            const response = await this.client.get('/', { params, timeout: 20000 });
            if (!response.data || Object.keys(response.data).length === 0) {
                return [];
            }
            return this.formatResources(response.data, query, maxResults);
        } catch (error: any) {
            console.warn('Microsoft Learn API:', error.response?.status || error.message);
            return [];
        }
    }

    /**
     * Search for courses and modules by topic (for roadmap and learning materials).
     * Uses topic mapping like the learning materials page for better relevance.
     */
    async searchCoursesByTopic(topic: string, maxResults: number = 8): Promise<MicrosoftLearnResource[]> {
        const topicQueries = this.getTopicQueries(topic);
        const allResources: MicrosoftLearnResource[] = [];
        for (const q of topicQueries.slice(0, 3)) {
            try {
                const resources = await this.searchResources(q, Math.ceil(maxResults / 2), 'all');
                allResources.push(...resources);
            } catch {
                // continue
            }
        }
        const unique = Array.from(new Map(allResources.map(r => [r.id, r])).values());
        return unique.slice(0, maxResults);
    }

    private getTopicQueries(topic: string): string[] {
        const t = topic.toLowerCase();
        const map: Record<string, string[]> = {
            'javascript': ['javascript', 'web development', 'node.js'],
            'react': ['react', 'frontend', 'web development'],
            'python': ['python', 'programming', 'azure'],
            'backend': ['backend', 'azure', 'api', 'server', 'rest'],
            'frontend': ['web development', 'frontend', 'html', 'css'],
            'data-science': ['data science', 'azure', 'analytics', 'machine learning'],
            'devops': ['devops', 'azure', 'ci/cd', 'deployment'],
            'fullstack': ['web development', 'full stack', 'api'],
        };
        for (const [key, queries] of Object.entries(map)) {
            if (t.includes(key)) return queries;
        }
        return [topic, 'learn', 'tutorial'];
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

                    const durationMinutes = item.duration_in_minutes ?? (item.duration_in_hours ? item.duration_in_hours * 60 : undefined);
                    const durationStr = durationMinutes
                        ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
                        : (item.duration_in_hours ? `${item.duration_in_hours}h` : undefined);
                    const resource: MicrosoftLearnResource = {
                        id: item.uid || item.id || `mslearn-${Math.random().toString(36).substr(2, 9)}`,
                        title: item.title || 'Untitled Resource',
                        description: item.summary || item.description || '',
                        url: item.url || `https://learn.microsoft.com/${item.uid || ''}`,
                        thumbnail: item.icon_url || item.image_url,
                        duration: durationStr,
                        level: item.level || item.difficulty,
                        type: contentType.key.slice(0, -1),
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
