from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import json
import base64
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_ollama import ChatOllama
from backend.services.auth_service import get_current_user
from backend.models.user import User
from backend.models.chat import ChatRequest
from backend.core.database import get_vector_store
from backend.core.config import settings
from fastapi import Depends

router = APIRouter()

@router.post("")
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user)
):
    try:
        if not request.messages:
            return {"error": "No messages"}
        
        question = request.messages[-1].content
        user_id = current_user.id
        
        # 1. Retrieve (Filter by user_id)
        vector_store = get_vector_store()
        retriever = vector_store.as_retriever(
            search_kwargs={
                "k": 3,
                "pre_filter": {"user_id": {"$eq": user_id}}
            }
        )
        docs = await retriever.ainvoke(question)
        
        # 2. Format Context
        context_text = "\n\n".join([d.page_content for d in docs])
        
        # 3. Headers (Sources)
        sources = [{"source": d.metadata.get("source", "unknown")} for d in docs]
        encoded_sources = base64.b64encode(json.dumps(sources).encode("utf-8")).decode("utf-8")
        
        # 4. LLM & Chain
        llm = ChatOllama(
            model="gpt-oss:20b-cloud",
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.7
        )
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a helpful assistant. Use the following context to answer the user's question.
If the answer is not in the context, say so.

Context:
{context}"""),
            ("user", "{question}")
        ])
        
        chain = prompt | llm | StrOutputParser()
        
        # 5. Generator
        async def generate():
            async for chunk in chain.astream({"context": context_text, "question": question}):
                yield chunk

        return StreamingResponse(
            generate(),
            media_type="text/plain",
            headers={"X-Sources": encoded_sources}
        )

    except Exception as e:
        print(f"Chat Error: {e}")
        return {"error": str(e)}
