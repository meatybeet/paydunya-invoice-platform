"""FastAPI application and direct-development entry point."""

if __name__ == "__main__" and not __package__:
    # Permit `python main.py` from this directory while retaining package imports.
    import subprocess
    import sys
    from pathlib import Path

    app_directory = Path(__file__).resolve().parent
    project_venv_python = app_directory.parent.parent / "venv" / "Scripts" / "python.exe"
    if project_venv_python.is_file() and Path(sys.executable).resolve() != project_venv_python.resolve():
        completed = subprocess.run(
            [str(project_venv_python), str(Path(__file__).resolve()), *sys.argv[1:]],
            check=False,
        )
        raise SystemExit(completed.returncode)

    sys.path.insert(0, str(app_directory.parent))
    __package__ = "app"

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import (
    BACKEND_DIRECTORY,
    configured_cors_origins,
    resolved_upload_directory,
    settings,
)
from .database import close_database, connect_database
from .routers.auth import router as auth_router
from .routers.businesses import router as businesses_router
from .routers.invoices import router as invoices_router
from .routers.payments import router as payments_router
from .routers.public import router as public_router
from .routers.receipts import router as receipts_router
from .routers.uploads import router as uploads_router
from .services.bootstrap import ensure_invoice_public_tokens, ensure_super_admin


UPLOAD_DIRECTORY = resolved_upload_directory()
UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_database()
    await ensure_super_admin()
    await ensure_invoice_public_tokens()
    yield
    await close_database()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
)

app.include_router(invoices_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(businesses_router, prefix=settings.api_prefix)
app.include_router(public_router, prefix=settings.api_prefix)
app.include_router(payments_router, prefix=settings.api_prefix)
app.include_router(uploads_router, prefix=settings.api_prefix)
app.include_router(receipts_router, prefix=settings.api_prefix)

# Uploaded images are served straight from disk. This mount must stay above the
# frontend catch-all mount registered at the bottom of this file.
app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIRECTORY)),
    name="uploads",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# The tunnel must expose the user-facing catalog as well as the API. Keeping
# the frontend on the same origin also means a public visitor never tries to
# call their own localhost for /api. API routes are registered above this
# catch-all static mount, so they retain priority.
FRONTEND_DIRECTORY = BACKEND_DIRECTORY.parent / "frontend"
app.mount(
    "/",
    StaticFiles(directory=str(FRONTEND_DIRECTORY), html=True),
    name="frontend",
)


if __name__ == "__main__":
    import argparse
    import uvicorn
    from .services.mongo import start_development_mongo
    from .services.tunnel import start_cloudflare_tunnel

    parser = argparse.ArgumentParser()
    parser.add_argument("--tunnel", action="store_true", help="Expose localhost through a Cloudflare quick tunnel")
    args = parser.parse_args()
    start_development_mongo()
    def use_tunnel_urls(public_url: str) -> None:
        # The frontend is served from this same origin, so the permanent invoice
        # link and the post-payment redirect must use the tunnel URL as well.
        settings.frontend_url = public_url
        settings.paydunya_callback_url = f"{public_url}{settings.api_prefix}/payments/callback"
        settings.paydunya_return_url = f"{public_url}{settings.api_prefix}/payments/success"
        settings.paydunya_cancel_url = f"{public_url}{settings.api_prefix}/payments/cancel"

    tunnel = start_cloudflare_tunnel(on_url=use_tunnel_urls) if args.tunnel else None
    if args.tunnel and tunnel is None:
        raise SystemExit(1)
    try:
        uvicorn.run(app, host="127.0.0.1", port=8000)
    finally:
        if tunnel is not None:
            tunnel.terminate()
