from pydantic_settings import BaseSettings, SettingsConfigDict


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
    paydunya_return_url: str = "http://localhost:8000/payment/success"
    paydunya_cancel_url: str = "http://localhost:8000/payment/cancel"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
