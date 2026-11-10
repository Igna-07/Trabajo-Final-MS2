from datetime import date, datetime, timedelta
from decimal import Decimal
from io import BytesIO
from typing import Literal
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from ..database import transaction, rows, one
from ..repositories.reports import report
from ..security import admin

router = APIRouter(prefix='/api', tags=['Reportes'], dependencies=[Depends(admin)])
ReportName = Literal['ventas', 'productos', 'clientes', 'inventario']


def period(start, end):
    start = start or date.today().replace(day=1)
    end = end or date.today()
    if start > end:
        raise HTTPException(422, 'La fecha inicial debe ser anterior o igual a la final')
    return start, end


def workbook_bytes(data, name):
    book = Workbook()
    sheet = book.active
    sheet.title = name.capitalize()
    if data:
        sheet.append(list(data[0]))
        for record in data:
            # Las cadenas son siempre texto: evita fórmulas ejecutables desde datos de usuarios.
            sheet.append(list(record.values()))
            for cell in sheet[sheet.max_row]:
                if isinstance(cell.value, str):
                    cell.data_type = 's'
                elif isinstance(cell.value, (date, datetime)):
                    cell.number_format = 'yyyy-mm-dd hh:mm'
        sheet.freeze_panes = 'A2'
        sheet.auto_filter.ref = sheet.dimensions
        for cell in sheet[1]:
            cell.font = Font(bold=True, color='FFFFFF')
            cell.fill = PatternFill('solid', fgColor='166534')
        for column in sheet.columns:
            sheet.column_dimensions[column[0].column_letter].width = min(50, max(16, len(str(column[0].value))+3))
    else:
        sheet.append(['Sin datos para el período seleccionado'])
    output = BytesIO()
    book.save(output)
    return output.getvalue()


@router.get('/reportes/{name}')
async def report_data(name: ReportName, desde: date | None = None, hasta: date | None = None):
    start, end = period(desde, hasta)
    async with transaction() as c:
        return await report(c, name, start, end)


@router.get('/reportes/{name}/excel')
async def report_excel(name: ReportName, desde: date | None = None, hasta: date | None = None):
    start, end = period(desde, hasta)
    async with transaction() as c:
        data = await report(c, name, start, end)
    content = await asyncio.to_thread(workbook_bytes, data, name)
    return Response(content, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    headers={'Content-Disposition': f'attachment; filename="{name}-{start}-{end}.xlsx"'})


@router.get('/dashboard/metricas')
async def metrics():
    async with transaction() as c:
        return await one(c, '''SELECT
          (SELECT COUNT(*) FROM productos) productos,
          (SELECT COUNT(*) FROM clientes) clientes,
          (SELECT COUNT(*) FROM ventas WHERE DATE(fecha)=CURRENT_DATE AND estado='ACTIVA') ventasHoy,
          (SELECT COUNT(*) FROM ventas WHERE estado='ACTIVA') cantidadVentas,
          (SELECT COUNT(*) FROM cuotas q INNER JOIN ventas_cuotas vc ON vc.id=q.venta_cuota_id
           INNER JOIN ventas v ON v.id=vc.venta_id WHERE q.pagada=FALSE AND q.fecha_vencimiento<CURRENT_DATE
           AND v.estado='ACTIVA' AND vc.archivada=FALSE) cuotasVencidas,
          (SELECT COUNT(*) FROM productos WHERE stock<=3) stockBajo''')


