# Semantic Search Setup Guide

## Quick Start

### 1. Start the Embedding Service

```bash
cd embedding-service
docker-compose up --build
```

The service will be available at `http://localhost:8000`

### 2. Verify the Service

```bash
curl http://localhost:8000/health
```

You should see:
```json
{
  "status": "healthy",
  "service": "SBERT Embedding Service",
  "model": "all-MiniLM-L6-v2"
}
```

### 3. Configure Backend

Add to your `.env` file:
```
EMBEDDING_SERVICE_URL=http://localhost:8000
```

### 4. Test Semantic Matching

1. Go to CV Analyzer in the dashboard
2. Upload a CV (PDF)
3. Provide a Job Description (text or file)
4. Click "Semantic Match" button
5. View the detailed match results

## Troubleshooting

### Embedding Service Not Available

If you see "Embedding service is not available":
- Check if the service is running: `docker ps`
- Check logs: `docker-compose logs embedding-service`
- Verify port 8000 is not in use

### Model Download

The first time you run the service, it will download the SBERT model (~80MB). This may take a few minutes.

### Performance

- First request may be slower (model loading)
- Batch processing is optimized for multiple texts
- Typical response time: 2-5 seconds for a full match

## Development

### Run Embedding Service Locally (without Docker)

```bash
cd embedding-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Change Model

Edit `embedding-service/app/services/sbert_service.py`:
```python
def __init__(self, model_name: str = "all-mpnet-base-v2"):  # Better quality
```

Available models:
- `all-MiniLM-L6-v2` (384 dim, fast) - Default
- `all-mpnet-base-v2` (768 dim, better quality)
- `paraphrase-multilingual-MiniLM-L12-v2` (multilingual)

## API Endpoints

### Health Check
```
GET http://localhost:8000/health
```

### Single Embedding
```
POST http://localhost:8000/embed
Body: { "text": "Your text here" }
```

### Batch Embeddings
```
POST http://localhost:8000/embed/batch
Body: { "texts": ["Text 1", "Text 2"] }
```

## Architecture

- **Embedding Service**: Python FastAPI service running SBERT models
- **Backend**: Node.js/Express calling embedding service
- **Frontend**: React components displaying match results
- **Database**: MongoDB storing match results
