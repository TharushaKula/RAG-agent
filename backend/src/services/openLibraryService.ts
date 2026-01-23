import axios, { AxiosInstance } from 'axios';

interface OpenLibraryBook {
    id: string;
    title: string;
    description: string;
    url: string;
    thumbnail?: string;
    authors?: string[];
    isbn?: string;
    publishYear?: number;
    subjects?: string[];
    language?: string;
}

interface OpenLibrarySearchResponse {
    numFound: number;
    start: number;
    numFoundExact: boolean;
    docs: Array<{
        key: string;
        title: string;
        subtitle?: string;
        author_name?: string[];
        isbn?: string[];
        publish_year?: number[];
        subject?: string[];
        language?: string[];
        cover_i?: number;
        first_publish_year?: number;
        edition_count?: number;
    }>;
}

export class OpenLibraryService {
    private client: AxiosInstance;
    private baseUrl = 'https://openlibrary.org';

    constructor() {
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 15000,
            headers: {
                'User-Agent': 'RAG-Agent-LearningMaterials/1.0 (Educational Tool)',
            },
        });
    }

    /**
     * Search for books using Open Library Search API
     */
    async searchBooks(
        query: string,
        maxResults: number = 10
    ): Promise<OpenLibraryBook[]> {
        try {
            const response = await this.client.get('/search.json', {
                params: {
                    q: query,
                    limit: Math.min(maxResults, 100), // Open Library allows up to 100
                    fields: 'key,title,subtitle,author_name,isbn,publish_year,subject,language,cover_i,first_publish_year,edition_count',
                },
            });

            return this.formatBooks(response.data);
        } catch (error: any) {
            console.error('Open Library API Error:', error.response?.data || error.message);
            throw new Error(`Failed to fetch Open Library books: ${error.message}`);
        }
    }

    /**
     * Search for books by topic/category
     */
    async searchByTopic(
        topic: string,
        maxResults: number = 10
    ): Promise<OpenLibraryBook[]> {
        // Map common topics to relevant search queries
        const topicQueries: Record<string, string[]> = {
            'javascript': ['javascript programming', 'javascript book', 'web development javascript'],
            'react': ['react programming', 'react.js', 'react development'],
            'python': ['python programming', 'python book', 'learn python'],
            'web-development': ['web development', 'html css javascript', 'frontend development'],
            'machine-learning': ['machine learning', 'artificial intelligence', 'neural networks'],
            'data-science': ['data science', 'statistics', 'data analysis'],
            'frontend': ['frontend development', 'web design', 'user interface'],
            'backend': ['backend development', 'server programming', 'api development'],
            'programming': ['programming', 'computer science', 'software engineering'],
            'cloud': ['cloud computing', 'aws', 'azure'],
        };

        const queries = topicQueries[topic.toLowerCase()] || [topic];
        const allBooks: OpenLibraryBook[] = [];

        // Search with multiple queries and combine results
        for (const query of queries.slice(0, 2)) {
            try {
                const books = await this.searchBooks(query, Math.ceil(maxResults / queries.length));
                allBooks.push(...books);
            } catch (error) {
                console.error(`Error searching for "${query}":`, error);
            }
        }

        // Remove duplicates and limit results
        const uniqueBooks = Array.from(
            new Map(allBooks.map(b => [b.id, b])).values()
        ).slice(0, maxResults);

        return uniqueBooks;
    }

    /**
     * Get book details by ID
     */
    async getBookById(bookId: string): Promise<OpenLibraryBook | null> {
        try {
            // Remove /books/ prefix if present
            const cleanId = bookId.replace(/^\/books\//, '').replace(/^books\//, '');
            const response = await this.client.get(`/books/${cleanId}.json`);

            const book = response.data;
            return {
                id: book.key || bookId,
                title: book.title || 'Untitled Book',
                description: book.description 
                    ? (typeof book.description === 'string' ? book.description : book.description.value || '')
                    : '',
                url: `${this.baseUrl}${book.key || `/books/${cleanId}`}`,
                thumbnail: book.covers && book.covers[0] 
                    ? `https://covers.openlibrary.org/b/id/${book.covers[0]}-L.jpg`
                    : undefined,
                authors: book.authors?.map((a: any) => a.name || a.key) || [],
                isbn: book.isbn_13?.[0] || book.isbn_10?.[0],
                publishYear: book.publish_date || book.first_publish_year,
                subjects: book.subjects || [],
                language: book.languages?.[0],
            };
        } catch (error: any) {
            console.error('Open Library API Error:', error.message);
            return null;
        }
    }

    /**
     * Format Open Library API response to our book format
     */
    private formatBooks(data: OpenLibrarySearchResponse): OpenLibraryBook[] {
        if (!data || !data.docs || !Array.isArray(data.docs)) {
            return [];
        }

        return data.docs.map((doc) => {
            // Build book URL
            const bookKey = doc.key || '';
            const bookUrl = bookKey.startsWith('http') 
                ? bookKey 
                : `${this.baseUrl}${bookKey.startsWith('/') ? bookKey : `/${bookKey}`}`;

            // Build cover image URL
            const thumbnail = doc.cover_i 
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
                : undefined;

            // Get publish year
            const publishYear = doc.first_publish_year 
                || (doc.publish_year && doc.publish_year.length > 0 ? doc.publish_year[0] : undefined);

            return {
                id: bookKey.replace('/works/', '').replace('/books/', '') || `ol-${Math.random().toString(36).substr(2, 9)}`,
                title: doc.title || 'Untitled Book',
                description: doc.subtitle 
                    ? `${doc.title || ''}: ${doc.subtitle}`
                    : `Book by ${doc.author_name?.join(', ') || 'Unknown Author'}`,
                url: bookUrl,
                thumbnail: thumbnail,
                authors: doc.author_name || [],
                isbn: doc.isbn && doc.isbn.length > 0 ? doc.isbn[0] : undefined,
                publishYear: publishYear,
                subjects: doc.subject || [],
                language: doc.language && doc.language.length > 0 ? doc.language[0] : undefined,
            };
        });
    }

    /**
     * Check if service is configured (always true for Open Library as it's public)
     */
    isConfigured(): boolean {
        return true; // Open Library API is public, no API key needed for basic queries
    }
}
