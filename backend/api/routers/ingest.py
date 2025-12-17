from fastapi import APIRouter, UploadFile, File, Form, Body, HTTPException
from pydantic import BaseModel
from typing import Optional
import pypdf
import io
from backend.services.github_service import scrape_github_profile, ingest_github_repo
from backend.services.ingest_service import ingest_text

router = APIRouter()

class IngestRequest(BaseModel):
    text: str
    source: Optional[str] = "user-paste"

@router.post("/text")
async def ingest_text_route(request: IngestRequest):
    try:
        text = request.text
        source = request.source
        
        # Check GitHub
        if text.startswith("https://github.com/"):
            # Simple heuristic: if url has 4 parts (https, github.com, user, repo) it's a repo
            # Profiles have 3 parts (https, github.com, user)
            is_profile = "/tree/" not in text and "/blob/" not in text and len(text.rstrip("/").split("/")) == 4
            if is_profile:
                # Actually profiles are usually 3 parts: github.com/username
                # But let's check properly: ["https:", "", "github.com", "username"] -> len 4
                # ["https:", "", "github.com", "username", "repo"] -> len 5
                parts = text.rstrip("/").split("/")
                if len(parts) == 4:
                    await scrape_github_profile(text)
                    return {"success": True, "message": "Profile ingested"}
                else:
                    count = await ingest_github_repo(text)
                    return {"success": True, "chunks": count}
        
        # Normal Text
        count = await ingest_text(text, source)
        return {"success": True, "chunks": count}

    except Exception as e:
        print(f"Ingest Text Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/file")
async def ingest_file_route(file: UploadFile = File(...)):
    try:
        content = await file.read()
        source = file.filename
        
        text_content = ""
        if file.content_type == "application/pdf":
            pdf = pypdf.PdfReader(io.BytesIO(content))
            for page in pdf.pages:
                text_content += page.extract_text() or ""
        else:
            text_content = content.decode("utf-8")
        
        count = await ingest_text(text_content, source)
        return {"success": True, "chunks": count}

    except Exception as e:
        print(f"Ingest File Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
