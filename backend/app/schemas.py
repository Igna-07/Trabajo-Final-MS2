"""Validación de entrada: límites, formatos y reglas compartidas."""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator, model_validator

Money = Annotated[Decimal, Field(ge=0, le=999999999999, max_digits=14, decimal_places=2)]
PositiveId = Annotated[int, Field(gt=0)]
Name = Annotated[str, Field(min_length=1, max_length=120)]
Payment = Literal['Efectivo', 'Transferencia', 'Tarjeta', 'Cuotas', 'Cuotas efectivo', 'A cuenta', 'Cheques', 'Credito']
Card = Literal['VISA', 'MASTERCARD', 'NARANJA_X']
Password = Annotated[str, StringConstraints(strip_whitespace=False)]


class Input(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)


class Login(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    model_config = ConfigDict(str_strip_whitespace=False)


class Product(Input):
    marca: Name
    nombre: str = Field(min_length=1, max_length=180)
    descripcion: str | None = Field(default=None, max_length=5000)
    costo: Money
    precio: Money
    stock: int = Field(ge=0, le=1000000000)


class Customer(Input):
    nombre: Name
    apellido: str | None = Field(default=None, max_length=120)
    telefono: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    direccion: str | None = Field(default=None, max_length=2000)

    @field_validator('email', mode='before')
    @classmethod
    def empty_email(cls, value):
        return value or None


class Provider(Customer):
    pass


class Item(Input):
    producto_id: PositiveId
    cantidad: int = Field(gt=0, le=1000000)


class Items(Input):
    productos: list[Item] = Field(min_length=1, max_length=200)

    @field_validator('productos')
    @classmethod
    def unique_items(cls, value):
        if len({p.producto_id for p in value}) != len(value):
            raise ValueError('No se permiten productos repetidos')
        return value


class Sale(Items):
    cliente_id: PositiveId
    metodo_pago: Payment
    cantidad_cuotas: int | None = Field(default=None, ge=1, le=12)
    marca_tarjeta: Card | None = None
    descuento: Money = Decimal('0')
    cantidad_cheques: int | None = Field(default=None, ge=1, le=10)

    @model_validator(mode='after')
    def payment_rules(self):
        if self.metodo_pago in ('Tarjeta', 'Cuotas') and not self.marca_tarjeta:
            raise ValueError('Seleccioná una tarjeta')
        if self.metodo_pago in ('Cuotas', 'Cuotas efectivo') and not self.cantidad_cuotas:
            raise ValueError('Seleccioná la cantidad de cuotas')
        if self.metodo_pago == 'Cuotas' and self.cantidad_cuotas < 2:
            raise ValueError('Se requieren al menos dos cuotas')
        if self.metodo_pago == 'Cheques' and not self.cantidad_cheques:
            raise ValueError('Seleccioná la cantidad de cheques')
        return self


class SaleEdit(Items):
    cliente_id: PositiveId
    descuento: Money = Decimal('0')


class PurchaseItem(Item):
    costo_unitario: Money


class Purchase(Items):
    proveedor_id: PositiveId
    productos: list[PurchaseItem] = Field(min_length=1, max_length=200)


class Budget(Items):
    cliente_id: PositiveId


class Collection(Input):
    metodo_pago: Literal['Efectivo', 'Transferencia', 'Tarjeta', 'Credito']
    marca_tarjeta: Card | None = None

    @model_validator(mode='after')
    def card(self):
        if self.metodo_pago == 'Tarjeta' and not self.marca_tarjeta:
            raise ValueError('Seleccioná una tarjeta')
        return self


class PaymentIn(Collection):
    monto: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]


class UserCreate(Input):
    nombre: Name
    email: EmailStr
    password: Password = Field(min_length=10, max_length=256)
    rol: Literal['ADMIN', 'EMPLEADO'] = 'EMPLEADO'


class UserEdit(Input):
    nombre: Name
    rol: Literal['ADMIN', 'EMPLEADO']
    activo: bool
    password: Password = Field(default='', max_length=256)

    @field_validator('password')
    @classmethod
    def password_length(cls, value):
        if value and len(value) < 10:
            raise ValueError('La contraseña debe tener al menos 10 caracteres')
        return value


class Surcharge(Input):
    porcentaje: Decimal = Field(ge=0, le=500, decimal_places=4)


class Prices(Input):
    marca: Name
    porcentaje: Decimal = Field(ge=-99, le=500)


class Sheet(Input):
    nombre: str = Field(min_length=1, max_length=180)
    cliente_id: PositiveId | None = None
    contenido: list[list[str]] = Field(default_factory=lambda: [[''] * 6 for _ in range(10)], max_length=200)

    @field_validator('contenido')
    @classmethod
    def bounds(cls, value):
        if any(len(row) > 50 or any(len(cell) > 2000 for cell in row) for row in value):
            raise ValueError('La planilla excede los límites permitidos')
        return value


class CashOpen(Input):
    saldo_inicial: Money


class CashClose(Input):
    saldo_contado: Money


class Cancellation(Input):
    motivo: str = Field(default='', max_length=2000)
