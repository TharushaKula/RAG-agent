import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const uri = process.env.MONGODB_URI || "";

if (!uri) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const client = new MongoClient(uri);
const clientPromise: Promise<MongoClient> = client.connect();

export const connectDB = async () => {
    try {
        await clientPromise;
        console.log("MongoDB Connected Successfully");
    } catch (err) {
        console.error("MongoDB Connection Failed:", err);
        process.exit(1);
    }
};

export default clientPromise;
