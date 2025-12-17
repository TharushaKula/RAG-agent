import asyncio
from backend.core.database import get_vector_store
from langchain_core.documents import Document

async def test():
    try:
        store = get_vector_store()
        doc = Document(page_content="test", metadata={"source": "test"})
        print("Attempting to add document...")
        await store.aadd_documents([doc])
        print("Success")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
