import { NextRequest, NextResponse } from "next/server";
import { getVectorStore } from "@/lib/rag-store";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";

export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get("content-type") || "";

        let text = "";
        let source = "user-upload";
        let isGithub = false;

        if (contentType.includes("application/json")) {
            const body = await req.json();
            text = body.text;
            source = body.source || "user-paste";

            // Check if text is a GitHub URL
            if (text.startsWith("https://github.com/")) {
                isGithub = true;
                source = text; // Set source to repo URL
            }

        } else if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File;

            if (!file) {
                return NextResponse.json({ error: "No file provided" }, { status: 400 });
            }

            source = file.name;
            const buffer = Buffer.from(await file.arrayBuffer());

            if (file.type === "application/pdf") {
                const pdf = await import("pdf-parse/lib/pdf-parse.js");
                const data = await pdf.default(buffer);
                text = data.text;
            } else {
                // Assume text/plain or markdown
                text = buffer.toString("utf-8");
            }
        } else {
            return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
        }

        const vectorStore = await getVectorStore();

        // --- GitHub Logic ---
        if (isGithub) {
            // Check if it's a Profile URL (no sub-paths like /tree/ or /blob/)
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
                    const cheerio = await import("cheerio");

                    // Fetch Heatmap for Streaks
                    const contribUrl = `https://github.com/users/${username}/contributions`;
                    const resVideo = await fetch(contribUrl);
                    if (resVideo.ok) {
                        const html = await resVideo.text();
                        const $ = cheerio.load(html);

                        // Extract Total Contributions (Fallback)
                        const totalText = $("h2.f4").text().trim().replace(/[^\d]/g, '');
                        profileData.totalContributions = parseInt(totalText || "0", 10);

                        // Calculate Streaks
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

                    // Fetch Main Page for Repo Count (Fallback)
                    try {
                        const mainRes = await fetch(source); // source is https://github.com/username
                        if (mainRes.ok) {
                            const mainHtml = await mainRes.text();
                            const $main = cheerio.load(mainHtml);
                            // Look for the "Repositories" tab counter
                            // Typically: <a href="/user?tab=repositories" ...><span class="Counter">30</span></a>
                            const repoCountText = $main(`a[href*="tab=repositories"] .Counter`).first().text().trim();
                            const repoCount = parseInt(repoCountText || "0", 10);
                            if (!isNaN(repoCount)) {
                                profileData.repos = repoCount;
                            }
                        }
                    } catch (scrapeErr) {
                        console.warn("Failed to scrape main profile for repo count:", scrapeErr);
                    }

                    // 2. Fetch Exact Stats via API (If Token Available)
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

                                    // Recalculate total if we have exact numbers (optional, but often API total != scraped total due to private contribs logic)
                                    // We'll keep the scraped total as "visible total" or just sum these up?
                                    // Usually scraped total includes private contributions if the user is viewing their own profile, but we are viewing as public.
                                    // Let's set the total to the sum of these if it's greater than scanned, or just list them separately.
                                    // Actually, let's just keep the breakdown as the primary value add.
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

                    const vectorStore = await getVectorStore();
                    await vectorStore.addDocuments([new Document({
                        pageContent: summaryText,
                        metadata: { source: source, type: "profile" }
                    })]);

                    return NextResponse.json({ success: true, chunks: 1, message: "Profile ingested successfully" });

                } catch (err: any) {
                    console.error("Profile Scrape Error:", err);
                    return NextResponse.json({ error: "Failed to scrape profile: " + err.message }, { status: 500 });
                }
            }

            // Repo Logic
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

                // Split loaded docs
                const splitter = new RecursiveCharacterTextSplitter({
                    chunkSize: 1000,
                    chunkOverlap: 200,
                });

                const splitDocs = await splitter.splitDocuments(docs);
                await vectorStore.addDocuments(splitDocs);

                return NextResponse.json({ success: true, chunks: splitDocs.length });

            } catch (ghError: any) {
                console.error("GitHub Loader Error:", ghError);
                return NextResponse.json({ error: "Failed to load GitHub repo: " + ghError.message }, { status: 500 });
            }
        }

        // --- Standard Logic ---
        if (!text) {
            return NextResponse.json({ error: "No text extracted" }, { status: 400 });
        }

        // Split text into chunks
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const docs = await splitter.createDocuments([text], [{ source }]);

        // Add to vector store
        await vectorStore.addDocuments(docs);

        return NextResponse.json({ success: true, chunks: docs.length });
    } catch (error: any) {
        console.error("Ingestion error:", error);
        return NextResponse.json({ error: "Failed to ingest data: " + error.message }, { status: 500 });
    }
}
