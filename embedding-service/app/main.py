from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import sys
import os

# Ensure we can import from services
# When running in Docker, the structure is /app/app/ so we need to add /app/app to path
app_dir = os.path.dirname(os.path.abspath(__file__))
if app_dir not in sys.path:
    sys.path.insert(0, app_dir)

from services.sbert_service import SBERTService

app = FastAPI(title="SBERT Embedding Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize SBERT service
sbert_service = SBERTService()

class EmbeddingRequest(BaseModel):
    text: str

class BatchEmbeddingRequest(BaseModel):
    texts: List[str]

class EmbeddingResponse(BaseModel):
    embedding: List[float]
    dimensions: int

class BatchEmbeddingResponse(BaseModel):
    embeddings: List[List[float]]
    dimensions: int

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "SBERT Embedding Service",
        "model": sbert_service.model_name
    }

@app.post("/embed", response_model=EmbeddingResponse)
async def embed_text(request: EmbeddingRequest):
    """
    Generate embedding for a single text
    """
    try:
        if not request.text or not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        embedding = sbert_service.embed(request.text)
        return EmbeddingResponse(
            embedding=embedding.tolist(),
            dimensions=len(embedding)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating embedding: {str(e)}")

@app.post("/embed/batch", response_model=BatchEmbeddingResponse)
async def embed_batch(request: BatchEmbeddingRequest):
    """
    Generate embeddings for multiple texts in batch
    """
    try:
        if not request.texts or len(request.texts) == 0:
            raise HTTPException(status_code=400, detail="Texts list cannot be empty")
        
        embeddings = sbert_service.embed_batch(request.texts)
        return BatchEmbeddingResponse(
            embeddings=[emb.tolist() for emb in embeddings],
            dimensions=len(embeddings[0]) if len(embeddings) > 0 else 0
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating embeddings: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
