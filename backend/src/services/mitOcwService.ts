import axios, { AxiosInstance } from 'axios';

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

// Log MIT OCW errors once to avoid spam
let mitOcwErrorLogged = false;

export class MITOCWService {
    private client: AxiosInstance;
    private baseUrl = 'https://api.mitopen.mit.edu';

    constructor() {
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,
            headers: {
                'Accept': 'application/json',
            },
        });
    }

    /**
     * Search for courses using the MIT Open Learning API (api.mitopen.mit.edu).
     * This is the official, publicly accessible API for MIT OpenCourseWare content.
     */
    async searchCourses(
        query: string,
        maxResults: number = 10
    ): Promise<MITOCWCourse[]> {
        try {
            const response = await this.client.get('/api/v1/learning_resources/', {
                params: {
                    q: query,
                    limit: Math.min(maxResults * 2, 20),
                    offered_by: 'ocw',
                    resource_type: 'course',
                    sortby: '-views',
                },
            });

            if (!response.data?.results || !Array.isArray(response.data.results)) {
                return [];
            }

            return this.formatCourses(response.data.results).slice(0, maxResults);
        } catch (error: any) {
            // Try the search endpoint as a fallback
            try {
                const response = await this.client.get('/api/v1/search/', {
                    params: {
                        q: query,
                        limit: Math.min(maxResults * 2, 20),
                        offered_by: 'ocw',
                        resource_type: 'course',
                    },
                });

                if (!response.data?.results || !Array.isArray(response.data.results)) {
                    return [];
                }

                return this.formatCourses(response.data.results).slice(0, maxResults);
            } catch (fallbackError: any) {
                if (!mitOcwErrorLogged) {
                    mitOcwErrorLogged = true;
                    console.warn('MIT Open Learning API unavailable:', error.message || 'unknown error');
                }
                return [];
            }
        }
    }

    /**
     * Search for courses by topic/category
     */
    async searchByTopic(
        topic: string,
        maxResults: number = 10
    ): Promise<MITOCWCourse[]> {
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

        for (const query of queries.slice(0, 2)) {
            try {
                const courses = await this.searchCourses(query, Math.ceil(maxResults / queries.length));
                allCourses.push(...courses);
            } catch (error) {
                // Continue with next query
            }
        }

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
        return await this.searchCourses(subject, maxResults);
    }

    /**
     * Format MIT Open Learning API response to our course format
     */
    private formatCourses(results: any[]): MITOCWCourse[] {
        return results
            .filter(item => item && (item.title || item.course_title))
            .map((item: any) => {
                // Handle both direct result and nested result formats
                const course = item.resource || item;

                const title = course.title || course.course_title || 'Untitled Course';
                const description = course.description || course.short_description || `MIT OpenCourseWare: ${title}`;

                // Build URL — prefer the canonical OCW URL
                let url = course.url || '';
                if (!url && course.runs && course.runs.length > 0) {
                    url = course.runs[0].url || '';
                }
                if (!url && course.id) {
                    url = `https://ocw.mit.edu/courses/${course.id}`;
                }
                if (url && !url.startsWith('http')) {
                    url = `https://ocw.mit.edu${url}`;
                }

                // Extract instructors
                let instructors: string[] = [];
                if (course.instructors && Array.isArray(course.instructors)) {
                    instructors = course.instructors.map((inst: any) => {
                        if (typeof inst === 'string') return inst;
                        return `${inst.first_name || ''} ${inst.last_name || ''}`.trim();
                    }).filter(Boolean);
                }

                // Extract level
                let level = course.level || '';
                if (Array.isArray(course.level)) {
                    level = course.level[0] || '';
                }

                // Get thumbnail
                const thumbnail = course.image?.url || course.image_src || undefined;

                return {
                    id: String(course.id || course.readable_id || `mit-${Math.random().toString(36).substr(2, 9)}`),
                    title,
                    description: typeof description === 'string' ? description.slice(0, 300) : String(description).slice(0, 300),
                    url,
                    thumbnail,
                    instructors: instructors.length > 0 ? instructors : undefined,
                    term: course.semester || course.term,
                    level: typeof level === 'string' ? level : undefined,
                    department: course.department?.name || course.department,
                };
            });
    }

    /**
     * Check if service is configured (always true for MIT OCW as it's public)
     */
    isConfigured(): boolean {
        return true;
    }
}
