"""JWT HS256 y contraseñas Argon2; rol consultado en BD en cada petición."""
from datetime import datetime, timedelta, timezone
import asyncio
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from .config import jwt_secret
from .database import transaction, one

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
DUMMY_HASH = password_hash.hash('dummy-password-for-timing')
TOKEN_LIFETIME = timedelta(hours=4)


async def hash_password(value):
    return await asyncio.to_thread(password_hash.hash, value)


async def verify_password(value, hashed):
    return await asyncio.to_thread(password_hash.verify, value, hashed)


def create_token(user_id):
    now = datetime.now(timezone.utc)
    return jwt.encode({'sub': str(user_id), 'iat': now, 'exp': now + TOKEN_LIFETIME}, jwt_secret(), algorithm='HS256')


async def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    try:
        if not credentials:
            raise ValueError()
        token = jwt.decode(credentials.credentials, jwt_secret(), algorithms=['HS256'], options={'require': ['exp', 'sub', 'iat']})
        if datetime.now(timezone.utc).timestamp() >= int(token['iat']) + TOKEN_LIFETIME.total_seconds():
            raise jwt.ExpiredSignatureError('El token superó la duración máxima de la sesión')
        user_id = int(token['sub'])
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(401, 'Sesión vencida o inválida', headers={'WWW-Authenticate': 'Bearer'})
    async with transaction() as cursor:
        user = await one(cursor, 'SELECT id,nombre,email,rol,activo FROM usuarios WHERE id=%s AND activo=TRUE', (user_id,))
    if not user:
        raise HTTPException(401, 'Usuario inactivo o inexistente')
    return user


async def admin(user=Depends(current_user)):
    if user['rol'] != 'ADMIN':
        raise HTTPException(403, 'No tenés permisos para realizar esta acción')
    return user
