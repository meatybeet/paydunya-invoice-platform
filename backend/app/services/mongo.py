"""Run the development MongoDB container when the app uses localhost."""

import shutil
import subprocess
from pathlib import Path

from ..config import settings


PROJECT_ROOT = Path(__file__).resolve().parents[3]
LOCAL_MONGO_URLS = {"mongodb://localhost:27017", "mongodb://127.0.0.1:27017"}


def start_development_mongo() -> None:
    """Ensure Docker's local MongoDB service is ready before the API starts."""
    if settings.mongodb_url not in LOCAL_MONGO_URLS:
        return

    docker = shutil.which("docker")
    if docker is None:
        print("Docker was not found; using any MongoDB already available at localhost:27017.")
        return

    command = [
        docker,
        "compose",
        "-f",
        "docker-compose.yml",
        "up",
        "-d",
        "--wait",
        "mongo",
    ]
    result = subprocess.run(command, cwd=PROJECT_ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Could not start the MongoDB Docker service: {details}")
    print("MongoDB Docker service is ready at mongodb://localhost:27017.")
