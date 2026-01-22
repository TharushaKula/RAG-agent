import { ObjectId } from "mongodb";
import clientPromise from "../config/db";

export interface LearningResource {
    id: string;
    type: "video" | "article" | "course" | "book" | "project" | "quiz" | "podcast";
    title: string;
    url?: string;
    description?: string;
    duration?: string;
    difficulty?: "beginner" | "intermediate" | "advanced";
    completed: boolean;
    completedAt?: Date;
}

export interface RoadmapModule {
    id: string;
    title: string;
    description: string;
    status: "completed" | "in-progress" | "locked" | "available";
    order: number;
    estimatedTime: string; // e.g., "2-3 weeks"
    estimatedHours: number; // Calculated based on user's timeAvailability
    resources: LearningResource[];
    prerequisites?: string[]; // IDs of required modules
    completedAt?: Date;
    startedAt?: Date;
    progress: number; // 0-100
}

export interface RoadmapStage {
    id: string;
    name: string;
    description: string;
    order: number;
    modules: RoadmapModule[];
    prerequisites?: string[]; // IDs of required stages
}

export interface Roadmap {
    _id?: ObjectId;
    userId: ObjectId;
    title: string;
    description: string;
    category: string; // e.g., "frontend", "backend", "fullstack", "data-science"
    source: "profile" | "cv-analysis" | "jd-analysis" | "hybrid" | "manual";
    sourceData?: {
        cvSource?: string;
        jdSource?: string;
        semanticMatchScore?: number;
    };
    stages: RoadmapStage[];
    overallProgress: number;
    estimatedCompletionTime: string; // Based on user's timeAvailability
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
}

export interface UserProgress {
    _id?: ObjectId;
    userId: ObjectId;
    roadmapId: ObjectId;
    moduleId: string;
    resourceId?: string;
    status: "started" | "completed";
    progress: number; // 0-100
    timeSpent: number; // in minutes
    notes?: string;
    completedAt?: Date;
    createdAt: Date;
}

export const getRoadmapsCollection = async () => {
    const client = await clientPromise;
    return client.db("rag-agent").collection<Roadmap>("roadmaps");
};

export const getUserProgressCollection = async () => {
    const client = await clientPromise;
    return client.db("rag-agent").collection<UserProgress>("user-progress");
};
