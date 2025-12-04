// server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- BASE DE DATOS ----------
const dbPath = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al abrir la base de datos:', err.message);
  } else {
    console.log('✅ Base de datos SQLite conectada:', dbPath);
  }
});

// Crear tablas básicas si no existen
db.serialize(() => {
  // Usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      whatsapp TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Productos
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_cop INTEGER NOT NULL,
      image_url TEXT,
      category TEXT,
      is_available INTEGER DEFAULT 1
    )
  `);

  // Invitaciones
  db.run(`
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      used INTEGER DEFAULT 0,
      used_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME
    )
  `);

  // Compras
  db.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      product_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear usuario admin si no existe
  const adminUser = 'admin';
  const adminPass = 'baloo1221'; // ⚠️ recuerda cambiarlo luego a algo más seguro

  db.get(
    'SELECT id FROM users WHERE username = ?',
    [adminUser],
    (err, row) => {
      if (err) {
        console.error('Error comprobando admin:', err.message);
        return;
      }
      if (!row) {
        db.run(
          'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
          [adminUser, adminPass, 'admin'],
          (err2) => {
            if (err2) {
              console.error('Error creando admin por defecto:', err2.message);
            } else {
              console.log('✅ Usuario admin creado (admin / baloo1221)');
            }
          }
        );
      }
    }
  );
});

// ---------- CONFIGURACIÓN EXPRESS ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sesiones
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'mebawear-ultra-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2, // 2 horas
    },
  })
);

// Archivos estáticos (tu carpeta /public)
app.use(express.static(path.join(__dirname, 'public')));

// ---------- EMAIL (PARA NOTIFICAR COMPRAS) ----------
let mailerReady = false;
let transporter = null;

if (
  process.env.MAIL_HOST &&
  process.env.MAIL_PORT &&
  process.env.MAIL_USER &&
  process.env.MAIL_PASS &&
  process.env.MAIL_TO
) {
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT),
    secure: Number(process.env.MAIL_PORT) === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  transporter.verify((err) => {
    if (err) {
      console.error('❌ Error comprobando transporte de correo:', err);
    } else {
      mailerReady = true;
      console.log('📧 Transporte de correo listo.');
    }
  });
} else {
  console.log('📨 MAIL_* no configurado. Solo se hará console.log de las compras.');
}

// ---------- RUTAS DE PÁGINAS ----------
app.get('/', (req, res) => {
  // puedes cambiar esta lógica si quieres forzar login
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// ---------- AUTENTICACIÓN ----------
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, user) => {
      if (err) {
        console.error('Error en login:', err.message);
        return res.status(500).json({ ok: false, message: 'Error interno' });
      }
      if (!user) {
        return res
          .status(401)
          .json({ ok: false, message: 'Usuario o contraseña incorrectos' });
      }

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;

      res.json({ ok: true, role: user.role });
    }
  );
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Registro con código de invitación
app.post('/register', (req, res) => {
  const { username, password, whatsapp, invite_code } = req.body;

  if (!invite_code) {
    return res
      .status(400)
      .json({ ok: false, message: 'Se requiere un código de invitación.' });
  }

  db.get(
    'SELECT * FROM invites WHERE code = ? AND used = 0',
    [invite_code],
    (err, invite) => {
      if (err) {
        console.error('Error consultando invitación:', err.message);
        return res.status(500).json({ ok: false, message: 'Error interno' });
      }

      if (!invite) {
        return res
          .status(400)
          .json({ ok: false, message: 'Código de invitación inválido o usado.' });
      }

      // Comprobar que el usuario no exista
      db.get(
        'SELECT id FROM users WHERE username = ?',
        [username],
        (err2, existing) => {
          if (err2) {
            console.error('Error comprobando usuario:', err2.message);
            return res.status(500).json({ ok: false, message: 'Error interno' });
          }

          if (existing) {
            return res
              .status(400)
              .json({ ok: false, message: 'Ese usuario ya existe.' });
          }

          db.run(
            'INSERT INTO users (username, password, whatsapp) VALUES (?, ?, ?)',
            [username, password, whatsapp || null],
            function (err3) {
              if (err3) {
                console.error('Error creando usuario:', err3.message);
                return res
                  .status(500)
                  .json({ ok: false, message: 'No se pudo crear el usuario.' });
              }

              const newUserId = this.lastID;

              db.run(
                'UPDATE invites SET used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newUserId, invite.id],
                (err4) => {
                  if (err4) {
                    console.error('Error actualizando invitación:', err4.message);
                  }
                  res.json({ ok: true, message: 'Cuenta creada correctamente.' });
                }
              );
            }
          );
        }
      );
    }
  );
});

// ---------- API DE PRODUCTOS ----------

// Obtener solo productos disponibles
app.get('/api/products', (req, res) => {
  db.all(
    'SELECT id, name, description, price_cop, image_url, category, is_available FROM products',
    (err, rows) => {
      if (err) {
        console.error('Error obteniendo productos:', err.message);
        return res.status(500).json({ ok: false, message: 'Error interno' });
      }
      res.json(rows);
    }
  );
});

// Confirmar compra de un producto
app.post('/api/purchase', (req, res) => {
  const { productId } = req.body;
  const userId = req.session.userId || null;
  const username = req.session.username || 'Invitado';

  if (!productId) {
    return res
      .status(400)
      .json({ ok: false, message: 'Falta el ID del producto.' });
  }

  db.serialize(() => {
    // Asegurarse de que sigue disponible
    db.get(
      'SELECT * FROM products WHERE id = ?',
      [productId],
      (err, product) => {
        if (err) {
          console.error('Error buscando producto:', err.message);
          return res.status(500).json({ ok: false, message: 'Error interno' });
        }

        if (!product) {
          return res
            .status(404)
            .json({ ok: false, message: 'Producto no encontrado.' });
        }

        if (product.is_available === 0) {
          return res
            .status(400)
            .json({ ok: false, message: 'Este producto ya no está disponible.' });
        }

        // Marcar como no disponible
        db.run(
          'UPDATE products SET is_available = 0 WHERE id = ?',
          [productId],
          function (err2) {
            if (err2) {
              console.error('Error actualizando producto:', err2.message);
              return res
                .status(500)
                .json({ ok: false, message: 'No se pudo completar la compra.' });
            }

            // Registrar compra
            db.run(
              'INSERT INTO purchases (user_id, product_id) VALUES (?, ?)',
              [userId, productId],
              (err3) => {
                if (err3) {
                  console.error('Error registrando compra:', err3.message);
                }
              }
            );

            // Enviar correo al dueño de la tienda (si está configurado)
            const msg = `
Nueva compra en Mebawear:

Usuario: ${username} (ID: ${userId ?? 'sin sesión'})
Producto: ${product.name}
Precio: $${product.price_cop.toLocaleString('es-CO')} COP
            `;

            if (mailerReady) {
              transporter.sendMail(
                {
                  from: process.env.MAIL_USER,
                  to: process.env.MAIL_TO,
                  subject: `Nueva compra - ${product.name}`,
                  text: msg,
                },
                (errMail) => {
                  if (errMail) {
                    console.error('Error enviando correo de compra:', errMail);
                  } else {
                    console.log('📧 Correo de compra enviado correctamente');
                  }
                }
              );
            } else {
              console.log('📦 Compra registrada (sin correo):\n', msg);
            }

            res.json({
              ok: true,
              message:
                'Gracias por tu compra. Nos pondremos en contacto contigo por WhatsApp.',
            });
          }
        );
      }
    );
  });
});

// ---------- INICIAR SERVIDOR ----------
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
