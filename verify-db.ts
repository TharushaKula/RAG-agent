import clientPromise from "@/lib/mongodb";

async function run() {
    try {
        const client = await clientPromise;
        const collection = client.db("rag-agent").collection("documents");

        // 1. Check Data Exists
        const count = await collection.countDocuments();
        console.log(`\n📊 Total Documents in DB: ${count}`);

        if (count === 0) {
            console.log("\n⚠️ Collection is empty. Cannot test search.");
            process.exit(1);
        }

        // 2. Fetch a sample to get a valid vector
        const sample = await collection.findOne({ embedding: { $exists: true } });

        if (!sample) {
            console.log("\n⚠️ No documents with embeddings found!");
            process.exit(1);
        }

        console.log(`\n✅ Found sample doc with embedding dimensions: ${sample.embedding.length}`);

        // 3. Test Raw Vector Search (Bypassing LangChain)
        console.log("\n🧪 Testing Raw Atlas Vector Search for index 'default'...");

        const pipeline = [
            {
                $vectorSearch: {
                    index: "default", // The name we are testing
                    path: "embedding",
                    queryVector: sample.embedding, // Search for itself
                    numCandidates: 10,
                    limit: 1
                }
            },
            {
                $project: { text: 1, score: { $meta: "vectorSearchScore" } }
            }
        ];

        const results = await collection.aggregate(pipeline).toArray();

        if (results.length > 0) {
            console.log("\n✅ SUCCESS: Vector Search returned results!");
            console.log(results);
        } else {
            console.log("\n❌ FAILURE: Vector Search returned 0 documents.");
            console.log("   - Verify Index Name is EXACTLY 'default'");
            console.log("   - Verify Database is 'rag-agent'");
            console.log("   - Verify Collection is 'documents'");
            console.log("   - Check Atlas UI for Index Status (Active?)");
        }

    } catch (e: any) {
        console.error("\n❌ Script Error:", e.message);
        if (e.message.includes("Stage must be one of these")) { // Common error if not on Atlas or wrong version
            console.error("   (This error suggests $vectorSearch is not recognized. Are you connected to Atlas?)");
        }
    }
    process.exit(0);
}

run();
