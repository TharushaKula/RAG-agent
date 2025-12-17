from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from backend.api.routers import ingest, chat
from backend.core.database import verify_db_connection

app = FastAPI(title="RAG Agent API")

# CORS (Allow Frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(ingest.router, prefix="/api/ingest", tags=["Ingest"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])

@app.on_event("startup")
async def startup_event():
    await verify_db_connection()

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/")
async def root():
    return RedirectResponse(url="/docs")
