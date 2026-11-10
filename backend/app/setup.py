"""Inicialización explícita e idempotente. No modifica bases PostgreSQL existentes."""
import asyncio
import os
import aiomysql
from pydantic import TypeAdapter, EmailStr
from .config import ROOT, database_options, jwt_secret
from .security import hash_password


def statements(text):
    """Respeta DELIMITER para enviar CREATE PROCEDURE como una sola sentencia."""
    delimiter = ';'
    buffer = ''
    for line in text.splitlines():
        if line.strip().startswith('--') or not line.strip():
            continue
        if line.upper().startswith('DELIMITER '):
            delimiter = line.split()[1]
            continue
        buffer += line + '\n'
        if buffer.rstrip().endswith(delimiter):
            yield buffer.rstrip()[:-len(delimiter)]
            buffer = ''
    if buffer.strip():
        raise ValueError('Sentencia SQL sin delimitador final')


async def setup():
    jwt_secret()
    connection = await aiomysql.connect(**database_options())
    try:
        async with connection.cursor() as c:
            for filename in ('schema.sql', 'procedures.sql'):
                for sql in statements((ROOT / 'database' / filename).read_text(encoding='utf-8')):
                    await c.execute(sql)
                    while await c.nextset():
                        pass
            for card in ('VISA', 'MASTERCARD', 'NARANJA_X', 'EFECTIVO'):
                for count in (range(1, 13) if card == 'EFECTIVO' else (1, 2, 3, 6, 12)):
                    await c.execute('''INSERT IGNORE INTO recargos_tarjeta_app(marca,cantidad_cuotas,porcentaje)
                                       VALUES(%s,%s,0)''', (card, count))
            for prefix, role in (('ADMIN', 'ADMIN'), ('EMPLOYEE', 'EMPLEADO')):
                email = os.getenv(f'{prefix}_EMAIL')
                password = os.getenv(f'{prefix}_PASSWORD')
                if not email or not password:
                    continue
                TypeAdapter(EmailStr).validate_python(email)
                if len(password) < 10:
                    raise ValueError(f'{prefix}_PASSWORD debe tener al menos 10 caracteres')
                await c.execute('SELECT id FROM usuarios WHERE email=%s', (email.lower(),))
                if not await c.fetchone():
                    await c.execute('INSERT INTO usuarios(nombre,email,password,rol) VALUES(%s,%s,%s,%s)',
                                    (os.getenv(f'{prefix}_NAME', role), email.lower(), await hash_password(password), role))
            await connection.commit()
    finally:
        connection.close()
    print('Esquema MySQL, procedimiento y cuentas iniciales preparados.')


if __name__ == '__main__':
    asyncio.run(setup())
