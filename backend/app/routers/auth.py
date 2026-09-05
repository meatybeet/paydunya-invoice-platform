from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..database import get_database
from ..schemas import LoginRequest, TokenResponse, UserCreate, UserResponse
from ..services.auth import create_access_token, hash_password, read_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer(auto_error=False)


def serialize_user(document: dict) -> UserResponse:
    return UserResponse(
        id=str(document["_id"]), email=document["email"], name=document["name"],
        role=document["role"], created_at=document["created_at"],
    )


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in is required")
    user_id = read_access_token(credentials.credentials)
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=401, detail="Invalid or expired access token")
    user = await get_database().users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


async def super_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access is required")
    return user


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest) -> TokenResponse:
    user = await get_database().users.find_one({"email": payload.email.lower()})
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return TokenResponse(access_token=create_access_token(str(user["_id"])), user=serialize_user(user))


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(current_user)) -> UserResponse:
    return serialize_user(user)


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, _: dict = Depends(super_admin)) -> UserResponse:
    database = get_database()
    if await database.users.find_one({"email": payload.email.lower()}):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    document = {
        "email": payload.email.lower(), "name": payload.name, "role": payload.role.value,
        "password_hash": hash_password(payload.password), "created_at": datetime.utcnow(),
    }
    result = await database.users.insert_one(document)
    document["_id"] = result.inserted_id
    return serialize_user(document)


@router.get("/users", response_model=list[UserResponse])
async def list_users(_: dict = Depends(super_admin)) -> list[UserResponse]:
    users = await get_database().users.find().sort("created_at", -1).to_list(length=500)
    return [serialize_user(user) for user in users]
