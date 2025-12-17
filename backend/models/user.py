from pydantic import BaseModel, EmailStr
from typing import Optional

class User(BaseModel):
    id: str  # MongoDB ObjectId as string
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class UserInDB(User):
    hashed_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
