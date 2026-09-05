"""Idempotent seed script for the DIALLO & FILS business.

Run from the backend directory:

    python seed_diallo.py
    python seed_diallo.py --reset

It talks to MongoDB directly with Motor, using the same settings as the API, so
no authentication token is required. Running it twice creates nothing the second
time.
"""

import argparse
import asyncio
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

BACKEND_DIRECTORY = Path(__file__).resolve().parent
if str(BACKEND_DIRECTORY) not in sys.path:
    # Allow `python seed_diallo.py` from anywhere while keeping package imports.
    sys.path.insert(0, str(BACKEND_DIRECTORY))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from pymongo.errors import PyMongoError  # noqa: E402

from app.config import settings  # noqa: E402


BUSINESS_NAME = "DIALLO & FILS"
BUSINESS_SLUG = "diallo-fils"
BUSINESS_DESCRIPTION = (
    "Boutique musulmane à Dakar : parfums et encens, vêtements traditionnels, "
    "Corans et livres, accessoires de prière et produits alimentaires du Hedjaz."
)


def utc_now() -> datetime:
    """Match the app's legacy naive-UTC timestamps without deprecation noise."""
    return datetime.now(UTC).replace(tzinfo=None)

# Category name -> products as (name, price in FCFA, stock quantity, description).
CATALOG: list[tuple[str, list[tuple[str, int, int, str]]]] = [
    (
        "Parfums & Encens",
        [
            ("Musc Al-Haramain 12 ml", 7500, 40,
             "Musc sans alcool au parfum doux et tenace, idéal pour la prière."),
            ("Oud Cambodi 6 ml", 35000, 12,
             "Huile de oud cambodgien pure, boisée et profonde, en flacon roll-on."),
            ("Bakhoor Nabeel", 9000, 25,
             "Bakhoor parfumé à brûler sur charbon pour embaumer la maison."),
            ("Encens Oud naturel 50 g", 12000, 18,
             "Copeaux de bois d'agar naturel à la fumée chaude et boisée."),
            ("Parfum Sultan 100 ml", 18000, 15,
             "Eau de parfum orientale aux notes de rose, d'ambre et de santal."),
        ],
    ),
    (
        "Vêtements",
        [
            ("Qamis émirati blanc", 25000, 30,
             "Qamis émirati en tissu léger et infroissable, coupe droite classique."),
            ("Jellaba marocaine brodée", 32000, 14,
             "Jellaba marocaine en coton avec broderies faites main sur le col."),
            ("Abaya Dubaï", 28000, 20,
             "Abaya fluide de Dubaï en crêpe noir, élégante et confortable."),
            ("Hijab soie de Médine", 6500, 60,
             "Voile en soie de Médine opaque, disponible en plusieurs coloris."),
            ("Bonnet de prière (kufi)", 3500, 80,
             "Bonnet de prière brodé en coton respirant, taille unique."),
        ],
    ),
    (
        "Livres & Coran",
        [
            ("Coran arabe-français (grand format)", 15000, 25,
             "Coran bilingue en grand format avec traduction et translitération."),
            ("Coran de poche", 5000, 50,
             "Coran compact en arabe, facile à emporter partout."),
            ("La Citadelle du Musulman", 3000, 70,
             "Recueil des invocations quotidiennes tirées du Coran et de la Sunna."),
            ("Les 40 Hadiths de An-Nawawi", 4500, 35,
             "Les quarante hadiths de l'imam An-Nawawi avec commentaire en français."),
            ("Sahih Al-Boukhari (5 volumes)", 65000, 8,
             "Collection complète du Sahih Al-Boukhari en cinq volumes reliés."),
        ],
    ),
    (
        "Accessoires de prière",
        [
            ("Tapis de prière épais", 12000, 45,
             "Tapis de prière épais et moelleux, doux pour les genoux."),
            ("Tapis de prière de voyage", 6000, 40,
             "Tapis de prière pliable avec pochette, parfait pour les déplacements."),
            ("Chapelet Tasbih 99 perles", 2500, 100,
             "Chapelet de 99 perles pour le dhikr, fil résistant."),
            ("Porte-Coran en bois sculpté", 14000, 16,
             "Pupitre en bois sculpté et pliable pour poser le Coran pendant la lecture."),
        ],
    ),
    (
        "Alimentation",
        [
            ("Dattes Ajwa de Médine 500 g", 18000, 30,
             "Dattes Ajwa de Médine moelleuses, récoltées et emballées avec soin."),
            ("Miel de Sidr 250 g", 22000, 20,
             "Miel de Sidr pur et crémeux, reconnu pour ses bienfaits."),
            ("Huile de nigelle (Habba Sawda) 100 ml", 6000, 45,
             "Huile de nigelle pressée à froid, à consommer ou à appliquer."),
            ("Eau de Zamzam 500 ml", 10000, 25,
             "Eau de Zamzam rapportée de La Mecque en bouteille scellée."),
        ],
    ),
]


