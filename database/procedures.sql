-- El procedimiento es la unidad transaccional completa de una venta.
-- Se llama fuera de otra transacción. El handler revierte incluso detalles/stock.
DROP PROCEDURE IF EXISTS registrar_venta;
DELIMITER $$
CREATE PROCEDURE registrar_venta(
    IN p_cliente INT, IN p_usuario INT, IN p_metodo VARCHAR(50),
    IN p_productos JSON, IN p_descuento DECIMAL(14,2),
    IN p_marca VARCHAR(30), IN p_cuotas INT, IN p_cheques INT,
    OUT p_venta INT
)
SQL SECURITY INVOKER
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE n INT;
    DECLARE pid INT;
    DECLARE cantidad INT;
    DECLARE disponible INT;
    DECLARE precio DECIMAL(14,2);
    DECLARE costo DECIMAL(14,2);
    DECLARE subtotal DECIMAL(14,2) DEFAULT 0;
    DECLARE total DECIMAL(14,2);
    DECLARE porcentaje DECIMAL(8,4) DEFAULT 0;
    DECLARE recargo DECIMAL(14,2) DEFAULT 0;
    DECLARE plan INT;
    DECLARE cuota_id INT;
    DECLARE monto DECIMAL(14,2);
    DECLARE monto_cuota DECIMAL(14,2);
    DECLARE medio VARCHAR(50);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
    IF NOT EXISTS (SELECT 1 FROM clientes WHERE id=p_cliente)
       OR NOT EXISTS (SELECT 1 FROM usuarios WHERE id=p_usuario AND activo=TRUE) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cliente o usuario inexistente';
    END IF;
    IF p_metodo NOT IN ('Efectivo','Transferencia','Tarjeta','Cuotas','Cuotas efectivo','A cuenta','Cheques','Credito')
       OR JSON_TYPE(p_productos) <> 'ARRAY' OR JSON_LENGTH(p_productos)=0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Datos de venta inválidos';
    END IF;
    IF p_metodo IN ('Tarjeta','Cuotas') AND (p_marca IS NULL OR p_marca NOT IN ('VISA','MASTERCARD','NARANJA_X')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Tarjeta inválida';
    END IF;
    IF p_metodo='Cheques' AND (p_cheques IS NULL OR p_cheques NOT BETWEEN 1 AND 10) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cantidad de cheques inválida';
    END IF;
    IF p_metodo IN ('Cuotas','Cuotas efectivo') THEN
        IF p_cuotas IS NULL OR p_cuotas NOT BETWEEN 1 AND 12 OR (p_metodo='Cuotas' AND p_cuotas<2) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cantidad de cuotas inválida';
        END IF;
        SET porcentaje = (SELECT r.porcentaje FROM recargos_tarjeta_app r
          WHERE r.marca=IF(p_metodo='Cuotas efectivo','EFECTIVO',p_marca)
          AND r.cantidad_cuotas=p_cuotas AND r.activo=TRUE);
        IF porcentaje IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No existe configuración de recargo';
        END IF;
    END IF;
    INSERT INTO ventas(cliente_id,usuario_id,total,subtotal,metodo_pago,marca_tarjeta,descuento,cantidad_cheques)
    VALUES(p_cliente,p_usuario,0,0,p_metodo,p_marca,0,p_cheques);
    SET p_venta=LAST_INSERT_ID();
    SET n=JSON_LENGTH(p_productos);
    WHILE i<n DO
        SET pid=JSON_UNQUOTE(JSON_EXTRACT(p_productos,CONCAT('$[',i,'].producto_id')));
        SET cantidad=JSON_UNQUOTE(JSON_EXTRACT(p_productos,CONCAT('$[',i,'].cantidad')));
        IF cantidad IS NULL OR cantidad<1 OR pid IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Producto o cantidad inválidos';
        END IF;
        SET disponible=NULL;
        SELECT p.stock,p.precio,p.costo INTO disponible,precio,costo FROM productos p WHERE p.id=pid FOR UPDATE;
        IF disponible IS NULL OR disponible<cantidad THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Producto inexistente o stock insuficiente';
        END IF;
        INSERT INTO detalle_ventas(venta_id,producto_id,cantidad,precio_unitario,costo_unitario,subtotal)
        VALUES(p_venta,pid,cantidad,precio,costo,precio*cantidad);
        UPDATE productos SET stock=stock-cantidad WHERE id=pid;
        INSERT INTO movimientos_stock_app(producto_id,usuario_id,tipo,cantidad,stock_anterior,stock_nuevo,referencia)
        VALUES(pid,p_usuario,'VENTA',-cantidad,disponible,disponible-cantidad,CONCAT('venta:',p_venta));
        SET subtotal=subtotal+precio*cantidad;
        SET i=i+1;
    END WHILE;
    IF p_descuento IS NULL OR p_descuento<0 OR p_descuento>subtotal THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Descuento inválido';
    END IF;
    SET recargo=ROUND(subtotal*porcentaje/100,2);
    SET total=subtotal+recargo-p_descuento;
    UPDATE ventas v SET v.subtotal=subtotal,v.total=total,v.descuento=p_descuento,
      v.porcentaje_recargo=porcentaje,v.monto_recargo=recargo WHERE v.id=p_venta;

    IF p_metodo IN ('Cuotas','Cuotas efectivo') THEN
        SET monto_cuota=ROUND(total/p_cuotas,2);
        INSERT INTO ventas_cuotas(venta_id,cantidad_cuotas,monto_cuota,total_financiado)
        VALUES(p_venta,p_cuotas,monto_cuota,total);
        SET plan=LAST_INSERT_ID();
        SET medio=IF(p_metodo='Cuotas','Tarjeta','Efectivo');
        SET i=1;
        WHILE i<=p_cuotas DO
            SET monto=IF(i=p_cuotas,total-monto_cuota*(p_cuotas-1),monto_cuota);
            INSERT INTO cuotas(venta_cuota_id,numero_cuota,monto,fecha_vencimiento,pagada,pagada_al_registrar,fecha_pago)
            VALUES(plan,i,monto,DATE_ADD(CURRENT_DATE,INTERVAL (i-1) MONTH),i=1,i=1,IF(i=1,CURRENT_DATE,NULL));
            SET cuota_id=LAST_INSERT_ID();
            IF i=1 THEN
                INSERT INTO cobros_cuotas_app(cuota_id,usuario_id,metodo_pago,marca_tarjeta,monto_base,monto_total)
                VALUES(cuota_id,p_usuario,medio,p_marca,monto,monto);
                INSERT INTO movimientos_caja(tipo,descripcion,monto,metodo_pago,referencia)
                VALUES('INGRESO',CONCAT('Cobro cuota #',cuota_id),monto,medio,CONCAT('cuota:',cuota_id));
            END IF;
            SET i=i+1;
        END WHILE;
    ELSEIF p_metodo='A cuenta' THEN
        INSERT INTO ventas_a_cuenta_app(venta_id,total,saldo_pendiente) VALUES(p_venta,total,total);
    ELSEIF p_metodo='Cheques' THEN
        INSERT INTO ventas_cheques_app(venta_id,cantidad_cheques) VALUES(p_venta,p_cheques);
        SET plan=LAST_INSERT_ID();
        SET i=1;
        WHILE i<=p_cheques DO
            INSERT INTO cheques_app(venta_cheques_id,numero_cheque,fecha_vencimiento)
            VALUES(plan,i,DATE_ADD(CURRENT_DATE,INTERVAL i MONTH));
            SET i=i+1;
        END WHILE;
    ELSE
        INSERT INTO movimientos_caja(tipo,descripcion,monto,metodo_pago,referencia)
        VALUES('INGRESO',CONCAT('Venta #',p_venta),total,p_metodo,CONCAT('venta:',p_venta));
    END IF;
    COMMIT;
END$$
DELIMITER ;
