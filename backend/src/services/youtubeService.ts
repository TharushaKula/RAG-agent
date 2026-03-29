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

// Minimum view count threshold for quality filtering
const MIN_VIEW_COUNT = 1000;
// Duration bounds in seconds: skip very short (<2min) and very long (>3hr) videos
const MIN_DURATION_SECONDS = 120;
const MAX_DURATION_SECONDS = 10800;

export class YouTubeService {
    private apiKey: string;
    private client: AxiosInstance;
    private baseUrl = 'https://www.googleapis.com/youtube/v3';

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.YOUTUBE_API_KEY || '';
        if (!this.apiKey) {
            console.warn('YouTube API key not found. YouTube features will be disabled.');
        }

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
        });
    }

    /**
     * Search for educational videos with quality filtering.
     * Fetches more results than needed, then filters by view count and duration
     * to return only high-quality, relevant educational content.
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
            // Request 3x the needed results so we have enough after quality filtering
            const fetchCount = Math.min(maxResults * 3, 30);

            const response = await this.client.get('/search', {
                params: {
                    part: 'snippet',
                    q: query,
                    type: 'video',
                    maxResults: fetchCount,
                    order: order,
                    key: this.apiKey,
                    relevanceLanguage: 'en',
                    // Only include videos with CC or standard license (filters out some spam)
                    safeSearch: 'strict',
                    // Filter for medium/long videos to skip shorts and very short clips
                    videoDuration: 'medium',  // 4-20 minutes
                },
            });

            if (!response.data.items || response.data.items.length === 0) {
                return [];
            }

            const videoIds = response.data.items
                .filter((item: any) => item.id?.videoId)
                .map((item: any) => item.id.videoId)
                .join(',');

            if (!videoIds) return [];

            // Get detailed video information including duration and statistics
            const detailsResponse = await this.client.get('/videos', {
                params: {
                    part: 'contentDetails,statistics,snippet',
                    id: videoIds,
                    key: this.apiKey,
                },
            });

            const videos = this.formatVideos(response.data.items, detailsResponse.data.items);

            // Apply quality filters: minimum views and appropriate duration
            const filtered = videos.filter(video => {
                const views = parseInt(video.viewCount || '0', 10);
                const durationSec = this.parseDurationToSeconds(video.duration);

                // Must have reasonable view count (quality signal)
                if (views < MIN_VIEW_COUNT) return false;

                // Duration must be in useful range (skip shorts and excessively long)
                if (durationSec !== null) {
                    if (durationSec < MIN_DURATION_SECONDS || durationSec > MAX_DURATION_SECONDS) return false;
                }

                return true;
            });

            // Sort by a quality score: combine relevance position with view count
            filtered.sort((a, b) => {
                const viewsA = parseInt(a.viewCount || '0', 10);
                const viewsB = parseInt(b.viewCount || '0', 10);
                // Log-scale view count to avoid mega-popular but irrelevant videos dominating
                const scoreA = Math.log10(Math.max(viewsA, 1));
                const scoreB = Math.log10(Math.max(viewsB, 1));
                return scoreB - scoreA;
            });

            return filtered.slice(0, maxResults);
        } catch (error: any) {
            const status = error.response?.status;
            const isQuota = status === 403 || error.response?.data?.error?.message?.toLowerCase().includes('quota');
            if (isQuota && !youtubeQuotaLogged) {
                youtubeQuotaLogged = true;
                console.warn('YouTube API quota exceeded; video results will be skipped. Other sources (MS Learn, MIT OCW, Books) will still be used.');
            } else if (!isQuota && !youtubeErrorLogged) {
                youtubeErrorLogged = true;
                console.warn('YouTube API unavailable:', error.message || 'unknown error');
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
                console.warn('YouTube API unavailable:', error.message || 'unknown error');
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
     * Parse a human-readable duration string (e.g. "4:13", "1:02:30") to total seconds.
     * Returns null if duration is not parseable.
     */
    private parseDurationToSeconds(duration: string): number | null {
        if (!duration || duration === 'N/A') return null;
        const parts = duration.split(':').map(Number);
        if (parts.some(isNaN)) return null;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return null;
    }

    /**
     * Check if API key is configured
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }
}