def slugify(value: str) -> str:
    """Build a slug the same way the businesses router does."""
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "business"


def exact_name_query(field_value: str) -> dict:
    """Case-insensitive exact match on a name field."""
    return {"$regex": f"^{re.escape(field_value)}$", "$options": "i"}


async def find_business(database) -> dict | None:
    """Look the business up by slug first, then by a case-insensitive name."""
    business = await database.businesses.find_one({"slug": BUSINESS_SLUG})
    if business is not None:
        return business
    return await database.businesses.find_one({"name": exact_name_query(BUSINESS_NAME)})


async def unique_slug(database) -> str:
    base_slug = slugify(BUSINESS_NAME)
    slug = base_slug
    suffix = 2
    while await database.businesses.find_one({"slug": slug}):
        slug = f"{base_slug}-{suffix}"
        suffix += 1
    return slug


async def create_business(database) -> dict | None:
    """Create the business owned by the first super administrator."""
    owner = await database.users.find_one({"role": "super_admin"})
    if owner is None:
        print("Aucun administrateur n'existe encore dans la base de données.")
        print("Démarrez l'application une fois (python app/main.py) pour créer")
        print("l'administrateur, puis relancez ce script. Rien n'a été écrit.")
        return None

    now = utc_now()
    document = {
        "name": BUSINESS_NAME,
        "slug": await unique_slug(database),
        "description": BUSINESS_DESCRIPTION,
        "visibility": "public",
        "owner_id": owner["_id"],
        "member_ids": [],
        "image_url": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await database.businesses.insert_one(document)
    document["_id"] = result.inserted_id
    return document


async def repair_placeholder_slug(database, business: dict) -> bool:
    """Repair the literal Swagger placeholder left on an older DIALLO record.

    Only the exact value ``string`` is changed. A real custom slug is never
    touched, and a conflicting ``diallo-fils`` slug is left alone.
    """
    if str(business.get("slug") or "").strip().lower() != "string":
        return False
    desired_slug = slugify(BUSINESS_NAME)
    conflict = await database.businesses.find_one(
        {"slug": desired_slug, "_id": {"$ne": business["_id"]}}, {"_id": 1}
    )
    if conflict is not None:
        return False
    await database.businesses.update_one(
        {"_id": business["_id"]},
        {"$set": {"slug": desired_slug, "updated_at": utc_now()}},
    )
    business["slug"] = desired_slug
    return True


async def repair_swagger_placeholders(database, business: dict) -> int:
    """Replace only literal Swagger example text on this seeded business.

    Older manual API tests sometimes saved the literal value ``string``. It is
    not meaningful shop content, so repairing that one placeholder makes the
    requested demo catalog presentable without overwriting real user text.
    """
    repaired = 0
    if str(business.get("description") or "").strip().lower() == "string":
        await database.businesses.update_one(
            {"_id": business["_id"]},
            {"$set": {"description": BUSINESS_DESCRIPTION, "updated_at": utc_now()}},
        )
        business["description"] = BUSINESS_DESCRIPTION
        repaired += 1

    products = await database.products.find(
        {"business_id": business["_id"], "description": "string"},
        {"_id": 1, "name": 1},
    ).to_list(length=100)
    for product in products:
        name = str(product.get("name") or "")
        description = (
            "Café Touba parfumé aux épices, torréfié et moulu à Dakar."
            if "café touba" in name.casefold()
            else None
        )
        await database.products.update_one(
            {"_id": product["_id"]},
            {"$set": {"description": description, "updated_at": utc_now()}},
        )
        repaired += 1
    return repaired


async def ensure_category(database, business_id, name: str) -> tuple[object, bool]:
    """Return the category id and whether it was created by this run."""
    existing = await database.categories.find_one(
        {"business_id": business_id, "name": exact_name_query(name)}
    )
    if existing is not None:
        return existing["_id"], False

    now = utc_now()
    document = {
        "business_id": business_id,
        "name": name,
        "created_at": now,
        "updated_at": now,
    }
    result = await database.categories.insert_one(document)
    return result.inserted_id, True


async def ensure_product(database, business_id, category_id, product: tuple[str, int, int, str]) -> bool:
    """Insert the product when it is missing. Returns True when created."""
    name, price, quantity, description = product
    existing = await database.products.find_one(
        {"business_id": business_id, "name": exact_name_query(name)}
    )
    if existing is not None:
        return False

    now = utc_now()
    await database.products.insert_one(
        {
            "name": name,
            "description": description,
            "category_id": category_id,
            "price": price,
            "quantity": quantity,
            "business_id": business_id,
            "image_url": None,
            "created_at": now,
            "updated_at": now,
        }
    )
    return True


async def reset_business_data(database, business_id) -> tuple[int, int]:
    """Delete only the products and categories of this business."""
    products = await database.products.delete_many({"business_id": business_id})
    categories = await database.categories.delete_many({"business_id": business_id})
    return products.deleted_count, categories.deleted_count


async def seed(reset: bool) -> int:
    client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=5000)
    try:
        try:
            await client.admin.command("ping")
        except PyMongoError as error:
            print("Impossible de se connecter à MongoDB.")
            print(f"Adresse utilisée : {settings.mongodb_url}")
            print("Vérifiez que la base de données est démarrée, puis relancez ce script.")
            print(f"Détail technique : {error}")
            return 1

        database = client[settings.mongodb_db]
        business = await find_business(database)
        business_created = business is None
        if business_created:
            business = await create_business(database)
            if business is None:
                return 1

        slug_repaired = await repair_placeholder_slug(database, business)

        business_id = business["_id"]
        if reset:
            deleted_products, deleted_categories = await reset_business_data(database, business_id)
            print(
                f"Réinitialisation : {deleted_products} produit(s) et "
                f"{deleted_categories} catégorie(s) supprimée(s)."
            )

        categories_created = 0
        categories_existing = 0
        products_created = 0
        products_existing = 0

        for category_name, products in CATALOG:
            category_id, created = await ensure_category(database, business_id, category_name)
            if created:
                categories_created += 1
            else:
                categories_existing += 1
            for product in products:
                if await ensure_product(database, business_id, category_id, product):
                    products_created += 1
                else:
                    products_existing += 1

        placeholders_repaired = await repair_swagger_placeholders(database, business)

        print("")
        print(f"Boutique : {business['name']} (slug : {business['slug']})")
        print("Boutique créée par ce script." if business_created else "Boutique déjà existante.")
        if slug_repaired:
            print("Slug Swagger générique remplacé par : diallo-fils.")
        if placeholders_repaired:
            print(f"{placeholders_repaired} champ(s) Swagger générique remplacé(s).")
        print(f"Catégories : {categories_created} créée(s), {categories_existing} déjà présente(s).")
        print(f"Produits   : {products_created} créé(s), {products_existing} déjà présent(s).")
        print("")
        print("Catalogue public à ouvrir :")
        print(f"  frontend/catalog.html?slug={business['slug']}")
        return 0
    except PyMongoError as error:
        print("Erreur de base de données pendant l'insertion des données.")
        print(f"Détail technique : {error}")
        return 1
    finally:
        client.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed the DIALLO & FILS business with its categories and products."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete this business's products and categories before seeding them again",
    )
    args = parser.parse_args()
    return asyncio.run(seed(args.reset))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        # Accented French output must survive a legacy Windows console codepage.
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())
