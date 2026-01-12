import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";

// Load .env from the backend root
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function setupIndex() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is missing in the backend/.env file');

    console.log("Connecting to MongoDB...");
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("rag-agent");
        const collection = db.collection("documents");

        console.log("Defining Atlas Vector Search index configuration...");

        const indexDefinition = {
            name: "default",
            type: "vectorSearch",
            definition: {
                fields: [
                    {
                        type: "vector",
                        path: "embedding",
                        numDimensions: 768, // standard for nomic-embed-text
                        similarity: "cosine"
                    },
                    {
                        type: "filter",
                        path: "metadata.userId"
                    },
                    {
                        type: "filter",
                        path: "metadata.source"
                    },
                    {
                        type: "filter",
                        path: "metadata.type"
                    }
                ]
            }
        };

        console.log("Checking for existing search indexes...");
        const existingIndexes = await collection.listSearchIndexes().toArray();
        const existingIndex = existingIndexes.find(idx => idx.name === "default");

        if (existingIndex) {
            console.log("Index 'default' exists. Updating definition...");
            await (collection as any).updateSearchIndex("default", indexDefinition.definition);
            console.log("\x1b[32m%s\x1b[0m", "✅ Index update request submitted successfully!");
        } else {
            console.log("Creating new Atlas Vector Search index 'default'...");
            await (collection as any).createSearchIndex(indexDefinition);
            console.log("\x1b[32m%s\x1b[0m", "✅ Index creation request submitted successfully!");
        }

        console.log("Note: It may take 1-3 minutes for MongoDB Atlas to rebuild the index.");
        console.log("You can check the status in the MongoDB Atlas UI under Search -> Local Index.");

    } catch (err: any) {
        if (err.message.includes("updateSearchIndex") || err.message.includes("helper")) {
            console.log("\x1b[33m%s\x1b[0m", "⚠️ Driver helper failed. please manually add the userId filter in Atlas UI.");
            console.log(JSON.stringify({ type: "filter", path: "userId" }, null, 2));
        }
        throw err;
    } finally {
        await client.close();
        console.log("Disconnected from MongoDB.");
    }
}

setupIndex();
