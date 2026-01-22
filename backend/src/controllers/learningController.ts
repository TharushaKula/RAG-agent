import { Request, Response } from "express";
import { YouTubeService } from "../services/youtubeService";

// Initialize YouTube service
const youtubeService = new YouTubeService();

/**
 * Get learning resources based on platform
 * YouTube: YouTube videos
 * Coursera: Coursera courses (placeholder for now)
 * Udemy: Udemy courses (placeholder for now)
 */
export const getLearningResources = async (req: Request, res: Response) => {
    try {
        const { topic, platform } = req.query;

        // Default topic if not provided
        const searchTopic = (topic as string) || "programming tutorial";

        const resources: {
            youtube: any[];
            coursera: any[];
            udemy: any[];
        } = {
            youtube: [],
            coursera: [],
            udemy: [],
        };

        // Fetch YouTube videos
        if (!platform || platform === "youtube") {
            try {
                if (youtubeService.isConfigured()) {
                    const videos = await youtubeService.searchByTopic(searchTopic as string, 12);
                    resources.youtube = videos.map((video) => ({
                        id: video.id,
                        title: video.title,
                        platform: "YouTube",
                        url: video.url,
                        thumbnail: video.thumbnail,
                        channel: video.channelTitle,
                        duration: video.duration,
                        description: video.description.substring(0, 200) + "...",
                    }));
                } else {
                    console.warn("YouTube API not configured, returning empty YouTube resources");
                }
            } catch (error: any) {
                console.error("Error fetching YouTube videos:", error.message);
                // Continue with other resources even if YouTube fails
            }
        }

        // For other platforms, we'll add integrations later
        // For now, return empty arrays
        if (!platform || platform === "coursera") {
            // TODO: Integrate Coursera API
            resources.coursera = [];
        }

        if (!platform || platform === "udemy") {
            // TODO: Integrate Udemy API
            resources.udemy = [];
        }

        res.json({ success: true, data: resources });
    } catch (error: any) {
        console.error("Error fetching learning resources:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Server Error",
        });
    }
};

/**
 * Search for specific learning resources
 */
export const searchLearningResources = async (req: Request, res: Response) => {
    try {
        const { query, type = "visual", maxResults = 10 } = req.query;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "Search query is required",
            });
        }

        if (type === "youtube" && youtubeService.isConfigured()) {
            try {
                const videos = await youtubeService.searchVideos(
                    query as string,
                    parseInt(maxResults as string, 10)
                );

                const formattedVideos = videos.map((video) => ({
                    id: video.id,
                    title: video.title,
                    platform: "YouTube",
                    url: video.url,
                    thumbnail: video.thumbnail,
                    channel: video.channelTitle,
                    duration: video.duration,
                    description: video.description.substring(0, 200) + "...",
                }));

                return res.json({ success: true, data: formattedVideos });
            } catch (error: any) {
                return res.status(500).json({
                    success: false,
                    message: `Failed to search YouTube: ${error.message}`,
                });
            }
        }

        res.json({
            success: false,
            message: `Resource type "${type}" is not yet supported`,
        });
    } catch (error: any) {
        console.error("Error searching learning resources:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Server Error",
        });
    }
};
