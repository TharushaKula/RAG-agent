from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from backend.core.database import get_vector_store

async def ingest_text(text: str, source: str = "user-paste"):
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    docs = splitter.create_documents([text], metadatas=[{"source": source}])
    
    vector_store = get_vector_store()
    await vector_store.aadd_documents(docs)
    return len(docs)
