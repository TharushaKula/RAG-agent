# SBERT Embedding Service

FastAPI service for generating semantic embeddings using Sentence-BERT models.

## Quick Start

### Using Docker (Recommended)

```bash
# Stop any running containers
docker-compose down

# Rebuild with updated dependencies
docker-compose up --build
```

The service will be available at `http://localhost:8000`

**Note:** The first time you run this, it will download the SBERT model (~80MB), which may take a few minutes.

### Manual Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Run the service
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## API Endpoints

### Health Check
```
GET /health
```

### Single Embedding
```
POST /embed
Body: { "text": "Your text here" }
```

### Batch Embeddings
```
POST /embed/batch
Body: { "texts": ["Text 1", "Text 2", ...] }
```

## Model Options

The service uses `all-MiniLM-L6-v2` by default (384 dimensions, fast).

To use a different model, modify `app/services/sbert_service.py`:
- `all-mpnet-base-v2`: Better quality, 768 dimensions, slower
- `paraphrase-multilingual-MiniLM-L12-v2`: Multilingual support

## Troubleshooting

### Dependency Version Issues

If you see `ImportError: cannot import name 'cached_download'`, it means the dependencies need to be updated. Run:

```bash
docker-compose down
docker-compose up --build
```

This will install the latest compatible versions of all dependencies.

### Model Download

On first run, the service downloads the SBERT model. This may take a few minutes depending on your internet connection. The model is cached locally after the first download.
