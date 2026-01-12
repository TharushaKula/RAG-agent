import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function debugDB() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is missing');

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("rag-agent");
        const collection = db.collection("documents");

        console.log("Connected. Fetching one document...");
        const doc = await collection.findOne({});
        console.log("📝 Sample Document:", JSON.stringify(doc, null, 2));

        console.log("\nFetching distinct sources for user...");
        // Use a known user ID from the logs if possible, or just list all
        const sources = await collection.distinct("metadata.source");
        console.log("📂 distinct metadata.source:", sources);

        const rootSources = await collection.distinct("source");
        console.log("📂 distinct root.source:", rootSources);

        const count = await collection.countDocuments();
        console.log(`\n📊 Total documents in collection: ${count}`);

    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

debugDB();
