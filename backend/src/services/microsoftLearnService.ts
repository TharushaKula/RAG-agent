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

// Log MS Learn errors once to avoid spam
let msLearnErrorLogged = false;

export class MicrosoftLearnService {
    private client: AxiosInstance;
    private baseUrl = 'https://learn.microsoft.com/api/catalog';

    constructor() {
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 20000,
        });
    }

    /**
     * Search for learning resources using Microsoft Learn Catalog API.
     * Downloads catalog filtered by type, then performs relevance-ranked client-side search.
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
                params['type'] = 'modules,learningPaths';
            } else {
                params['type'] = typeFilter;
            }

            const response = await this.client.get('/', { params, timeout: 20000 });
            if (!response.data || Object.keys(response.data).length === 0) {
                return [];
            }
            return this.formatResources(response.data, query, maxResults);
        } catch (error: any) {
            if (!msLearnErrorLogged) {
                msLearnErrorLogged = true;
                console.warn('Microsoft Learn API:', error.response?.status || error.message);
            }
            return [];
        }
    }

    /**
     * Search for courses and modules by topic (for roadmap and learning materials).
     */
    async searchCoursesByTopic(topic: string, maxResults: number = 8): Promise<MicrosoftLearnResource[]> {
        const topicQueries = this.getTopicQueries(topic);
        // Use the first (most specific) query for best results
        const primaryQuery = topicQueries[0] || topic;
        try {
            return await this.searchResources(primaryQuery, maxResults, 'all');
        } catch {
            return [];
        }
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

        for (const query of queries.slice(0, 2)) {
            try {
                const resources = await this.searchResources(query, Math.ceil(maxResults / queries.length));
                allResources.push(...resources);
            } catch (error) {
                console.error(`Error searching for "${query}":`, error);
            }
        }

        const uniqueResources = Array.from(
            new Map(allResources.map(r => [r.id, r])).values()
        ).slice(0, maxResults);

        return uniqueResources;
    }

    /**
     * Format Microsoft Learn API response with relevance-ranked scoring.
     * Tokenizes the query and scores each resource by how many query tokens appear
     * in the title (high weight) and summary (lower weight).
     */
    private formatResources(
        data: MicrosoftLearnCatalogResponse | any,
        query: string,
        maxResults: number
    ): MicrosoftLearnResource[] {
        const allItems: Array<{ item: any; type: string }> = [];

        const contentTypes = [
            { key: 'modules', items: data.modules },
            { key: 'learningPaths', items: data.learningPaths },
            { key: 'courses', items: data.courses },
        ];

        for (const contentType of contentTypes) {
            if (contentType.items && Array.isArray(contentType.items)) {
                for (const item of contentType.items) {
                    allItems.push({ item, type: contentType.key });
                }
            }
        }

        // Tokenize query into individual searchable terms (lowercase, min 2 chars)
        const queryTokens = query
            .toLowerCase()
            .split(/\s+/)
            .filter(t => t.length >= 2);

        if (queryTokens.length === 0) {
            return [];
        }

        // Score each item by relevance
        const scored = allItems
            .map(({ item, type }) => {
                const title = (item.title || '').toLowerCase();
                const summary = (item.summary || item.description || '').toLowerCase();

                // Count how many query tokens appear in title (weight 3) and summary (weight 1)
                let score = 0;
                for (const token of queryTokens) {
                    if (title.includes(token)) score += 3;
                    else if (summary.includes(token)) score += 1;
                }

                return { item, type, score };
            })
            .filter(x => x.score > 0)  // Must match at least one token
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);

        return scored.map(({ item, type }) => {
            const durationMinutes = item.duration_in_minutes ?? (item.duration_in_hours ? item.duration_in_hours * 60 : undefined);
            const durationStr = durationMinutes
                ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
                : (item.duration_in_hours ? `${item.duration_in_hours}h` : undefined);

            return {
                id: item.uid || item.id || `mslearn-${Math.random().toString(36).substr(2, 9)}`,
                title: item.title || 'Untitled Resource',
                description: item.summary || item.description || '',
                url: item.url || `https://learn.microsoft.com/${item.uid || ''}`,
                thumbnail: item.icon_url || item.image_url,
                duration: durationStr,
                level: item.level || item.difficulty,
                type: type.slice(0, -1),
                role: item.roles || (item.role ? [item.role] : undefined),
                products: item.products || (item.product ? [item.product] : undefined),
            };
        });
    }

    /**
     * Check if service is configured (always true for Microsoft Learn as it's public)
     */
    isConfigured(): boolean {
        return true;
    }
}
