require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

// Base de datos (Neon/PostgreSQL)
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde /public
app.use(express.static(path.join(__dirname, 'public')));

// =======================
// Rutas de API
// =======================

// Obtener todos los clientes
app.get('/api/clientes', async (req, res) => {
  try {
    const result = await db.query('SELECT nombre FROM clientes ORDER BY nombre');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Agregar nuevo cliente
app.post('/api/clientes', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  try {
    await db.query('INSERT INTO clientes (nombre) VALUES ($1) ON CONFLICT DO NOTHING', [nombre]);
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('❌ Error al agregar cliente:', error.message);
    console.error(error.stack); // <--- IMPORTANTE
    res.status(500).json({ error: 'No se pudo agregar cliente' });
  }
});



// Eliminar cliente por nombre
app.delete('/api/clientes/:nombre', async (req, res) => {
  const nombre = req.params.nombre;

  try {
    const result = await db.query('SELECT id FROM clientes WHERE nombre = $1', [nombre]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    const cliente_id = result.rows[0].id;

    await db.query('DELETE FROM productos WHERE etiqueta_id IN (SELECT id FROM etiquetas WHERE cliente_id = $1)', [cliente_id]);
    await db.query('DELETE FROM etiquetas WHERE cliente_id = $1', [cliente_id]);
    await db.query('DELETE FROM clientes WHERE id = $1', [cliente_id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error al eliminar cliente:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});



// Obtener etiquetas de un cliente
app.get('/api/etiquetas/:cliente', async (req, res) => {
  const cliente = req.params.cliente;
  try {
    const clienteResult = await db.query('SELECT id FROM clientes WHERE nombre = $1', [cliente]);
    if (clienteResult.rows.length === 0) return res.json([]);

    const cliente_id = clienteResult.rows[0].id;
    const etiquetasResult = await db.query(
      'SELECT * FROM etiquetas WHERE cliente_id = $1 ORDER BY id',
      [cliente_id]
    );

    const etiquetas = [];
    for (const etiqueta of etiquetasResult.rows) {
      const productosResult = await db.query(
        'SELECT qty, model, crown FROM productos WHERE etiqueta_id = $1 ORDER BY id',
        [etiqueta.id]
      );
      etiquetas.push({
        fecha: etiqueta.fecha,
        pallet: etiqueta.pallet,
        box: etiqueta.box,
        productos: productosResult.rows
      });
    }

    res.json(etiquetas);
  } catch (error) {
    console.error('Error al obtener etiquetas:', error);
    res.status(500).json({ error: 'Error al cargar etiquetas' });
  }
});

// Guardar (o reemplazar) etiquetas de un cliente
app.post('/api/etiquetas/:cliente', async (req, res) => {
  const cliente = req.params.cliente;
  const etiquetas = req.body;

  try {
    const clienteResult = await db.query('SELECT id FROM clientes WHERE nombre = $1', [cliente]);
    if (clienteResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cliente no encontrado' });
    }

    const cliente_id = clienteResult.rows[0].id;

    // Borrar etiquetas y productos existentes del cliente
    const etiquetasIdsResult = await db.query('SELECT id FROM etiquetas WHERE cliente_id = $1', [cliente_id]);
    const etiquetaIds = etiquetasIdsResult.rows.map(r => r.id);

    if (etiquetaIds.length > 0) {
      await db.query('DELETE FROM productos WHERE etiqueta_id = ANY($1)', [etiquetaIds]);
      await db.query('DELETE FROM etiquetas WHERE cliente_id = $1', [cliente_id]);
    }

    // Insertar nuevas etiquetas y productos
    for (const et of etiquetas) {
      const etiquetaRes = await db.query(
        'INSERT INTO etiquetas (cliente_id, fecha, pallet, box) VALUES ($1, $2, $3, $4) RETURNING id',
        [cliente_id, et.fecha, et.pallet, et.box]
      );
      const etiqueta_id = etiquetaRes.rows[0].id;

      for (const p of et.productos) {
        await db.query(
          'INSERT INTO productos (etiqueta_id, qty, model, crown) VALUES ($1, $2, $3, $4)',
          [etiqueta_id, p.qty, p.model, p.crown]
        );
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error al guardar etiquetas:', error);
    res.status(500).json({ error: 'Error al guardar etiquetas' });
  }
});

// =======================
// Iniciar servidor
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
