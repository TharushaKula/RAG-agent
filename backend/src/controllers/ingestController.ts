import { Request, Response } from "express";
import { getVectorStore } from "../services/ragService";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import * as cheerio from "cheerio";

export const ingestData = async (req: Request, res: Response) => {
    try {
        const contentType = req.headers["content-type"] || "";
        let text = "";
        let source = "user-upload";
        let isGithub = false;

        if (contentType.includes("application/json")) {
            const body = req.body; // express.json() middleware needed
            text = body.text;
            source = body.source || "user-paste";

            if (text && text.startsWith("https://github.com/")) {
                isGithub = true;
                source = text;
            }

        } else if (contentType.includes("multipart/form-data")) {
            const file = req.file;
            if (!file) {
                return res.status(400).json({ error: "No file provided" });
            }
            source = file.originalname;
            const buffer = file.buffer;

            if (file.mimetype === "application/pdf") {
                const pdf = await import("pdf-parse");
                const data = await pdf.default(buffer);
                text = data.text;
            } else {
                text = buffer.toString("utf-8");
            }
        } else {
            return res.status(400).json({ error: "Unsupported content type" });
        }

        if (!(req as any).user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const userId = (req as any).user.userId;

        const vectorStore = await getVectorStore();

        // --- GitHub Logic ---
        if (isGithub) {
            const isProfile = !source.includes("/tree/") && !source.includes("/blob/") && source.split("/").length === 4;

            if (isProfile) {
                console.log(`Processing GitHub Profile: ${source}`);
                const username = source.split("/").pop();
                let profileData = {
                    totalContributions: 0,
                    commits: 0,
                    issues: 0,
                    pullRequests: 0,
                    reviews: 0,
                    repos: 0,
                    currentStreak: 0,
                    longestStreak: 0,
                    activeDays: 0,
                    isExact: false
                };

                try {
                    // 1. Scrape for Streaks & Total (Fallback + Repos)
                    const contribUrl = `https://github.com/users/${username}/contributions`;
                    const resVideo = await fetch(contribUrl);
                    if (resVideo.ok) {
                        const html = await resVideo.text();
                        const $ = cheerio.load(html);

                        const totalText = $("h2.f4").text().trim().replace(/[^\d]/g, '');
                        profileData.totalContributions = parseInt(totalText || "0", 10);

                        const days: { date: string, count: number }[] = [];
                        $("td.ContributionCalendar-day").each((_, el) => {
                            const count = parseInt($(el).attr("data-count") || "0", 10);
                            const date = $(el).attr("data-date");
                            if (date) days.push({ date, count });
                        });

                        days.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                        let longestStreak = 0;
                        let tempStreak = 0;
                        for (let i = 0; i < days.length; i++) {
                            if (days[i].count > 0) {
                                tempStreak++;
                            } else {
                                if (tempStreak > longestStreak) longestStreak = tempStreak;
                                tempStreak = 0;
                            }
                        }
                        if (tempStreak > longestStreak) longestStreak = tempStreak;

                        let currentStreak = 0;
                        const today = new Date().toISOString().split('T')[0];
                        for (let i = days.length - 1; i >= 0; i--) {
                            const dayDate = days[i].date;
                            if (days[i].count > 0) {
                                currentStreak++;
                            } else {
                                if (dayDate === today && days[i].count === 0) continue;
                                break;
                            }
                        }

                        profileData.currentStreak = currentStreak;
                        profileData.longestStreak = longestStreak;
                        profileData.activeDays = days.filter(d => d.count > 0).length;
                    }

                    try {
                        const mainRes = await fetch(source);
                        if (mainRes.ok) {
                            const mainHtml = await mainRes.text();
                            const $main = cheerio.load(mainHtml);
                            const repoCountText = $main(`a[href*="tab=repositories"] .Counter`).first().text().trim();
                            const repoCount = parseInt(repoCountText || "0", 10);
                            if (!isNaN(repoCount)) {
                                profileData.repos = repoCount;
                            }
                        }
                    } catch (scrapeErr) {
                        console.warn("Failed to scrape main profile for repo count:", scrapeErr);
                    }

                    if (process.env.GITHUB_TOKEN) {
                        try {
                            const query = `
                                query($username: String!) {
                                    user(login: $username) {
                                        repositories {
                                            totalCount
                                        }
                                        contributionsCollection {
                                            totalCommitContributions
                                            totalIssueContributions
                                            totalPullRequestContributions
                                            totalPullRequestReviewContributions
                                        }
                                    }
                                }
                            `;

                            const apiRes = await fetch("https://api.github.com/graphql", {
                                method: "POST",
                                headers: {
                                    "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({ query, variables: { username } })
                            });

                            const apiData = await apiRes.json();

                            if (apiData.data?.user) {
                                if (apiData.data.user.repositories) {
                                    profileData.repos = apiData.data.user.repositories.totalCount;
                                }
                                if (apiData.data.user.contributionsCollection) {
                                    const contribs = apiData.data.user.contributionsCollection;
                                    profileData.commits = contribs.totalCommitContributions;
                                    profileData.issues = contribs.totalIssueContributions;
                                    profileData.pullRequests = contribs.totalPullRequestContributions;
                                    profileData.reviews = contribs.totalPullRequestReviewContributions;
                                    profileData.isExact = true;
                                }
                            }
                        } catch (apiErr) {
                            console.warn("GitHub API failed, falling back to scraped data:", apiErr);
                        }
                    }

                    let summaryText = "";
                    if (profileData.isExact) {
                        summaryText = `
GitHub Profile Analysis for User: ${username}
Source URL: ${source}
---
Total Repositories: ${profileData.repos}
Total Contributions (Last Year): ${profileData.totalContributions} (Approximate based on public graph)
Detailed Breakdown:
- Commits: ${profileData.commits}
- Issues Created: ${profileData.issues}
- Pull Requests: ${profileData.pullRequests}
- Code Reviews: ${profileData.reviews}
---
Activity Stats:
- Current Streak: ${profileData.currentStreak} days
- Longest Streak: ${profileData.longestStreak} days
- Active Days: ${profileData.activeDays} days
                        `.trim();
                    } else {
                        summaryText = `
GitHub Profile Analysis for User: ${username}
Source URL: ${source}
---
Total Repositories: ${profileData.repos}
Total Contributions: ${profileData.totalContributions}
(Note: This is an aggregate number. For a breakdown of Commits/Issues/PRs, a GITHUB_TOKEN is required in the backend configuration.)
---
Activity Stats:
- Current Streak: ${profileData.currentStreak} days
- Longest Streak: ${profileData.longestStreak} days
- Active Days: ${profileData.activeDays} days
                        `.trim();
                    }

                    await vectorStore.addDocuments([new Document({
                        pageContent: summaryText,
                        metadata: { source: source, type: "profile", userId: userId }
                    })]);

                    return res.json({ success: true, chunks: 1, message: "Profile ingested successfully" });

                } catch (err: any) {
                    console.error("Profile Scrape Error:", err);
                    return res.status(500).json({ error: "Failed to scrape profile: " + err.message });
                }
            }

            console.log(`Cloning GitHub Repo: ${source}`);
            try {
                const { GithubRepoLoader } = await import("@langchain/community/document_loaders/web/github");

                const loader = new GithubRepoLoader(source, {
                    branch: "main",
                    recursive: true,
                    unknown: "warn",
                    ignoreFiles: ["package-lock.json", "yarn.lock", "*.svg", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico"],
                });

                const docs = await loader.load();
                console.log(`Loaded ${docs.length} files from GitHub`);

                const splitter = new RecursiveCharacterTextSplitter({
                    chunkSize: 1000,
                    chunkOverlap: 200,
                });

                const splitDocs = await splitter.splitDocuments(docs);
                // Add userId to all docs
                splitDocs.forEach(doc => doc.metadata.userId = userId);
                await vectorStore.addDocuments(splitDocs);

                return res.json({ success: true, chunks: splitDocs.length });

            } catch (ghError: any) {
                console.error("GitHub Loader Error:", ghError);
                return res.status(500).json({ error: "Failed to load GitHub repo: " + ghError.message });
            }
        }

        // --- Standard Logic ---
        if (!text) {
            return res.status(400).json({ error: "No text extracted" });
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const docs = await splitter.createDocuments([text], [{ source, userId: userId }]);
        await vectorStore.addDocuments(docs);

        return res.json({ success: true, chunks: docs.length });
    } catch (error: any) {
        console.error("Ingestion error:", error);
        return res.status(500).json({ error: "Failed to ingest data: " + error.message });
    }
}
