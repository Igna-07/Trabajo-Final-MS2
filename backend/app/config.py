"""Configuración compartida. Nunca se incluyen credenciales en el código."""
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')
load_dotenv(ROOT / 'backend' / '.env', override=True)


def database_options():
    return dict(host=os.getenv('DB_HOST', '127.0.0.1'),
                port=int(os.getenv('DB_PORT', '3306')),
                user=os.getenv('DB_USER', 'stock_user'),
                password=os.environ['DB_PASSWORD'],
                db=os.getenv('DB_NAME', 'stock_db'), charset='utf8mb4',
                init_command="SET time_zone = '-03:00'", autocommit=False)


def jwt_secret():
    secret = os.environ.get('JWT_SECRET', '')
    if len(secret) < 32:
        raise RuntimeError('JWT_SECRET debe tener al menos 32 caracteres')
    return secret
