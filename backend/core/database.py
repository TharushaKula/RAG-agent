from motor.motor_asyncio import AsyncIOMotorClient
from langchain_mongodb import MongoDBAtlasVectorSearch
from langchain_ollama import OllamaEmbeddings
from backend.core.config import settings

import certifi

# Global Client
client = AsyncIOMotorClient(settings.MONGODB_URI, tlsCAFile=certifi.where())

# Monkey patch for langchain-mongodb compatibility
# (AsyncIOMotorClient doesn't have append_metadata, but LangChain expects it)
def append_metadata(driver_info):
    pass
client.append_metadata = append_metadata

db = client[settings.DB_NAME]
collection = db[settings.COLLECTION_NAME]

# Embeddings
embeddings = OllamaEmbeddings(
    model="nomic-embed-text",
    base_url=settings.OLLAMA_BASE_URL,
)

from pymongo import MongoClient
import certifi

# ... (keep existing imports)

# Sync Client for Vector Search (LangChain internals use threads which break Motor)
sync_client = MongoClient(settings.MONGODB_URI, tlsCAFile=certifi.where())
sync_db = sync_client[settings.DB_NAME]
sync_collection = sync_db[settings.COLLECTION_NAME]

def get_vector_store():
    return MongoDBAtlasVectorSearch(
        collection=sync_collection,
        embedding=embeddings,
        index_name="default",
        text_key="text",
        embedding_key="embedding",
    )

async def verify_db_connection():
    try:
        await client.admin.command('ping')
        print("✅ Connected to MongoDB (Motor)")
    except Exception as e:
        print(f"❌ MongoDB Connection Failed: {e}")