@router.get('/dashboard/estadisticas')
async def statistics(dias: int = Query(default=30, ge=1, le=365)):
    end = date.today()
    start = end-timedelta(days=dias-1)
    previous = start-timedelta(days=dias)
    async with transaction() as c:
        summary = await one(c, '''SELECT COUNT(*) cantidad_ventas,COALESCE(SUM(total),0) ingresos
                                 FROM ventas WHERE estado='ACTIVA' AND DATE(fecha) BETWEEN %s AND %s''', (start, end))
        details = await one(c, '''SELECT COALESCE(SUM(d.cantidad),0) unidades,COALESCE(SUM(d.cantidad*d.costo_unitario),0) costo
          FROM detalle_ventas d INNER JOIN ventas v ON v.id=d.venta_id
          WHERE v.estado='ACTIVA' AND DATE(v.fecha) BETWEEN %s AND %s''', (start, end))
        old = await one(c, '''SELECT COALESCE(SUM(total),0) ingresos FROM ventas
          WHERE estado='ACTIVA' AND DATE(fecha)>=%s AND DATE(fecha)<%s''', (previous, start))
        inventory = await one(c, '''SELECT COALESCE(SUM(stock*costo),0) valor_costo,COALESCE(SUM(stock*precio),0) valor_venta,
          COALESCE(SUM(stock),0) unidades,COALESCE(SUM(stock=0),0) sin_stock,
          COALESCE(SUM(stock>0 AND stock<=3),0) stock_bajo,COALESCE(SUM(stock>3),0) stock_saludable FROM productos''')
        accounts = await one(c, '''SELECT
          COALESCE((SELECT SUM(q.monto) FROM cuotas q INNER JOIN ventas_cuotas vc ON vc.id=q.venta_cuota_id
            INNER JOIN ventas v ON v.id=vc.venta_id WHERE q.pagada=FALSE AND vc.archivada=FALSE AND v.estado='ACTIVA'),0)
          + COALESCE((SELECT SUM(ac.saldo_pendiente) FROM ventas_a_cuenta_app ac INNER JOIN ventas v ON v.id=ac.venta_id
            WHERE ac.archivada=FALSE AND v.estado='ACTIVA'),0) total_pendiente,
          COALESCE((SELECT SUM(q.monto) FROM cuotas q INNER JOIN ventas_cuotas vc ON vc.id=q.venta_cuota_id
            INNER JOIN ventas v ON v.id=vc.venta_id WHERE q.pagada=FALSE AND q.fecha_vencimiento<CURRENT_DATE
            AND vc.archivada=FALSE AND v.estado='ACTIVA'),0) total_vencido''')
        products = await report(c, 'productos', start, end)
        daily = await rows(c, '''SELECT DATE(fecha) fecha,SUM(total) total FROM ventas
           WHERE estado='ACTIVA' AND DATE(fecha) BETWEEN %s AND %s GROUP BY DATE(fecha) ORDER BY DATE(fecha)''', (start, end))
        methods = await rows(c, '''SELECT metodo_pago,COUNT(*) cantidad,SUM(total) total FROM ventas
           WHERE estado='ACTIVA' AND DATE(fecha) BETWEEN %s AND %s GROUP BY metodo_pago ORDER BY total DESC''', (start, end))
    income = summary['ingresos']
    profit = income-details['costo']
    for p in products:
        units, stock = p['unidades_vendidas'], p['stock']
        p['tasa_salida'] = units*100/(units+stock) if units+stock else 0
        p['dias_stock'] = stock*dias/units if units else None
    daily_map = {r['fecha']: r['total'] for r in daily}
    return dict(actualizado_en=datetime.now().isoformat(), dias=dias,
                resumen=dict(ingresos=income, costo_mercaderia=details['costo'], ganancia_bruta=profit,
                  margen_bruto=profit*100/income if income else 0, cantidad_ventas=summary['cantidad_ventas'],
                  unidades_vendidas=details['unidades'], ticket_promedio=income/summary['cantidad_ventas'] if summary['cantidad_ventas'] else 0,
                  crecimiento=(income-old['ingresos'])*100/old['ingresos'] if old['ingresos'] else None,
                  retorno_inventario=profit/inventory['valor_costo'] if inventory['valor_costo'] else 0),
                inventario=inventory | {'rotacion_sobre_stock_actual': details['costo']/inventory['valor_costo'] if inventory['valor_costo'] else 0},
                cuentas=accounts, productos=products[:12], medios_pago=methods,
                ventas_diarias=[{'fecha': start+timedelta(days=i), 'total': daily_map.get(start+timedelta(days=i), 0)} for i in range(dias)])
