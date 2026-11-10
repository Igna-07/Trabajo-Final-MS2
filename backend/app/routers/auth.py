from fastapi import APIRouter, Depends, HTTPException
from ..database import transaction, one, rows
from ..repositories.catalog import save, require
from ..schemas import Login, UserCreate, UserEdit, Surcharge
from ..security import current_user, admin, create_token, hash_password, verify_password, DUMMY_HASH

router = APIRouter(prefix='/api', tags=['Seguridad'])
PUBLIC_FIELDS = 'id,nombre,email,rol,activo,fecha_creacion'


@router.post('/auth/login')
async def login(body: Login):
    async with transaction() as c:
        user = await one(c, 'SELECT * FROM usuarios WHERE email=%s', (str(body.email).lower(),))
    valid = await verify_password(body.password, user['password'] if user else DUMMY_HASH)
    if not user or not valid or not user['activo']:
        raise HTTPException(401, 'Email o contraseña incorrectos')
    user.pop('password')
    return {'token': create_token(user['id']), 'usuario': user}


@router.get('/auth/me')
async def me(user=Depends(current_user)):
    return user


@router.get('/administracion/usuarios')
async def users(user=Depends(admin)):
    async with transaction() as c:
        return await rows(c, f'SELECT {PUBLIC_FIELDS} FROM usuarios ORDER BY id')


@router.post('/administracion/usuarios', status_code=201)
async def create_user(body: UserCreate, user=Depends(admin)):
    data = body.model_dump() | {'password': await hash_password(body.password), 'email': str(body.email).lower()}
    async with transaction() as c:
        result = await save(c, 'usuarios', data)
        result.pop('password')
        return result


@router.put('/administracion/usuarios/{id}')
async def edit_user(id: int, body: UserEdit, user=Depends(admin)):
    if id == user['id'] and (not body.activo or body.rol != 'ADMIN'):
        raise HTTPException(400, 'No podés quitarte tus propios permisos')
    data = body.model_dump(exclude={'password'})
    if body.password:
        data['password'] = await hash_password(body.password)
    async with transaction() as c:
        result = await save(c, 'usuarios', data, id)
        result.pop('password')
        return result


@router.get('/administracion/recargos', dependencies=[Depends(current_user)])
async def surcharges():
    async with transaction() as c:
        return await rows(c, 'SELECT * FROM recargos_tarjeta_app WHERE activo=TRUE ORDER BY marca,cantidad_cuotas')


@router.put('/administracion/recargos/{id}')
async def edit_surcharge(id: int, body: Surcharge, user=Depends(admin)):
    async with transaction() as c:
        record = await require(c, 'recargos_tarjeta_app', id, lock=True)
        if record['marca'] != 'EFECTIVO' and record['cantidad_cuotas'] == 1 and body.porcentaje:
            raise HTTPException(400, 'No se permite recargo en un pago con tarjeta')
        return await save(c, 'recargos_tarjeta_app', body.model_dump(), id)
