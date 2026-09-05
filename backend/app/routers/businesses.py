import re
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..database import get_database
from ..schemas import (
    BusinessCreate, BusinessResponse, BusinessUpdate, CategoryCreate, CategoryResponse,
    ProductCreate, ProductResponse, ProductUpdate,
)
from .auth import current_user

router = APIRouter(prefix="/businesses", tags=["businesses"])


def serialize_business(document: dict) -> BusinessResponse:
    return BusinessResponse(id=str(document["_id"]), name=document["name"], slug=document["slug"],
        description=document.get("description"), visibility=document["visibility"],
        owner_id=str(document["owner_id"]), member_ids=[str(item) for item in document.get("member_ids", [])],
        created_at=document["created_at"], updated_at=document["updated_at"])


def serialize_product(document: dict) -> ProductResponse:
    return ProductResponse(id=str(document["_id"]), business_id=str(document["business_id"]), name=document["name"],
        description=document.get("description"), category_id=str(document["category_id"]) if document.get("category_id") else None,
        price=document["price"], quantity=document.get("quantity"), created_at=document["created_at"], updated_at=document["updated_at"])


async def get_business_or_404(business_id: str) -> dict:
    if not ObjectId.is_valid(business_id):
        raise HTTPException(status_code=404, detail="Business not found")
    business = await get_database().businesses.find_one({"_id": ObjectId(business_id)})
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    return business


def can_manage(business: dict, user: dict) -> bool:
    return user["role"] == "super_admin" or user["_id"] == business["owner_id"] or user["_id"] in business.get("member_ids", [])


async def require_manager(business_id: str, user: dict) -> dict:
    business = await get_business_or_404(business_id)
    if not can_manage(business, user):
        raise HTTPException(status_code=403, detail="You do not have access to this business")
    return business


