from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from backend.services.auth_service import get_current_user
from backend.models.user import User
from backend.models.ingest import IngestRequest
from backend.services.ingest_service import ingest_text, ingest_github_repo, scrape_github_profile
import io
import pypdf

router = APIRouter()

@router.post("/text")
async def ingest_text_route(
    request: IngestRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        text = request.text
        source = request.source
        user_id = current_user.id
        
        # Check GitHub
        if text.startswith("https://github.com/"):
             # Just pass user_id to ingest_github_repo
             
            # Simple heuristic
            is_profile = "/tree/" not in text and "/blob/" not in text and len(text.rstrip("/").split("/")) == 4
            if is_profile:
                 # Profile scraping doesn't strictly need user isolation yet, or we can add it later
                 await scrape_github_profile(text) 
                 return {"success": True, "message": "Profile ingested"}
            else:
                 count = await ingest_github_repo(text, user_id=user_id)
                 return {"success": True, "chunks": count}
        
        # Normal Text
        count = await ingest_text(text, source, user_id=user_id)
        return {"success": True, "chunks": count}

    except Exception as e:
        print(f"Ingest Text Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/file")
async def ingest_file_route(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    try:
        content = await file.read()
        source = file.filename
        user_id = current_user.id
        
        text_content = ""
        if file.content_type == "application/pdf":
            pdf = pypdf.PdfReader(io.BytesIO(content))
            for page in pdf.pages:
                text_content += page.extract_text() or ""
        else:
            text_content = content.decode("utf-8")
        
        count = await ingest_text(text_content, source, user_id=user_id)
        return {"success": True, "chunks": count}

    except Exception as e:
        print(f"Ingest File Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
