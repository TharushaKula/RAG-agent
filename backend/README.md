# RAG Agent - Backend Setup

## 1. Prerequisites
- Python 3.10+
- MongoDB Running (or `MONGODB_URI` set in `.env`)
- Ollama Running (`ollama serve`)

## 2. Install Dependencies
```bash
pip install -r backend/requirements.txt
```

## 3. Run the Backend
```bash
uvicorn backend.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
Docs: `http://localhost:8000/docs`

## 4. Environment Variables
Ensure your root `.env` file has:
```bash
MONGODB_URI=...
OLLAMA_BASE_URL=http://127.0.0.1:11434
GITHUB_TOKEN=... (Optional)
```
