import os
from pathlib import Path
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load .env from root directory
load_dotenv(dotenv_path=BASE_DIR / ".env")

class Settings:
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    DB_NAME: str = "rag-agent"
    COLLECTION_NAME: str = "documents"
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    GITHUB_TOKEN: str | None = os.getenv("GITHUB_TOKEN")

settings = Settings()
