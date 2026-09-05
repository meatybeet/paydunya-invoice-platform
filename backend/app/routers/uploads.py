from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

from ..config import resolved_upload_directory, settings
from ..database import get_database
from .auth import current_user

router = APIRouter(prefix="/uploads", tags=["uploads"])

CHUNK_SIZE = 64 * 1024
# Bytes needed to recognise every accepted signature (WebP needs 12).
SIGNATURE_SIZE = 12


def detect_extension(header: bytes) -> str | None:
    """Return the file extension implied by the magic bytes, or None if unsupported."""
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if header.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return ".webp"
    return None


def upload_target(filename: str) -> Path:
    directory = resolved_upload_directory()
    directory.mkdir(parents=True, exist_ok=True)
    return directory / filename


def readable_limit() -> str:
    megabytes = settings.max_upload_bytes / (1024 * 1024)
    return f"{megabytes:.0f}" if megabytes.is_integer() else f"{megabytes:.1f}"


def safe_upload_name(filename: str) -> str:
    """Reject anything that is not a bare filename, before touching the disk."""
    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide.")
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide.")
    if Path(filename).name != filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide.")
    return filename


async def user_can_delete_image(filename: str, user: dict) -> bool:
    """Return whether ``user`` owns an upload or may manage its current use.

    Image names are intentionally public because they appear in public catalogs.
    That must never turn a known filename into permission to delete someone
    else's logo or product photo.
    """
    if user["role"] == "super_admin":
        return True

    database = get_database()
    upload = await database.uploads.find_one({"filename": filename}, {"owner_id": 1})
    if upload is not None and upload.get("owner_id") == user["_id"]:
        return True

    image_url = f"/uploads/{filename}"
    access_query = {"$or": [{"owner_id": user["_id"]}, {"member_ids": user["_id"]}]}

    # A manager can remove an image currently attached to one of their
    # businesses, including legacy uploads that predate upload ownership.
    business = await database.businesses.find_one({"image_url": image_url, **access_query})
    if business is not None:
        return True

    products = await database.products.find(
        {"image_url": image_url}, {"business_id": 1}
    ).to_list(length=100)
    business_ids = [product["business_id"] for product in products if product.get("business_id")]
    if not business_ids:
        return False
    business = await database.businesses.find_one(
        {"_id": {"$in": business_ids}, **access_query}, {"_id": 1}
    )
    return business is not None


@router.post("/image", status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...), user: dict = Depends(current_user)
) -> dict[str, str]:
    header = await file.read(SIGNATURE_SIZE)
    if not header:
        raise HTTPException(status_code=400, detail="Le fichier envoyé est vide.")

    extension = detect_extension(header)
    if extension is None:
        raise HTTPException(
            status_code=415,
            detail="Format d'image non supporté. Utilisez PNG, JPEG ou WebP.",
        )

    filename = f"{uuid4().hex}{extension}"
    destination = upload_target(filename)
    written = 0
    try:
        with destination.open("wb") as stream:
            chunk = header
            while chunk:
                written += len(chunk)
                if written > settings.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "L'image dépasse la taille maximale autorisée de "
                            f"{readable_limit()} Mo."
                        ),
                    )
                stream.write(chunk)
                chunk = await file.read(CHUNK_SIZE)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    try:
        await get_database().uploads.insert_one(
            {"filename": filename, "owner_id": user["_id"], "created_at": datetime.utcnow()}
        )
    except Exception:
        # Do not leave a file that no user has permission to manage when the
        # database write fails after a successful disk write.
        destination.unlink(missing_ok=True)
        raise

    return {"url": f"/uploads/{filename}", "filename": filename}


@router.delete("/image/{filename}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_image(filename: str, user: dict = Depends(current_user)) -> Response:
    safe_name = safe_upload_name(filename)
    if not await user_can_delete_image(safe_name, user):
        # Use 404 so a caller cannot probe which private uploads exist.
        raise HTTPException(status_code=404, detail="Image not found")
    target = upload_target(safe_name)
    target.unlink(missing_ok=True)
    await get_database().uploads.delete_one({"filename": safe_name})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
