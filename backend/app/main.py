import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pymysql.err import MySQLError
from .config import ROOT, jwt_secret
from .database import open_pool, close_pool
from .routers import auth, catalog, sales, operations, reports


@asynccontextmanager
async def lifespan(app):
    jwt_secret()
    await open_pool()
    try:
        yield
    finally:
        await close_pool()


app = FastAPI(title='Control de Stock - MSII 2026', version='2.0.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_methods=['GET', 'POST', 'PUT', 'DELETE'], allow_headers=['Authorization', 'Content-Type'])


@app.exception_handler(HTTPException)
async def http_error(request, error):
    return JSONResponse(status_code=error.status_code, content={'mensaje': error.detail}, headers=error.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request, error):
    errors = [{'campo': '.'.join(map(str, e['loc'][1:])), 'mensaje': e['msg']} for e in error.errors()]
    return JSONResponse(status_code=422, content={'mensaje': '; '.join(f'{e["campo"]}: {e["mensaje"]}' for e in errors), 'errores': errors})


@app.exception_handler(MySQLError)
async def database_error(request, error):
    code = error.args[0] if error.args else 0
    if code == 1644:
        return JSONResponse(status_code=409, content={'mensaje': str(error.args[1])})
    if code in (1062, 1451, 1452, 3819, 1213, 1205):
        messages = {1062: 'Ya existe un registro con esos datos', 1451: 'El registro tiene operaciones relacionadas; no se puede eliminar',
                    1452: 'El registro relacionado no existe', 3819: 'Datos fuera de los límites permitidos',
                    1213: 'Conflicto entre operaciones, volvé a intentar', 1205: 'La operación está ocupada, volvé a intentar'}
        return JSONResponse(status_code=409, content={'mensaje': messages[code]})
    logging.exception('Error MySQL', exc_info=error)
    return JSONResponse(status_code=500, content={'mensaje': 'Error interno de base de datos'})


@app.get('/api/health', tags=['Estado'])
async def health():
    return {'mensaje': 'API FastAPI de Trabajo Final MSII funcionando'}


for router in (auth.router, catalog.router, sales.router, operations.router, reports.router):
    app.include_router(router)

# En producción FastAPI sirve la compilación React; Vite actúa como proxy en desarrollo.
dist = ROOT / 'frontend' / 'dist'
if dist.is_dir():
    app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')

    @app.get('/{path:path}', include_in_schema=False)
    async def frontend(path: str):
        if path.startswith('api/'):
            raise HTTPException(404, 'Endpoint inexistente')
        candidate = (dist / path).resolve()
        if candidate.is_relative_to(dist.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist / 'index.html')
