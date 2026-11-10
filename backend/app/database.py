"""Pool asíncrono y unidad de trabajo; una conexión por transacción."""
from contextlib import asynccontextmanager
import aiomysql
from .config import database_options

pool = None


async def open_pool():
    global pool
    pool = await aiomysql.create_pool(minsize=1, maxsize=10, **database_options())


async def close_pool():
    if pool:
        pool.close()
        await pool.wait_closed()


@asynccontextmanager
async def transaction():
    async with pool.acquire() as connection:
        await connection.begin()
        try:
            async with connection.cursor(aiomysql.DictCursor) as cursor:
                yield cursor
            await connection.commit()
        except BaseException:
            await connection.rollback()
            raise


async def rows(cursor, sql, args=()):
    await cursor.execute(sql, args)
    return list(await cursor.fetchall())


async def one(cursor, sql, args=()):
    await cursor.execute(sql, args)
    return await cursor.fetchone()


async def insert(cursor, table, data):
    # table/column names only come from application constants, never HTTP input.
    columns = ','.join(f'`{key}`' for key in data)
    placeholders = ','.join(['%s'] * len(data))
    await cursor.execute(f'INSERT INTO `{table}` ({columns}) VALUES ({placeholders})', tuple(data.values()))
    return cursor.lastrowid


async def update(cursor, table, id, data):
    assignments = ','.join(f'`{key}`=%s' for key in data)
    await cursor.execute(f'UPDATE `{table}` SET {assignments} WHERE id=%s', (*data.values(), id))
