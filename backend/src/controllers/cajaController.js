const pool = require("../config/db");

const obtenerCajaDiaria = async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        metodo_pago,
        COALESCE(SUM(monto), 0) AS total
      FROM movimientos_caja
      WHERE DATE(fecha) = CURRENT_DATE
      GROUP BY metodo_pago
    `);

    const movimientos = await pool.query(`
      SELECT *
      FROM movimientos_caja
      WHERE DATE(fecha) = CURRENT_DATE
      ORDER BY id DESC
    `);

    const sesion = await pool.query(
      "SELECT * FROM caja_sesiones_app WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1"
    );

    res.json({
      resumen: resultado.rows,
      movimientos: movimientos.rows,
      sesion: sesion.rows[0] || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo caja diaria" });
  }
};

const abrirCaja = async (req, res) => {
  try {
    const saldoInicial = Number(req.body.saldo_inicial);
    if (!Number.isFinite(saldoInicial) || saldoInicial < 0) {
      return res.status(400).json({ mensaje: "Saldo inicial inválido" });
    }
    const abierta = await pool.query(
      "SELECT id FROM caja_sesiones_app WHERE estado = 'ABIERTA' LIMIT 1"
    );
    if (abierta.rowCount) {
      return res.status(409).json({ mensaje: "Ya existe una caja abierta" });
    }
    const resultado = await pool.query(
      `INSERT INTO caja_sesiones_app (usuario_apertura_id, saldo_inicial)
       VALUES ($1, $2) RETURNING *`,
      [req.usuario.id, saldoInicial]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error abriendo caja" });
  }
};

const cerrarCaja = async (req, res) => {
  const client = await pool.connect();
  try {
    const saldoContado = Number(req.body.saldo_contado);
    if (!Number.isFinite(saldoContado) || saldoContado < 0) {
      return res.status(400).json({ mensaje: "Saldo contado inválido" });
    }
    await client.query("BEGIN");
    const sesion = await client.query(
      "SELECT * FROM caja_sesiones_app WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1 FOR UPDATE"
    );
    if (!sesion.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ mensaje: "No hay una caja abierta" });
    }
    const movimientos = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN tipo = 'INGRESO' THEN monto ELSE -monto END), 0) total
       FROM movimientos_caja
       WHERE fecha >= $1`,
      [sesion.rows[0].fecha_apertura]
    );
    const esperado =
      Number(sesion.rows[0].saldo_inicial) + Number(movimientos.rows[0].total);
    const diferencia = saldoContado - esperado;
    const resultado = await client.query(
      `UPDATE caja_sesiones_app
       SET usuario_cierre_id = $1, saldo_esperado = $2, saldo_contado = $3,
           diferencia = $4, fecha_cierre = CURRENT_TIMESTAMP, estado = 'CERRADA'
       WHERE id = $5 RETURNING *`,
      [req.usuario.id, esperado, saldoContado, diferencia, sesion.rows[0].id]
    );
    await client.query("COMMIT");
    res.json(resultado.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ mensaje: "Error cerrando caja" });
  } finally {
    client.release();
  }
};

module.exports = {
  obtenerCajaDiaria,
  abrirCaja,
  cerrarCaja,
};
