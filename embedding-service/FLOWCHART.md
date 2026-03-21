# Embedding Service — Flow

```mermaid
flowchart TB
    subgraph Client
        A[HTTP Request]
    end

    subgraph FastAPI["embedding-service (FastAPI)"]
        B{Endpoint?}
        C[GET /health]
        D[POST /embed]
        E[POST /embed/batch]
    end

    subgraph Health
        C --> F[Return status + model name]
    end

    subgraph Single["Single embed"]
        D --> G[Validate text]
        G --> H[SBERTService.embed]
        H --> I[SentenceTransformer.encode]
        I --> J[Normalize vector]
        J --> K[Return embedding + dimensions]
    end

    subgraph Batch["Batch embed"]
        E --> L[Validate texts]
        L --> M[SBERTService.embed_batch]
        M --> N[SentenceTransformer.encode batch]
        N --> O[Normalize vectors]
        O --> P[Return embeddings + dimensions]
    end

    A --> B
    B --> C
    B --> D
    B --> E
```

## Simplified flow

```mermaid
flowchart LR
    subgraph In
        T[Text / Texts]
    end
    subgraph Service["embedding-service"]
        API[FastAPI]
        SBERT[SBERT model]
        API --> SBERT
    end
    subgraph Out
        V[Embedding vectors]
    end
    T --> API
    SBERT --> V
```

- **Single:** `POST /embed` → one text → one vector (e.g. 768 dims).  
- **Batch:** `POST /embed/batch` → list of texts → list of vectors.  
- **Health:** `GET /health` → status and model name (no ML).
