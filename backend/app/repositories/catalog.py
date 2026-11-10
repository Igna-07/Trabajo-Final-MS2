"""Acceso parametrizado a catálogos; las tablas provienen de constantes."""
from fastapi import HTTPException
from ..database import one, rows, insert, update


async def require(cursor, table, id, lock=False):
    result = await one(cursor, f'SELECT * FROM `{table}` WHERE id=%s' + (' FOR UPDATE' if lock else ''), (id,))
    if result is None:
        raise HTTPException(404, 'Registro no encontrado')
    return result


async def list_all(cursor, table):
    return await rows(cursor, f'SELECT * FROM `{table}` ORDER BY id DESC')


async def save(cursor, table, data, id=None):
    if id is None:
        id = await insert(cursor, table, data)
    else:
        await require(cursor, table, id, lock=True)
        await update(cursor, table, id, data)
    return await require(cursor, table, id)


async def delete(cursor, table, id):
    await require(cursor, table, id, lock=True)
    await cursor.execute(f'DELETE FROM `{table}` WHERE id=%s', (id,))
    return {'mensaje': 'Registro eliminado'}
