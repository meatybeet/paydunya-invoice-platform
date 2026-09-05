from motor.motor_asyncio import AsyncIOMotorClient

from .config import settings


client: AsyncIOMotorClient | None = None


def get_database():
    if client is None:
        raise RuntimeError("Database client is not connected")
    return client[settings.mongodb_db]


async def connect_database() -> None:
    global client
    client = AsyncIOMotorClient(settings.mongodb_url)


async def close_database() -> None:
    global client
    if client is not None:
        client.close()
        client = None
