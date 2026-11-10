import json
from fastapi import APIRouter, Depends
from ..database import transaction, rows, insert
from ..repositories import catalog as repo
from ..schemas import Product, Customer, Provider, Prices, Sheet
from ..security import current_user, admin

router = APIRouter(prefix='/api', tags=['Catálogos'], dependencies=[Depends(current_user)])


@router.get('/productos')
async def products():
    async with transaction() as c:
        return await repo.list_all(c, 'productos')


async def save_product(body, user, id=None):
    async with transaction() as c:
        previous = await repo.require(c, 'productos', id, lock=True) if id else None
        product = await repo.save(c, 'productos', body.model_dump(), id)
        stock_before = previous['stock'] if previous else 0
        if stock_before != body.stock:
            await insert(c, 'movimientos_stock_app', dict(producto_id=product['id'], usuario_id=user['id'],
                         tipo='AJUSTE' if previous else 'ALTA', cantidad=body.stock-stock_before,
                         stock_anterior=stock_before, stock_nuevo=body.stock, referencia='catalogo'))
        return product


@router.post('/productos', status_code=201)
async def create_product(body: Product, user=Depends(admin)):
    return await save_product(body, user)


@router.put('/productos/marca/precios')
async def prices(body: Prices, user=Depends(admin)):
    async with transaction() as c:
        await c.execute('UPDATE productos SET precio=ROUND(precio*(1+%s/100),2) WHERE LOWER(marca)=LOWER(%s)', (body.porcentaje, body.marca))
        products = await rows(c, 'SELECT id,marca,nombre,precio FROM productos WHERE LOWER(marca)=LOWER(%s)', (body.marca,))
        return {'mensaje': 'Precios actualizados', 'cantidad': len(products), 'productos': products}


@router.put('/productos/{id}')
async def edit_product(id: int, body: Product, user=Depends(admin)):
    return await save_product(body, user, id)


@router.delete('/productos/{id}')
async def delete_product(id: int, user=Depends(admin)):
    async with transaction() as c:
        await repo.require(c, 'productos', id, lock=True)
        # Alta/ajustes solos no impiden la baja. Si hay operaciones, la FK revierte todo.
        await c.execute("DELETE FROM movimientos_stock_app WHERE producto_id=%s AND tipo IN ('ALTA','AJUSTE')", (id,))
        return await repo.delete(c, 'productos', id)


@router.get('/clientes')
async def customers():
    async with transaction() as c:
        return await repo.list_all(c, 'clientes')


@router.post('/clientes', status_code=201)
async def create_customer(body: Customer):
    async with transaction() as c:
        return await repo.save(c, 'clientes', body.model_dump())


@router.put('/clientes/{id}')
async def edit_customer(id: int, body: Customer):
    async with transaction() as c:
        return await repo.save(c, 'clientes', body.model_dump(), id)


@router.delete('/clientes/{id}')
async def delete_customer(id: int, user=Depends(admin)):
    async with transaction() as c:
        return await repo.delete(c, 'clientes', id)


@router.get('/operaciones/proveedores', dependencies=[Depends(admin)])
async def providers():
    async with transaction() as c:
        return await rows(c, 'SELECT * FROM proveedores_app WHERE activo=TRUE ORDER BY nombre')


@router.post('/operaciones/proveedores', status_code=201, dependencies=[Depends(admin)])
async def create_provider(body: Provider):
    async with transaction() as c:
        return await repo.save(c, 'proveedores_app', body.model_dump(exclude={'apellido'}))


@router.put('/operaciones/proveedores/{id}', dependencies=[Depends(admin)])
async def edit_provider(id: int, body: Provider):
    async with transaction() as c:
        return await repo.save(c, 'proveedores_app', body.model_dump(exclude={'apellido'}), id)


@router.delete('/operaciones/proveedores/{id}', dependencies=[Depends(admin)])
async def delete_provider(id: int):
    async with transaction() as c:
        return await repo.delete(c, 'proveedores_app', id)


@router.get('/planillas')
async def sheets():
    async with transaction() as c:
        return await rows(c, '''SELECT p.*,c.nombre cliente_nombre,c.apellido cliente_apellido
          FROM planillas_clientes_app p LEFT JOIN clientes c ON c.id=p.cliente_id
          ORDER BY p.fecha_actualizacion DESC,p.id DESC''')


def decode_sheet(row):
    if isinstance(row.get('contenido'), str):
        row['contenido'] = json.loads(row['contenido'])
    return row


@router.get('/planillas/{id}')
async def sheet(id: int):
    async with transaction() as c:
        return decode_sheet(await repo.require(c, 'planillas_clientes_app', id))


async def save_sheet(body, user, id=None):
    async with transaction() as c:
        data = body.model_dump(exclude={'contenido'}) | {'contenido': json.dumps(body.contenido, ensure_ascii=False)}
        if id is None:
            data['usuario_id'] = user['id']
        else:
            from datetime import datetime
            data['fecha_actualizacion'] = datetime.now()
        return decode_sheet(await repo.save(c, 'planillas_clientes_app', data, id))


@router.post('/planillas', status_code=201)
async def create_sheet(body: Sheet, user=Depends(current_user)):
    return await save_sheet(body, user)


@router.put('/planillas/{id}')
async def edit_sheet(id: int, body: Sheet, user=Depends(current_user)):
    return await save_sheet(body, user, id)


@router.delete('/planillas/{id}')
async def delete_sheet(id: int):
    async with transaction() as c:
        return await repo.delete(c, 'planillas_clientes_app', id)
