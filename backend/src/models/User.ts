import { ObjectId } from "mongodb";
import clientPromise from "../config/db";

export interface User {
    _id?: ObjectId;
    name: string;
    email: string;
    passwordHash: string;
    createdAt: Date;
}

export const getUsersCollection = async () => {
    const client = await clientPromise;
    return client.db("rag-agent").collection<User>("users");
};
