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

from .config import settings
from .database import close_database, connect_database
from .routers.invoices import router as invoices_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_database()
    yield
    await close_database()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(invoices_router, prefix=settings.api_prefix)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
