import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';

interface MITOCWCourse {
    id: string;
    title: string;
    description: string;
    url: string;
    thumbnail?: string;
    instructors?: string[];
    term?: string;
    level?: string;
    department?: string;
}

interface MITOCWSearchResponse {
    courses: Array<{
        id: string;
        title: string;
        description: string;
        url: string;
        instructors?: Array<{ first_name: string; last_name: string }>;
        term?: string;
        level?: string;
        department?: string;
        image?: string;
    }>;
    total: number;
}

export class MITOCWService {
    private client: AxiosInstance;
    private baseUrl = 'https://ocw.mit.edu';

    constructor() {
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,
        });
    }

    /**
     * Search for courses using MIT OCW search API
     * Note: MIT OCW may not have a public API endpoint. This method tries common variations.
     * If all fail, returns empty array gracefully.
     */
    async searchCourses(
        query: string,
        maxResults: number = 10
    ): Promise<MITOCWCourse[]> {
        // Try different possible endpoint variations
        const endpoints = [
            { path: '/search/api/v1/search', params: { q: query, limit: Math.min(maxResults, 50) } },
            { path: '/api/v1/search', params: { q: query, limit: Math.min(maxResults, 50) } },
            { path: '/api/search', params: { q: query, limit: Math.min(maxResults, 50) } },
            { path: '/search/api/search', params: { q: query, limit: Math.min(maxResults, 50) } },
            // Try with different parameter names
            { path: '/search/api/v1/search', params: { query: query, limit: Math.min(maxResults, 50) } },
            { path: '/search/api/v1/search', params: { search: query, limit: Math.min(maxResults, 50) } },
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await this.client.get(endpoint.path, {
                    params: endpoint.params,
                    validateStatus: (status) => status < 500, // Don't throw on 404, just try next
                });

                if (response.status === 200 && response.data) {
                    const courses = this.formatCourses(response.data);
                    if (courses.length > 0) {
                        return courses;
                    }
                }
            } catch (error: any) {
                // Continue to next endpoint if this one fails
                // Only log non-404 errors to avoid spam
                if (error.response?.status && error.response.status !== 404) {
                    console.warn(`MIT OCW endpoint ${endpoint.path} returned ${error.response.status}`);
                }
            }
        }

        // If all API endpoints fail, try web scraping as fallback
        try {
            return await this.scrapeSearchResults(query, maxResults);
        } catch (error: any) {
            // Silently return empty array - web scraping is a fallback, not a requirement
            return [];
        }
    }

    /**
     * Fallback method: Scrape search results from MIT OCW search page
     */
    private async scrapeSearchResults(
        query: string,
        maxResults: number = 10
    ): Promise<MITOCWCourse[]> {
        try {
            // Fetch the search page
            const searchUrl = `/search/?q=${encodeURIComponent(query)}`;
            const response = await this.client.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                },
                responseType: 'text',
                timeout: 20000,
            });

            const html = response.data as string;
            const $ = cheerio.load(html);
            const courses: MITOCWCourse[] = [];

            // MIT OCW search results are typically in specific containers
            // Look for course links and information
            $('a[href*="/courses/"]').each((index, element) => {
                if (courses.length >= maxResults) return false;

                const $link = $(element);
                const href = $link.attr('href');
                const title = $link.text().trim();

                // Skip if no valid course URL or title
                if (!href || !title || href === '#' || title.length < 3) {
                    return;
                }

                // Extract course ID from URL (e.g., /courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/)
                const courseMatch = href.match(/\/courses\/([^\/]+)/);
                if (!courseMatch) return;

                const courseId = courseMatch[1];
                
                // Check if we already have this course
                if (courses.some(c => c.id === courseId)) {
                    return;
                }

                // Try to find description from nearby elements
                let description = '';
                const $parent = $link.closest('div, li, article');
                $parent.find('p, .description, .summary').each((i, descEl) => {
                    const descText = $(descEl).text().trim();
                    if (descText.length > 50 && descText.length < 500) {
                        description = descText;
                        return false; // Stop after first good description
                    }
                });

                // Try to find instructors, department, level from the page structure
                let instructors: string[] = [];
                let department = '';
                let level = '';
                let term = '';

                // Look for metadata in the course card or nearby
                $parent.find('.instructor, .faculty, [class*="instructor"]').each((i, el) => {
                    const instructorText = $(el).text().trim();
                    if (instructorText) {
                        instructors.push(instructorText);
                    }
                });

                $parent.find('[class*="department"], [class*="subject"]').each((i, el) => {
                    const deptText = $(el).text().trim();
                    if (deptText && !department) {
                        department = deptText;
                    }
                });

                $parent.find('[class*="level"], [class*="undergraduate"], [class*="graduate"]').each((i, el) => {
                    const levelText = $(el).text().trim();
                    if (levelText && !level) {
                        level = levelText;
                    }
                });

                // Build full URL
                const courseUrl = href.startsWith('http') 
                    ? href 
                    : `${this.baseUrl}${href}`;

                // Try to find thumbnail/image
                let thumbnail: string | undefined;
                const $img = $parent.find('img').first();
                if ($img.length) {
                    const imgSrc = $img.attr('src') || $img.attr('data-src');
                    if (imgSrc) {
                        thumbnail = imgSrc.startsWith('http') 
                            ? imgSrc 
                            : `${this.baseUrl}${imgSrc}`;
                    }
                }

                courses.push({
                    id: courseId,
                    title: title,
                    description: description || `MIT OpenCourseWare course: ${title}`,
                    url: courseUrl,
                    thumbnail: thumbnail,
                    instructors: instructors.length > 0 ? instructors : undefined,
                    department: department || undefined,
                    level: level || undefined,
                    term: term || undefined,
                });
            });

            // If we didn't find enough courses with the above method, try alternative selectors
            if (courses.length < maxResults) {
                // Try looking for course cards or list items
                $('.course-card, .course-item, [class*="course"]').each((index, element) => {
                    if (courses.length >= maxResults) return false;

                    const $card = $(element);
                    const $link = $card.find('a[href*="/courses/"]').first();
                    
                    if ($link.length) {
                        const href = $link.attr('href');
                        const title = $link.text().trim() || $card.find('h2, h3, .title').first().text().trim();

                        if (href && title) {
                            const courseMatch = href.match(/\/courses\/([^\/]+)/);
                            if (courseMatch) {
                                const courseId = courseMatch[1];
                                
                                // Skip if already added
                                if (courses.some(c => c.id === courseId)) {
                                    return;
                                }

                                const description = $card.find('p, .description').first().text().trim();
                                const courseUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
                                
                                courses.push({
                                    id: courseId,
                                    title: title,
                                    description: description || `MIT OpenCourseWare course: ${title}`,
                                    url: courseUrl,
                                });
                            }
                        }
                    }
                });
            }

            return courses.slice(0, maxResults);
        } catch (error: any) {
            console.error('Failed to scrape MIT OCW search results:', error.message);
            throw error;
        }
    }

    /**
     * Search for courses by topic/category
     */
    async searchByTopic(
        topic: string,
        maxResults: number = 10
    ): Promise<MITOCWCourse[]> {
        // Map common topics to relevant search queries
        const topicQueries: Record<string, string[]> = {
            'javascript': ['javascript', 'web programming', 'computer science'],
            'react': ['react', 'web development', 'frontend'],
            'python': ['python', 'programming', 'computer science'],
            'web-development': ['web development', 'html', 'css', 'javascript'],
            'machine-learning': ['machine learning', 'artificial intelligence', 'neural networks'],
            'data-science': ['data science', 'statistics', 'data analysis'],
            'frontend': ['web development', 'user interface', 'frontend'],
            'backend': ['backend', 'server', 'database', 'API'],
            'programming': ['programming', 'computer science', 'software engineering'],
        };

        const queries = topicQueries[topic.toLowerCase()] || [topic];
        const allCourses: MITOCWCourse[] = [];

        // Search with multiple queries and combine results
        for (const query of queries.slice(0, 2)) {
            try {
                const courses = await this.searchCourses(query, Math.ceil(maxResults / queries.length));
                allCourses.push(...courses);
            } catch (error) {
                console.error(`Error searching for "${query}":`, error);
            }
        }

        // Remove duplicates and limit results
        const uniqueCourses = Array.from(
            new Map(allCourses.map(c => [c.id, c])).values()
        ).slice(0, maxResults);

        return uniqueCourses;
    }

    /**
     * Get courses by subject/department
     */
    async getCoursesBySubject(
        subject: string,
        maxResults: number = 10
    ): Promise<MITOCWCourse[]> {
        // Use the same search method with subject as query
        return await this.searchCourses(subject, maxResults);
    }

    /**
     * Format MIT OCW API response to our course format
     */
    private formatCourses(data: any): MITOCWCourse[] {
        // Handle different possible response structures
        let courses: any[] = [];
        
        if (Array.isArray(data)) {
            courses = data;
        } else if (data?.courses && Array.isArray(data.courses)) {
            courses = data.courses;
        } else if (data?.results && Array.isArray(data.results)) {
            courses = data.results;
        } else if (data?.items && Array.isArray(data.items)) {
            courses = data.items;
        } else {
            console.warn('MIT OCW API response format not recognized:', Object.keys(data || {}));
            return [];
        }

        return courses.map((course: any) => {
            // Format instructors
            let instructors: string[] = [];
            if (course.instructors && Array.isArray(course.instructors)) {
                instructors = course.instructors.map((inst: any) => {
                    if (typeof inst === 'string') return inst;
                    return `${inst.first_name || ''} ${inst.last_name || ''}`.trim();
                }).filter(Boolean);
            }

            // Build full URL
            const courseUrl = course.url 
                ? (course.url.startsWith('http') ? course.url : `${this.baseUrl}${course.url}`)
                : `${this.baseUrl}/courses/${course.id}`;

            // Get thumbnail/image
            const thumbnail = course.image 
                ? (course.image.startsWith('http') ? course.image : `${this.baseUrl}${course.image}`)
                : undefined;

            return {
                id: course.id || course.url || `mit-ocw-${Math.random().toString(36).substr(2, 9)}`,
                title: course.title || 'Untitled Course',
                description: course.description || '',
                url: courseUrl,
                thumbnail: thumbnail,
                instructors: instructors.length > 0 ? instructors : undefined,
                term: course.term,
                level: course.level,
                department: course.department,
            };
        });
    }

    /**
     * Check if service is configured (always true for MIT OCW as it's public)
     */
    isConfigured(): boolean {
        return true; // MIT OCW is public, no API key needed
    }
}
