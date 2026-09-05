from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIRECTORY = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    app_name: str = "PayDunya Invoice Platform"
    api_prefix: str = "/api"

    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "paydunya_invoice_platform"

    paydunya_mode: str = "test"
    paydunya_master_key: str = ""
    paydunya_private_key: str = ""
    paydunya_token: str = ""
    paydunya_store_name: str = "Invoice Store"
    paydunya_callback_url: str = "http://localhost:8000/api/payments/callback"
    paydunya_return_url: str = "http://localhost:8000/api/payments/success"
    paydunya_cancel_url: str = "http://localhost:8000/api/payments/cancel"

    auth_secret: str = "change-this-before-production"
    super_admin_email: str = ""
    super_admin_password: str = ""

    # Public base URL of the frontend, used to build permanent invoice links.
    # main.py serves the frontend directory from the API origin, so the default
    # points at the API itself and not at a separate static file server.
    frontend_url: str = "http://localhost:8000"
    # Comma-separated browser origins allowed only when the frontend is hosted
    # separately from the API. The normal deployment serves both from the same
    # origin, so this deliberately defaults to no cross-origin access.
    cors_origins: str = ""
    # Directory holding uploaded images, resolved relative to the backend directory.
    upload_dir: str = "uploads"
    max_upload_bytes: int = 2 * 1024 * 1024

    # Outgoing mail. Leave empty to disable invoice emails.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIRECTORY / ".env", env_file_encoding="utf-8"
    )


settings = Settings()


# The repository can also be opened with Python's simple static server while
# developing the frontend. These are loopback-only browser origins, not public
# sites. Production remains same-origin unless CORS_ORIGINS is set explicitly.
LOCAL_DEVELOPMENT_CORS_ORIGINS = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://[::1]:5500",
]


def configured_cors_origins() -> list[str]:
    """Return clean, explicit CORS origins from ``CORS_ORIGINS``.

    Empty entries and a trailing slash are harmless in an environment file but
    must not reach Starlette's exact-origin comparison.
    """
    configured = [
        origin.strip().rstrip("/")
        for origin in settings.cors_origins.split(",")
        if origin.strip()
    ]
    return configured or LOCAL_DEVELOPMENT_CORS_ORIGINS


def resolved_upload_directory() -> Path:
    """Absolute upload directory, always resolved against the backend directory."""
    directory = Path(settings.upload_dir)
    if not directory.is_absolute():
        directory = BACKEND_DIRECTORY / directory
    return directory
