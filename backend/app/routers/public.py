from bson import ObjectId
from fastapi import APIRouter, HTTPException

from ..database import get_database
from ..schemas import BusinessResponse, ProductResponse
from .businesses import serialize_business, serialize_product

router = APIRouter(prefix="/public", tags=["public catalog"])


@router.get("/businesses/{slug}", response_model=BusinessResponse)
async def public_business(slug: str) -> BusinessResponse:
    business = await get_database().businesses.find_one({"slug": slug, "visibility": "public"})
    if business is None:
        raise HTTPException(status_code=404, detail="Public business not found")
    return serialize_business(business)


@router.get("/businesses/{slug}/products", response_model=list[ProductResponse])
async def public_products(slug: str) -> list[ProductResponse]:
    business = await get_database().businesses.find_one({"slug": slug, "visibility": "public"})
    if business is None:
        raise HTTPException(status_code=404, detail="Public business not found")
    rows = await get_database().products.find({"business_id": business["_id"]}).sort("created_at", -1).to_list(length=1000)
    return [serialize_product(row) for row in rows]
