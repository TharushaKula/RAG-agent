import axios, { AxiosInstance } from 'axios';

interface YouTubeVideo {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    channelTitle: string;
    publishedAt: string;
    duration: string;
    viewCount?: string;
    url: string;
}

interface YouTubeSearchResponse {
    items: YouTubeVideo[];
    nextPageToken?: string;
}

// Log quota/availability once per process to avoid spamming when YouTube is used per-module
let youtubeQuotaLogged = false;
let youtubeErrorLogged = false;

export class YouTubeService {
    private apiKey: string;
    private client: AxiosInstance;
    private baseUrl = 'https://www.googleapis.com/youtube/v3';

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.YOUTUBE_API_KEY || '';
        if (!this.apiKey) {
            console.warn('⚠️  YouTube API key not found. YouTube features will be disabled.');
        }

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
        });
    }

    /**
     * Search for videos by query
     */
    async searchVideos(
        query: string,
        maxResults: number = 10,
        order: 'relevance' | 'date' | 'rating' | 'title' | 'viewCount' = 'relevance'
    ): Promise<YouTubeVideo[]> {
        if (!this.apiKey) {
            throw new Error('YouTube API key is not configured');
        }

        try {
            const response = await this.client.get('/search', {
                params: {
                    part: 'snippet',
                    q: query,
                    type: 'video',
                    maxResults: Math.min(maxResults, 50), // YouTube API limit is 50
                    order: order,
                    key: this.apiKey,
                },
            });

            const videoIds = response.data.items.map((item: any) => item.id.videoId).join(',');
            
            // Get detailed video information including duration
            const detailsResponse = await this.client.get('/videos', {
                params: {
                    part: 'contentDetails,statistics,snippet',
                    id: videoIds,
                    key: this.apiKey,
                },
            });

            return this.formatVideos(response.data.items, detailsResponse.data.items);
        } catch (error: any) {
            const status = error.response?.status;
            const isQuota = status === 403 || error.response?.data?.error?.message?.toLowerCase().includes('quota');
            if (isQuota && !youtubeQuotaLogged) {
                youtubeQuotaLogged = true;
                console.warn('⚠️ YouTube API quota exceeded; video results will be skipped. Other sources (MS Learn, MIT OCW, Books) will still be used.');
            } else if (!isQuota && !youtubeErrorLogged) {
                youtubeErrorLogged = true;
                console.warn('⚠️ YouTube API unavailable:', error.message || 'unknown error');
            }
            return [];
        }
    }

    /**
     * Search for videos by topic/category
     */
    async searchByTopic(
        topic: string,
        maxResults: number = 10
    ): Promise<YouTubeVideo[]> {
        // Common programming/tech topics mapping
        const topicQueries: Record<string, string[]> = {
            'javascript': ['javascript tutorial', 'javascript course', 'learn javascript'],
            'react': ['react tutorial', 'react course', 'learn react'],
            'python': ['python tutorial', 'python course', 'learn python'],
            'web-development': ['web development tutorial', 'full stack development'],
            'machine-learning': ['machine learning tutorial', 'ML course', 'deep learning'],
            'data-science': ['data science tutorial', 'data analysis course'],
            'frontend': ['frontend development', 'HTML CSS JavaScript'],
            'backend': ['backend development', 'node.js tutorial', 'API development'],
        };

        const queries = topicQueries[topic.toLowerCase()] || [topic];
        const allVideos: YouTubeVideo[] = [];

        // Search with multiple queries and combine results
        for (const query of queries.slice(0, 2)) {
            try {
                const videos = await this.searchVideos(query, Math.ceil(maxResults / queries.length));
                allVideos.push(...videos);
            } catch (error) {
                console.error(`Error searching for "${query}":`, error);
            }
        }

        // Remove duplicates and limit results
        const uniqueVideos = Array.from(
            new Map(allVideos.map(v => [v.id, v])).values()
        ).slice(0, maxResults);

        return uniqueVideos;
    }

    /**
     * Get popular educational videos
     */
    async getPopularEducationalVideos(
        category: string = 'Education',
        maxResults: number = 10
    ): Promise<YouTubeVideo[]> {
        if (!this.apiKey) {
            throw new Error('YouTube API key is not configured');
        }

        try {
            // Get category ID for Education (category 27)
            const response = await this.client.get('/videos', {
                params: {
                    part: 'snippet,contentDetails,statistics',
                    chart: 'mostPopular',
                    videoCategoryId: '27', // Education category
                    maxResults: Math.min(maxResults, 50),
                    key: this.apiKey,
                    regionCode: 'US',
                },
            });

            return this.formatVideos(response.data.items, response.data.items);
        } catch (error: any) {
            if (!youtubeErrorLogged) {
                youtubeErrorLogged = true;
                console.warn('⚠️ YouTube API unavailable:', error.message || 'unknown error');
            }
            return [];
        }
    }

    /**
     * Format YouTube API response to our video format
     */
    private formatVideos(searchItems: any[], detailItems: any[]): YouTubeVideo[] {
        const detailMap = new Map(
            detailItems.map((item: any) => [item.id, item])
        );

        return searchItems
            .filter((item: any) => item.id?.videoId)
            .map((item: any) => {
                const videoId = item.id.videoId;
                const details = detailMap.get(videoId);

                // Parse duration (PT4M13S -> 4:13)
                let duration = 'N/A';
                if (details?.contentDetails?.duration) {
                    duration = this.parseDuration(details.contentDetails.duration);
                }

                return {
                    id: videoId,
                    title: item.snippet.title,
                    description: item.snippet.description || '',
                    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
                    channelTitle: item.snippet.channelTitle || 'Unknown',
                    publishedAt: item.snippet.publishedAt || '',
                    duration: duration,
                    viewCount: details?.statistics?.viewCount || '0',
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                };
            });
    }

    /**
     * Parse ISO 8601 duration to readable format
     */
    private parseDuration(isoDuration: string): string {
        const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 'N/A';

        const hours = parseInt(match[1] || '0', 10);
        const minutes = parseInt(match[2] || '0', 10);
        const seconds = parseInt(match[3] || '0', 10);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Check if API key is configured
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }
}
