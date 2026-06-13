from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.security import verify_admin, create_admin_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    if not verify_admin(req.username, req.password):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid username or password"
        )
    return TokenResponse(access_token=create_admin_token(req.username))
