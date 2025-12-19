import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { EventEmitter } from 'events';

export class GitHubAgentService extends EventEmitter {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private isPaused: boolean = false;
    private speed: number = 1000; // ms between actions

    constructor() {
        super();
    }

    async init() {
        this.browser = await chromium.launch({ headless: true });
        this.context = await this.browser.newContext({
            viewport: { width: 1280, height: 720 },
            deviceScaleFactor: 1,
        });
        this.page = await this.context.newPage();

        // Listen for console logs, clicks, etc to emit status
        this.page.on('console', msg => this.emit('status', `Browser: ${msg.text()}`));
    }

    private async fetchRepoCommits(username: string, repos: any[]) {
        const repoActivity: Record<string, number> = {};
        for (const repo of repos) {
            const query = `author:${username}+repo:${repo.full_name}`;
            const data = await this.fetchGitHubAPI(`/search/commits?q=${query}&per_page=1`).catch(() => null);
            repoActivity[repo.name] = data?.total_count || 0;
            this.emit('analysis', { repoActivity: { ...repoActivity } });
        }
    }

    private async fetchGitHubAPI(endpoint: string) {
        const token = process.env.GITHUB_TOKEN;
        const headers: Record<string, string> = {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };

        if (token) {
            headers['Authorization'] = `token ${token}`;
        }

        const response = await fetch(`https://api.github.com${endpoint}`, { headers });
        if (!response.ok) {
            if (response.status === 404) return null;
            if (response.status === 422 && endpoint.includes('/search/commits')) return { total_count: 0 };
            throw new Error(`GitHub API Error: ${response.statusText}`);
        }
        return response.json();
    }

    async startAnalysis(profileUrl: string) {
        const username = profileUrl.split('/').pop();
        if (!username) {
            this.emit('error', 'Invalid GitHub URL');
            return;
        }

        try {
            // Priority 1: GitHub API extraction for accuracy
            this.emit('status', `Thinking: I'll now use the GitHub API to fetch a comprehensive dataset for ${username}...`);

            const [profileData, reposData] = await Promise.all([
                this.fetchGitHubAPI(`/users/${username}`),
                this.fetchGitHubAPI(`/users/${username}/repos?per_page=100&sort=updated`)
            ]);

            if (!profileData) throw new Error('User not found via GitHub API');

            // Calculate aggregate stats
            const totalStars = (reposData || []).reduce((acc: number, repo: any) => acc + repo.stargazers_count, 0);
            const languages = (reposData || []).map((r: any) => r.language).filter(Boolean);
            const langFreq: Record<string, number> = {};
            languages.forEach((l: string) => langFreq[l] = (langFreq[l] || 0) + 1);
            const topLangs = Object.entries(langFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);

            this.emit('analysis', {
                bio: profileData.bio || 'No bio provided',
                location: profileData.location || 'Remote / Unknown',
                totalRepos: profileData.public_repos,
                followers: profileData.followers,
                following: profileData.following,
                gists: profileData.public_gists,
                company: profileData.company || 'N/A',
                blog: profileData.blog || '',
                joined: new Date(profileData.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                totalStars,
                techFocus: topLangs.join(', ') || 'N/A',
                avatar_url: profileData.avatar_url,
                achievements: 0 // Will be updated via browser
            });

            // Analyze Top 5 repositories via API for insights
            const topRepos = (reposData || []).sort((a: any, b: any) => b.stargazers_count - a.stargazers_count).slice(0, 5);
            const insights: string[] = [];

            for (const repo of topRepos.slice(0, 2)) { // Keep highlights specifically to top 2 for brevity
                const commits = await this.fetchGitHubAPI(`/repos/${username}/${repo.name}/commits?per_page=5`).catch(() => []);
                const lastCommit = commits?.[0]?.commit?.message || 'No recent commits';
                insights.push(`${repo.name}: ${repo.stargazers_count} stars, ${repo.forks_count} forks. Highlight: ${repo.description || 'N/A'}. Latest: "${lastCommit.slice(0, 50)}${lastCommit.length > 50 ? '...' : ''}"`);
            }

            this.emit('analysis', {
                insights,
                topRepo: topRepos[0]?.name || 'N/A'
            });

            // Priority 2: Precise Activity Metrics (Parallel with browser init)
            this.emit('status', `Thinking: Fetching master commit count and per-repo activity...`);

            // Accurate Absolute Total Commits Search
            this.fetchGitHubAPI(`/search/commits?q=author:${username}&per_page=1`).then(data => {
                this.emit('analysis', { totalCommits: data?.total_count || 0 });
            }).catch(err => console.error('Total commit fetch error:', err));

            // Per-Repo Breakdown for Top 5
            this.fetchRepoCommits(username, topRepos).catch(err => console.error('Repo commit fetch error:', err));

            // Priority 3: Browser Automation for visual demonstration
            if (!this.page) await this.init();

            this.emit('status', `Action: Navigating to profile for visual proof of activity...`);
            await this.page!.goto(profileUrl, { waitUntil: 'networkidle' });
            await this.captureFrame();

            // Step 2: Achievements (Visual only)
            await this.executeAction('Synthesizing achievements from visual badges...', async () => {
                const achievementData = await this.page!.$$eval('a[href*="tab=achievements"]', els =>
                    els.map(el => {
                        const tierLabel = el.querySelector('.achievement-tier-label')?.textContent?.trim() || 'x1';
                        return parseInt(tierLabel.replace(/[^0-9]/g, '')) || 1;
                    })
                ).catch(() => []);

                const achievements = achievementData.reduce((a, b) => a + b, 0);
                this.emit('analysis', { achievements });
            });

            // Step 3: Demonstrate Pinned Repos
            await this.executeAction('Highlighting pinned repositories for demonstration...', async () => {
                await this.page!.evaluate(() => {
                    const pinned = document.querySelector('.pinned-item-list-item');
                    if (pinned) pinned.scrollIntoView({ behavior: 'smooth', block: 'center' });
                });
            });

            this.emit('status', 'Based on GitHub API & Visual Review: Analysis complete.');
            this.emit('complete');

        } catch (error: any) {
            this.emit('error', error.message);
        }
    }

    private async executeAction<T>(description: string, action: () => Promise<T>): Promise<T> {
        while (this.isPaused) {
            await new Promise(r => setTimeout(r, 500));
        }
        this.emit('status', description);
        const result = await action();
        await this.captureFrame();
        await new Promise(r => setTimeout(r, this.speed));
        return result;
    }

    private async captureFrame() {
        if (this.page) {
            const screenshot = await this.page.screenshot({ type: 'jpeg', quality: 50 });
            this.emit('frame', screenshot.toString('base64'));
        }
    }

    async pause() {
        this.isPaused = true;
        this.emit('status', 'Paused');
    }

    async resume() {
        this.isPaused = false;
        this.emit('status', 'Resuming...');
    }

    async stop() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.emit('status', 'Stopped');
    }
}