@router.post("", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
async def create_business(payload: BusinessCreate, user: dict = Depends(current_user)) -> BusinessResponse:
    database = get_database()
    now = datetime.utcnow()
    base_slug = re.sub(r"[^a-z0-9]+", "-", payload.name.lower()).strip("-") or "business"
    slug = base_slug
    suffix = 2
    while await database.businesses.find_one({"slug": slug}):
        slug = f"{base_slug}-{suffix}"; suffix += 1
    member_ids = [ObjectId(item) for item in payload.member_ids if ObjectId.is_valid(item)]
    document = {"name": payload.name, "slug": slug, "description": payload.description,
        "visibility": payload.visibility.value, "owner_id": user["_id"], "member_ids": member_ids,
        "created_at": now, "updated_at": now}
    result = await database.businesses.insert_one(document); document["_id"] = result.inserted_id
    return serialize_business(document)


@router.get("", response_model=list[BusinessResponse])
async def list_businesses(user: dict = Depends(current_user)) -> list[BusinessResponse]:
    query = {} if user["role"] == "super_admin" else {"$or": [{"owner_id": user["_id"]}, {"member_ids": user["_id"]}]}
    rows = await get_database().businesses.find(query).sort("created_at", -1).to_list(length=500)
    return [serialize_business(row) for row in rows]


@router.get("/{business_id}", response_model=BusinessResponse)
async def get_business(business_id: str, user: dict = Depends(current_user)) -> BusinessResponse:
    business = await require_manager(business_id, user); return serialize_business(business)


@router.patch("/{business_id}", response_model=BusinessResponse)
async def update_business(business_id: str, payload: BusinessUpdate, user: dict = Depends(current_user)) -> BusinessResponse:
    business = await require_manager(business_id, user)
    if payload.member_ids is not None and user["role"] != "super_admin" and user["_id"] != business["owner_id"]:
        raise HTTPException(status_code=403, detail="Only the owner can manage members")
    changes = payload.model_dump(exclude_unset=True)
    if "visibility" in changes: changes["visibility"] = changes["visibility"].value
    if "member_ids" in changes: changes["member_ids"] = [ObjectId(item) for item in changes["member_ids"] if ObjectId.is_valid(item)]
    changes["updated_at"] = datetime.utcnow()
    await get_database().businesses.update_one({"_id": business["_id"]}, {"$set": changes})
    return serialize_business(await get_business_or_404(business_id))


@router.delete("/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_business(business_id: str, user: dict = Depends(current_user)) -> Response:
    business = await require_manager(business_id, user)
    if user["role"] != "super_admin" and user["_id"] != business["owner_id"]:
        raise HTTPException(status_code=403, detail="Only the owner can delete a business")
    database = get_database(); await database.businesses.delete_one({"_id": business["_id"]})
    await database.products.delete_many({"business_id": business["_id"]}); await database.categories.delete_many({"business_id": business["_id"]})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{business_id}/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(business_id: str, payload: CategoryCreate, user: dict = Depends(current_user)) -> CategoryResponse:
    business = await require_manager(business_id, user); document = {"business_id": business["_id"], "name": payload.name}
    result = await get_database().categories.insert_one(document); return CategoryResponse(id=str(result.inserted_id), business_id=business_id, name=payload.name)


@router.get("/{business_id}/categories", response_model=list[CategoryResponse])
async def list_categories(business_id: str, user: dict = Depends(current_user)) -> list[CategoryResponse]:
    business = await require_manager(business_id, user); rows = await get_database().categories.find({"business_id": business["_id"]}).sort("name", 1).to_list(length=500)
    return [CategoryResponse(id=str(row["_id"]), business_id=business_id, name=row["name"]) for row in rows]


@router.post("/{business_id}/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(business_id: str, payload: ProductCreate, user: dict = Depends(current_user)) -> ProductResponse:
    business = await require_manager(business_id, user); now = datetime.utcnow()
    if payload.category_id and not ObjectId.is_valid(payload.category_id): raise HTTPException(status_code=422, detail="Invalid category ID")
    document = {**payload.model_dump(), "business_id": business["_id"], "category_id": ObjectId(payload.category_id) if payload.category_id else None, "created_at": now, "updated_at": now}
    result = await get_database().products.insert_one(document); document["_id"] = result.inserted_id
    return serialize_product(document)


@router.get("/{business_id}/products", response_model=list[ProductResponse])
async def list_products(business_id: str, user: dict = Depends(current_user)) -> list[ProductResponse]:
    business = await require_manager(business_id, user); rows = await get_database().products.find({"business_id": business["_id"]}).sort("created_at", -1).to_list(length=1000)
    return [serialize_product(row) for row in rows]


@router.patch("/{business_id}/products/{product_id}", response_model=ProductResponse)
async def update_product(business_id: str, product_id: str, payload: ProductUpdate, user: dict = Depends(current_user)) -> ProductResponse:
    business = await require_manager(business_id, user)
    if not ObjectId.is_valid(product_id): raise HTTPException(status_code=404, detail="Product not found")
    changes = payload.model_dump(exclude_unset=True)
    if "category_id" in changes: changes["category_id"] = ObjectId(changes["category_id"]) if changes["category_id"] else None
    changes["updated_at"] = datetime.utcnow(); database = get_database()
    result = await database.products.update_one({"_id": ObjectId(product_id), "business_id": business["_id"]}, {"$set": changes})
    if not result.matched_count: raise HTTPException(status_code=404, detail="Product not found")
    return serialize_product(await database.products.find_one({"_id": ObjectId(product_id)}))


@router.delete("/{business_id}/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(business_id: str, product_id: str, user: dict = Depends(current_user)) -> Response:
    business = await require_manager(business_id, user)
    if not ObjectId.is_valid(product_id): raise HTTPException(status_code=404, detail="Product not found")
    result = await get_database().products.delete_one({"_id": ObjectId(product_id), "business_id": business["_id"]})
    if not result.deleted_count: raise HTTPException(status_code=404, detail="Product not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
