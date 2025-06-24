const express = require('express');
const router = express.Router();
const db = require('./db');

// Obtener todos los clientes
router.get('/clientes', async (req, res) => {
  const result = await db.query('SELECT * FROM clientes ORDER BY nombre');
  res.json(result.rows);
});

// Agregar cliente
router.post('/clientes', async (req, res) => {
  const { nombre } = req.body;
  await db.query('INSERT INTO clientes(nombre) VALUES($1) ON CONFLICT DO NOTHING', [nombre]);
  res.sendStatus(200);
});

// Eliminar cliente
router.delete('/clientes/:nombre', async (req, res) => {
  const nombre = req.params.nombre;
  const clienteIdRes = await db.query('SELECT id FROM clientes WHERE nombre = $1', [nombre]);
  const clienteId = clienteIdRes.rows[0]?.id;
  if (!clienteId) return res.sendStatus(404);

  await db.query('DELETE FROM productos WHERE etiqueta_id IN (SELECT id FROM etiquetas WHERE cliente_id = $1)', [clienteId]);
  await db.query('DELETE FROM etiquetas WHERE cliente_id = $1', [clienteId]);
  await db.query('DELETE FROM clientes WHERE id = $1', [clienteId]);

  res.sendStatus(200);
});

// Obtener etiquetas por cliente
router.get('/etiquetas/:cliente', async (req, res) => {
  const nombre = req.params.cliente;
  const clienteRes = await db.query('SELECT id FROM clientes WHERE nombre = $1', [nombre]);
  const clienteId = clienteRes.rows[0]?.id;
  if (!clienteId) return res.json([]);

  const etiquetasRes = await db.query('SELECT * FROM etiquetas WHERE cliente_id = $1', [clienteId]);
  const etiquetas = [];

  for (const et of etiquetasRes.rows) {
    const productosRes = await db.query('SELECT qty, model, crown FROM productos WHERE etiqueta_id = $1', [et.id]);
    etiquetas.push({
      fecha: et.fecha,
      pallet: et.pallet,
      box: et.box,
      productos: productosRes.rows
    });
  }

  res.json(etiquetas);
});

// Guardar etiquetas
router.post('/etiquetas/:cliente', async (req, res) => {
  const nombre = req.params.cliente;
  const etiquetas = req.body;

  const clienteRes = await db.query('SELECT id FROM clientes WHERE nombre = $1', [nombre]);
  const clienteId = clienteRes.rows[0]?.id;
  if (!clienteId) return res.sendStatus(404);

  await db.query('DELETE FROM productos WHERE etiqueta_id IN (SELECT id FROM etiquetas WHERE cliente_id = $1)', [clienteId]);
  await db.query('DELETE FROM etiquetas WHERE cliente_id = $1', [clienteId]);

  for (const etiqueta of etiquetas) {
    const resEtiqueta = await db.query(
      'INSERT INTO etiquetas(cliente_id, fecha, pallet, box) VALUES($1, $2, $3, $4) RETURNING id',
      [clienteId, etiqueta.fecha, etiqueta.pallet, etiqueta.box]
    );
    const etiquetaId = resEtiqueta.rows[0].id;

    for (const producto of etiqueta.productos) {
      await db.query(
        'INSERT INTO productos(etiqueta_id, qty, model, crown) VALUES($1, $2, $3, $4)',
        [etiquetaId, producto.qty, producto.model, producto.crown]
      );
    }
  }

  res.sendStatus(200);
});

module.exports = router;
