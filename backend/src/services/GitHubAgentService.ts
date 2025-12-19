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

    async startAnalysis(profileUrl: string) {
        if (!this.page) await this.init();

        try {
            this.emit('status', `Initializing session for ${profileUrl}...`);
            await this.page!.goto(profileUrl, { waitUntil: 'networkidle' });
            await this.captureFrame();

            // Step 1: Bio & Base Stats
            await this.executeAction('Analyzing profile header and bio...', async () => {
                const bio = await this.page!.$eval('.p-note', el => el.textContent?.trim()).catch(() => 'No bio provided');
                const location = await this.page!.$eval('[itemprop="homeLocation"]', el => el.textContent?.trim()).catch(() => 'Remote / Unknown');
                this.emit('analysis', { bio, location });
            });

            // Step 2: Achievements & Contributions
            await this.executeAction('Scanning achievements and activity...', async () => {
                const achievements = await this.page!.$$eval('.TimelineItem-badge', els => els.length).catch(() => 0);
                const contributions = await this.page!.$eval('h2.f4.text-normal.mb-2', el => el.textContent?.trim()).catch(() => 'Activity hidden');
                this.emit('analysis', { achievements, contributions });
            });

            // Step 3: Pinned Repositories
            await this.executeAction('Exploring pinned repositories...', async () => {
                const pinnedRepos = await this.page!.$$eval('.pinned-item-list-item-content', els =>
                    els.map(el => ({
                        name: el.querySelector('span.repo')?.textContent?.trim() || 'Unknown',
                        lang: el.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || 'Text',
                        desc: el.querySelector('.pinned-item-desc')?.textContent?.trim() || ''
                    }))
                ).catch(() => []);

                if (pinnedRepos.length > 0) {
                    this.emit('analysis', {
                        topRepo: pinnedRepos[0].name,
                        techFocus: Array.from(new Set(pinnedRepos.map(r => r.lang))).join(', ')
                    });
                }
            });

            // Step 4: Repositories Tab
            await this.executeAction('Navigating to full repository list...', async () => {
                const repoTab = await this.page!.$('a[data-tab-item="repositories"]');
                if (repoTab) {
                    await repoTab.click();
                    await this.page!.waitForLoadState('networkidle');
                }
            });

            await this.executeAction('Calculating total repositories...', async () => {
                const count = await this.page!.$eval('.Counter', el => el.textContent?.trim()).catch(() => '0');
                this.emit('analysis', { totalRepos: count });
            });

            // Step 5: Drill down into Top 2 Repositories
            const repoLinks = await this.page!.$$eval('h3 a[itemprop="name codeRepository"]', els =>
                els.slice(0, 2).map(el => (el as HTMLAnchorElement).href)
            ).catch(() => []);

            const insights: string[] = [];

            for (const [index, link] of repoLinks.entries()) {
                await this.executeAction(`Deep diving into repository #${index + 1}...`, async () => {
                    await this.page!.goto(link, { waitUntil: 'networkidle' });
                    const stars = await this.page!.$eval('#repo-stars-counter-star', el => el.textContent?.trim()).catch(() => '0');
                    const forks = await this.page!.$eval('#repo-network-counter', el => el.textContent?.trim()).catch(() => '0');
                    const name = await this.page!.$eval('strong[itemprop="name"]', el => el.textContent?.trim()).catch(() => 'Repo');

                    insights.push(`${name}: ${stars} stars, ${forks} forks detected.`);
                    this.emit('analysis', { insights: [...insights] });

                    // Stay a bit longer to simulate reading
                    await new Promise(r => setTimeout(r, 3000));
                    await this.page!.goBack();
                    await this.page!.waitForLoadState('networkidle');
                });
            }

            // Step 6: Yearly Contributions Analysis
            await this.executeAction('Analyzing contribution history across years...', async () => {
                const years = await this.page!.$$eval('.js-year-link', els =>
                    els.map(el => (el as HTMLAnchorElement).id).filter(id => id.startsWith('year-link-'))
                ).catch(() => []);

                const yearlyCommits: Record<string, number> = {};
                let totalCommits = 0;

                // Analyze up to 5 years for depth
                for (const yearId of years.slice(0, 5)) {
                    await this.executeAction(`Extracting contributions for ${yearId.replace('year-link-', '')}...`, async () => {
                        await this.page!.click(`#${yearId}`);
                        // Wait for the specific year's h2 to appear/update
                        await this.page!.waitForSelector('h2.f4.text-normal.mb-2', { state: 'visible' });

                        const contributionText = await this.page!.$eval('h2.f4.text-normal.mb-2', el => el.textContent?.trim() || '').catch(() => '');
                        const match = contributionText.match(/([\d,]+)\s+contributions/);
                        const year = yearId.replace('year-link-', '');

                        if (match) {
                            const count = parseInt(match[1].replace(/,/g, ''));
                            yearlyCommits[year] = count;
                            totalCommits += count;
                        }
                    });
                }

                this.emit('analysis', { yearlyCommits, totalCommits });
            });

            // Final Summary Generation
            this.emit('status', 'Synthesizing final profile insights...');
            await new Promise(r => setTimeout(r, 2000));

            this.emit('status', 'Analysis complete.');
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
