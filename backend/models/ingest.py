from pydantic import BaseModel

class IngestRequest(BaseModel):
    text: str
    source: str = "unknown"
