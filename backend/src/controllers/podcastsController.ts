import { Request, Response } from "express";
import { getUsersCollection } from "../models/User";
import { ObjectId } from "mongodb";

/**
 * Map learning goal IDs to podcast search terms
 */
const LEARNING_GOAL_TERMS: Record<string, string> = {
    exams: "exam preparation study",
    career_skills: "career development professional",
    personal_interest: "learning education",
    certifications: "certification professional",
    switch_career: "career change transition"
};

/**
 * Build search term from user profile for iTunes podcast search
 * Uses targetProfession and learningGoals to personalize results
 */
function buildSearchTermFromProfile(
    targetProfession?: string,
    learningGoals?: string[]
): string {
    const terms: string[] = [];

    if (targetProfession && targetProfession.trim()) {
        terms.push(targetProfession.trim());
    }

    if (learningGoals && learningGoals.length > 0) {
        const goalTerm = LEARNING_GOAL_TERMS[learningGoals[0]] || "learning";
        terms.push(goalTerm);
    }

    if (terms.length === 0) {
        return "technology career learning";
    }

    return terms.join(" ");
}

/**
 * Fetch 10 podcasts from iTunes API based on user profile
 * GET /api/podcasts - requires authentication
 */
export const getPodcasts = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Fetch user profile from DB
        const users = await getUsersCollection();
        const user = await users.findOne({ _id: new ObjectId(userId) });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Use query param if provided, otherwise profile-based
        const queryTerm = (req.query.term as string)?.trim();
        const searchTerm = queryTerm || buildSearchTermFromProfile(
            user.targetProfession,
            user.learningGoals
        );

        console.log(`Fetching podcasts for user ${userId}, search: "${searchTerm}"`);
        const encodedTerm = encodeURIComponent(searchTerm);
        const url = `https://itunes.apple.com/search?term=${encodedTerm}&media=podcast&entity=podcast&limit=10`;

        const iTunesRes = await fetch(url);
        if (!iTunesRes.ok) {
            throw new Error(`iTunes API returned ${iTunesRes.status}`);
        }

        const data = await iTunesRes.json();

        const podcasts = (data.results || []).map((item: any) => ({
            id: item.collectionId,
            name: item.collectionName,
            artist: item.artistName,
            artwork: item.artworkUrl600 || item.artworkUrl100,
            genre: item.primaryGenreName,
            url: item.collectionViewUrl,
            trackCount: item.trackCount,
            description: item.description || ""
        }));

        return res.json({
            success: true,
            podcasts,
            searchTerm
        });
    } catch (error: any) {
        console.error("Podcasts fetch error:", error);
        return res.status(500).json({
            error: "Failed to fetch podcasts",
            message: error.message || "Unknown error"
        });
    }
};
