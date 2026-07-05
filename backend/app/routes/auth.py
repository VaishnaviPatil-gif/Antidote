"""Hospital-staff authentication endpoints for the web dashboard.

  POST /api/auth/login  — exchange username+password for a bearer token.
  GET  /api/auth/me     — who am I (requires the token).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import authenticate, current_hospital

logger = logging.getLogger("antidote.auth")
router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    hospital_id: str | None
    name: str


class SignupRequest(BaseModel):
    username: str
    password: str
    name: str
    lat: float
    lng: float
    vials: int = 0
    beds: int = 0
    tier: str = "tertiary"
    sector: str = "private"
    icu: bool = True


@router.post("/auth/login", response_model=LoginResponse, tags=["auth"])
def login(req: LoginRequest) -> LoginResponse:
    token = authenticate(req.username, req.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    from ..auth import ACCOUNTS  # local import avoids a cycle at module load

    acct = ACCOUNTS[req.username.strip().lower()]
    logger.info("login: %s", req.username)
    return LoginResponse(token=token, hospital_id=acct["hospital_id"], name=acct["name"])


@router.post("/auth/signup", response_model=LoginResponse, tags=["auth"])
def signup(req: SignupRequest) -> LoginResponse:
    username = req.username.strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    from ..auth import ACCOUNTS, add_account, create_token
    from ..services.hospitals import add_hospital

    if username in ACCOUNTS:
        raise HTTPException(status_code=400, detail="Username already exists")

    hospital_data = {
        "name": req.name,
        "tier": req.tier,
        "lat": req.lat,
        "lng": req.lng,
        "vials": req.vials,
        "icu": req.icu,
        "sector": req.sector,
        "beds": req.beds,
    }
    try:
        add_hospital(username, hospital_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to register hospital details: {e}")

    acct_data = {
        "password": req.password,
        "hospital_id": username,
        "name": req.name,
    }
    try:
        add_account(username, acct_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create account credentials: {e}")

    token = create_token(username)
    logger.info("signup: %s (%s)", username, req.name)
    return LoginResponse(token=token, hospital_id=username, name=req.name)


@router.get("/auth/me", tags=["auth"])
def me(who=Depends(current_hospital)) -> dict:
    return who
