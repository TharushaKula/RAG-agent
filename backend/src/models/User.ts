import { ObjectId } from "mongodb";
import clientPromise from "../config/db";

export interface User {
    _id?: ObjectId;
    name: string;
    email: string;
    passwordHash: string;
    createdAt: Date;
    onboardingCompleted?: boolean;
    interests?: string[];
    skillLevel?: string;
    goals?: string;
}

export const getUsersCollection = async () => {
    const client = await clientPromise;
    return client.db("rag-agent").collection<User>("users");
};
