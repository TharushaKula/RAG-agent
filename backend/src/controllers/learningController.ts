import { Request, Response } from "express";

export const getLearningResources = async (req: Request, res: Response) => {
    try {
        // Mock data simulating aggregated results from multiple platforms
        const resources = {
            visual: [
                {
                    id: "v1",
                    title: "Machine Learning Utility - Visual Guide",
                    platform: "YouTube",
                    url: "https://www.youtube.com/watch?v=Gv9_4yMHFhI",
                    thumbnail: "https://img.youtube.com/vi/Gv9_4yMHFhI/maxresdefault.jpg",
                    channel: "Google Cloud Tech",
                    duration: "10:15"
                },
                {
                    id: "v2",
                    title: "React JS Crash Course 2024",
                    platform: "YouTube",
                    url: "https://www.youtube.com/watch?v=w7ejDZ8SWv8",
                    thumbnail: "https://img.youtube.com/vi/w7ejDZ8SWv8/maxresdefault.jpg",
                    channel: "Traversy Media",
                    duration: "1:53:00"
                },
                {
                    id: "v3",
                    title: "Neural Networks from Scratch",
                    platform: "Coursera",
                    url: "https://www.coursera.org",
                    thumbnail: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=600&h=400&fit=crop",
                    description: "Learn how to build neural networks from the ground up."
                }
            ],
            auditory: [
                {
                    id: "a1",
                    title: "The CS50 Podcast",
                    platform: "Spotify",
                    url: "https://open.spotify.com/show/6Rl2Yp303kXWvK8FhI2",
                    thumbnail: "https://images.unsplash.com/photo-1478737270239-2f02b77ac6d5?w=600&h=400&fit=crop",
                    description: "Audio lectures from Harvard's CS50."
                },
                {
                    id: "a2",
                    title: "Software Engineering Radio",
                    platform: "Apple Podcasts",
                    url: "https://www.se-radio.net/",
                    thumbnail: "https://images.unsplash.com/photo-1593697821252-0c9137d9fc45?w=600&h=400&fit=crop",
                    description: "The podcast for professional software developers."
                },
                {
                    id: "a3",
                    title: "Talk Python To Me",
                    platform: "Podcast",
                    url: "https://talkpython.fm/",
                    thumbnail: "https://images.unsplash.com/photo-1589254065878-42c9da997008?w=600&h=400&fit=crop",
                    description: "A podcast on Python and related technologies."
                }
            ],
            reading: [
                {
                    id: "r1",
                    title: "React Documentation",
                    platform: "Official Docs",
                    url: "https://react.dev",
                    thumbnail: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&h=400&fit=crop",
                    description: "The official documentation for React."
                },
                {
                    id: "r2",
                    title: "You Don't Know JS",
                    platform: "GitHub",
                    url: "https://github.com/getify/You-Dont-Know-JS",
                    thumbnail: "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=600&h=400&fit=crop",
                    description: "Deep dive into the core mechanisms of JavaScript."
                },
                {
                    id: "r3",
                    title: "System Design Primer",
                    platform: "GitHub",
                    url: "https://github.com/donnemartin/system-design-primer",
                    thumbnail: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=400&fit=crop",
                    description: "Learn how to design large-scale systems."
                }
            ],
            kinesthetic: [
                {
                    id: "k1",
                    title: "Full Stack Open",
                    platform: "MOOC.fi",
                    url: "https://fullstackopen.com/en/",
                    thumbnail: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&h=400&fit=crop",
                    description: "Deep dive into modern web development with hands-on exercises."
                },
                {
                    id: "k2",
                    title: "Codewars Challenges",
                    platform: "Codewars",
                    url: "https://www.codewars.com/",
                    thumbnail: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=600&h=400&fit=crop",
                    description: "Achieve mastery through challenge."
                },
                {
                    id: "k3",
                    title: "LeetCode Daily Challenge",
                    platform: "LeetCode",
                    url: "https://leetcode.com/",
                    thumbnail: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&h=400&fit=crop",
                    description: "Practice coding problems daily."
                }
            ]
        };

        res.json({ success: true, data: resources });
    } catch (error) {
        console.error("Error fetching learning resources:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};
