import { Request, Response } from "express";
import axios from "axios";
import * as cheerio from "cheerio";

const HN_BASE_URL = "https://hacker-news.firebaseio.com/v0";

// Simple in-memory cache
let trendCache: any[] = [];
let lastFetch = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export const getTrends = async (req: Request, res: Response) => {
    try {
        const now = Date.now();
        if (trendCache.length > 0 && (now - lastFetch) < CACHE_TTL) {
            return res.json({ source: "cache", data: trendCache });
        }

        // Fetch Top Stories IDs
        const { data: topIds } = await axios.get(`${HN_BASE_URL}/topstories.json`);

        // Take top 15 (reduced from 30 to allow time for scraping)
        const top15Ids = topIds.slice(0, 15);

        // Fetch details in parallel
        const storiesPromises = top15Ids.map((id: number) =>
            axios.get(`${HN_BASE_URL}/item/${id}.json`).then(res => res.data)
        );

        const stories = await Promise.all(storiesPromises);

        // Filter out nulls or deleted items
        const cleanStories = stories.filter((s: any) => s && !s.deleted && !s.dead);

        // Enhance with Open Graph Data
        const enhancedStoriesPromises = cleanStories.map(async (story: any) => {
            const baseData = {
                id: story.id,
                title: story.title,
                url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
                score: story.score,
                by: story.by,
                time: story.time,
                descendants: story.descendants,
                image: null,
                description: null
            };

            if (story.url) {
                try {
                    // Timeout after 2 seconds to keep it snappy
                    const { data: html } = await axios.get(story.url, {
                        timeout: 2000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
                        }
                    });

                    const $ = cheerio.load(html);
                    const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
                    const ogDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');

                    if (ogImage) baseData.image = ogImage as any;
                    if (ogDesc) baseData.description = ogDesc as any;

                } catch (err) {
                    // Ignore scraping errors, fallback to default
                    // console.warn(`Failed to scrape OG for ${story.url}`);
                }
            }

            return baseData;
        });

        const enhancedStories = await Promise.all(enhancedStoriesPromises);

        trendCache = enhancedStories;
        lastFetch = now;

        res.json({ source: "api", data: enhancedStories });

    } catch (error: any) {
        console.error("Error fetching HN trends:", error.message);
        res.status(500).json({ error: "Failed to fetch industry trends" });
    }
};
