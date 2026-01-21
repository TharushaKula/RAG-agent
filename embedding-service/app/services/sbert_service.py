from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Union
import os

class SBERTService:
    """
    Service for generating embeddings using Sentence-BERT models
    """
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize SBERT service with specified model
        
        Args:
            model_name: Name of the Sentence-BERT model to use
                - "all-MiniLM-L6-v2": Fast, 384 dimensions (recommended)
                - "all-mpnet-base-v2": Better quality, 768 dimensions, slower
        """
        self.model_name = model_name
        print(f"Loading SBERT model: {model_name}...")
        try:
            self.model = SentenceTransformer(model_name)
            print(f"✅ Model loaded successfully. Embedding dimensions: {self.model.get_sentence_embedding_dimension()}")
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            raise
    
    def embed(self, text: str) -> np.ndarray:
        """
        Generate embedding for a single text
        
        Args:
            text: Input text string
            
        Returns:
            numpy array of embeddings
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        embedding = self.model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
        return embedding
    
    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """
        Generate embeddings for multiple texts in batch
        
        Args:
            texts: List of input text strings
            
        Returns:
            List of numpy arrays of embeddings
        """
        if not texts or len(texts) == 0:
            raise ValueError("Texts list cannot be empty")
        
        # Filter out empty texts
        valid_texts = [text for text in texts if text and text.strip()]
        if len(valid_texts) == 0:
            raise ValueError("No valid texts provided")
        
        embeddings = self.model.encode(
            valid_texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            batch_size=32,
            show_progress_bar=False
        )
        
        return [emb for emb in embeddings]
    
    def get_dimensions(self) -> int:
        """
        Get the dimension of embeddings produced by this model
        
        Returns:
            Number of dimensions
        """
        return self.model.get_sentence_embedding_dimension()
