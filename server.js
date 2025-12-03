// server.js - MebaWear / Meba tienda exclusiva
// Listo para Render (usa process.env.PORT) y SQLite

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const nodemailer = require("nodemailer");

const app = express();

// -------------------- CONFIG BÁSICA --------------------

// DB en archivo local
const db = new sqlite3.Database("db.sqlite");

// Body parsers
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Sesiones (MemoryStore, suficiente para proyecto pequeño)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "meba-secret-session",
    resave: false,
    saveUninitialized: false,
  })
);

// Rutas estáticas: TODO el proyecto está en la misma carpeta
// (index.html, login.html, styles.css, img/, etc.)
app.use("/img", express.static(path.join(__dirname, "img")));
app.use("/favicon.ico", express.static(path.join(__dirname, "favicon.ico")));
app.use("/static", express.static(__dirname)); // por si tienes rutas relativas raras

// -------------------- MIDDLEWARES --------------------

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login.html");
  }
  next();
}

// -------------------- INICIALIZACIÓN DB --------------------

db.serialize(() => {
  // Tabla de usuarios
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      email TEXT,
      phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // Tabla de invitaciones (registro solo con código)
  db.run(
    `CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      used INTEGER DEFAULT 0,
      used_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // Tabla de productos
  db.run(
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      price_cop INTEGER,
      description TEXT,
      category TEXT,
      image TEXT,
      is_available INTEGER DEFAULT 1
    )`
  );

  // Tabla de compras
  db.run(
    `CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      product_id INTEGER,
      status TEXT DEFAULT 'confirmada',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // Crear admin si no existe
  db.get(
    "SELECT id FROM users WHERE username = ?",
    ["admin"],
    (err, row) => {
      if (err) {
        console.error("Error verificando admin:", err);
        return;
      }
      if (!row) {
        db.run(
          "INSERT INTO users (username, password, email, phone) VALUES (?, ?, ?, ?)",
          ["admin", "baloo1221", "admin@mebawear.com", "0000000000"],
          (e) => {
            if (e) {
              console.error("Error creando admin:", e);
            } else {
              console.log("✔ Usuario admin creado (admin / baloo1221)");
            }
          }
        );
      } else {
        console.log("✔ Admin ya existe");
      }
    }
  );

  // Crear invitaciones si no hay
  db.all("SELECT code FROM invites", (err, rows) => {
    if (err) {
      console.error("Error leyendo invites:", err);
      return;
    }
    if (!rows || rows.length === 0) {
      const invites = ["MEBA-ALPHA-01", "MEBA-BETA-02"];
      const stmt = db.prepare("INSERT INTO invites (code) VALUES (?)");
      invites.forEach((code) => stmt.run(code));
      stmt.finalize();
      console.log("✔ Invites creados:", invites.join(", "));
    } else {
      console.log(`✔ INVITES ya tiene ${rows.length} códigos.`);
    }
  });

  // Crear productos si no hay
  db.all("SELECT id FROM products", (err, rows) => {
    if (err) {
      console.error("Error leyendo productos:", err);
      return;
    }
    if (!rows || rows.length === 0) {
      const stmt = db.prepare(
        "INSERT INTO products (name, price_cop, description, category, image, is_available) VALUES (?, ?, ?, ?, ?, ?)"
      );

      // Hoodie
      stmt.run(
        "Hoodie negro/oro Edición Limitada",
        390000,
        "Buzo premium en tela gruesa, bordado dorado de alta calidad y triángulo azul celeste distintivo.",
        "Hoodies",
        "/img/hoodie_oro.png",
        1
      );

      // Gorra
      stmt.run(
        "Gorra negro/oro IMI Edición Limitada",
        230000,
        "Gorra exclusiva negra con detalles dorados IMI, pensada para drops de edición limitada.",
        "Gorras",
        "/img/gorra_oro.png",
        1
      );

      stmt.finalize();
      console.log("✔ PRODUCTS iniciales creados (hoodie + gorra).");
    } else {
      console.log(`✔ PRODUCTS ya tiene ${rows.length} productos.`);
    }
  });

  // Contar usuarios
  db.all("SELECT id FROM users", (err, rows) => {
    if (!err && rows) {
      console.log(`✔ USERS ya tiene ${rows.length} usuarios.`);
    }
  });
});

// -------------------- EMAIL (OPCIONAL) --------------------

let mailTransport = null;

function setupMail() {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = process.env;
  if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASS) {
    console.log(
      "ℹ No se configuró MAIL_HOST/PORT/USER/PASS. No se enviarán correos, solo se registrarán en logs."
    );
    return;
  }

  mailTransport = nodemailer.createTransport({
    host: MAIL_HOST,
    port: Number(MAIL_PORT),
    secure: false,
    auth: {
      user: MAIL_USER,
      pass: MAIL_PASS,
    },
  });

  mailTransport.verify((err, ok) => {
    if (err) {
      console.error("❌ Error verificando transporte de correo:", err);
      mailTransport = null;
    } else {
      console.log("✔ Transporte de correo listo.");
    }
  });
}

setupMail();

function sendPurchaseEmail({ user, product, purchaseId }) {
  const to = process.env.MAIL_TO || process.env.MAIL_USER;

  if (!mailTransport || !to) {
    console.log(
      "ℹ Compra registrada, pero MAIL_* no está configurado. No se envió correo.",
      { user, product, purchaseId }
    );
    return;
  }

  const subject = `Nueva compra en MebaWear: ${product.name}`;
  const text = `
Nueva compra confirmada en MebaWear.

Usuario:
- ID: ${user.id}
- Usuario: ${user.username}
- Email: ${user.email || "N/A"}
- Teléfono: ${user.phone || "N/A"}

Producto:
- ID: ${product.id}
- Nombre: ${product.name}
- Precio: $${product.price_cop.toLocaleString("es-CO")} COP

ID de compra: ${purchaseId}
`;

  mailTransport.sendMail(
    {
      from: `MebaWear <${process.env.MAIL_USER}>`,
      to,
      subject,
      text,
    },
    (err, info) => {
      if (err) {
        console.error("❌ Error enviando correo de compra:", err);
      } else {
        console.log("✔ Correo de compra enviado:", info.messageId);
      }
    }
  );
}

// -------------------- RUTAS DE VISTAS --------------------

// Siempre que alguien vaya a "/", lo mandamos al login
app.get("/", (req, res) => {
  return res.redirect("/login.html");
});

// Proteger index (home) para que solo entre logueado
app.get("/index.html", requireAuth, (req, res) => {
  return res.sendFile(path.join(__dirname, "index.html"));
});

// Registro solo con invitación (vista)
app.get("/register.html", (req, res) => {
  return res.sendFile(path.join(__dirname, "register.html"));
});

// Login (vista)
app.get("/login.html", (req, res) => {
  return res.sendFile(path.join(__dirname, "login.html"));
});

// Servir el resto de archivos estáticos (styles.css, script.js, etc.)
app.use(express.static(__dirname));

// -------------------- RUTAS DE AUTENTICACIÓN --------------------

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send("Faltan datos.");
  }

  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, user) => {
      if (err) {
        console.error("❌ Error DB en login:", err);
        return res.status(500).send("Error interno.");
      }

      if (!user) {
        return res
          .status(401)
          .send("Usuario o contraseña incorrectos. Inténtalo de nuevo.");
      }

      // Guardar datos mínimos en sesión
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.email = user.email;
      req.session.phone = user.phone;

      console.log("✔ Login correcto:", user.username);
      return res.redirect("/index.html");
    }
  );
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

// Registro con invitación
app.post("/register", (req, res) => {
  const { username, password, email, phone, inviteCode } = req.body;

  if (!username || !password || !inviteCode) {
    return res.status(400).send("Faltan datos obligatorios.");
  }

  db.get(
    "SELECT code, used FROM invites WHERE code = ?",
    [inviteCode],
    (err, invite) => {
      if (err) {
        console.error("❌ Error buscando invitación:", err);
        return res.status(500).send("Error interno.");
      }

      if (!invite) {
        return res.status(400).send("Código de invitación inválido.");
      }

      if (invite.used) {
        return res.status(400).send("Este código de invitación ya fue usado.");
      }

      // Crear usuario
      db.run(
        "INSERT INTO users (username, password, email, phone) VALUES (?, ?, ?, ?)",
        [username, password, email || null, phone || null],
        function (err2) {
          if (err2) {
            if (err2.message.includes("UNIQUE")) {
              return res
                .status(400)
                .send("Ese nombre de usuario ya está en uso.");
            }
            console.error("❌ Error creando usuario:", err2);
            return res.status(500).send("Error interno.");
          }

          const newUserId = this.lastID;

          // Marcar invitación como usada
          db.run(
            "UPDATE invites SET used = 1, used_by = ? WHERE code = ?",
            [newUserId, inviteCode],
            (err3) => {
              if (err3) {
                console.error(
                  "❌ Error marcando invitación como usada:",
                  err3
                );
              }
              console.log(
                `✔ Nuevo usuario registrado (${username}) con código ${inviteCode}`
              );
              return res.redirect("/login.html");
            }
          );
        }
      );
    }
  );
});

// -------------------- API DE PRODUCTOS --------------------

// Lista de productos disponibles
app.get("/api/products", (req, res) => {
  db.all(
    "SELECT id, name, price_cop, description, category, image, is_available FROM products",
    (err, rows) => {
      if (err) {
        console.error("❌ Error leyendo productos:", err);
        return res.status(500).json({ error: "Error interno" });
      }
      res.json(rows);
    }
  );
});

// Compra de producto (deshabilita producto y registra compra)
app.post("/api/purchase", requireAuth, (req, res) => {
  const { productId } = req.body;
  const userId = req.session.userId;

  if (!productId) {
    return res.status(400).json({ error: "Falta productId" });
  }

  // Verificar que el producto existe y está disponible
  db.get(
    "SELECT * FROM products WHERE id = ?",
    [productId],
    (err, product) => {
      if (err) {
        console.error("❌ Error buscando producto:", err);
        return res.status(500).json({ error: "Error interno" });
      }

      if (!product) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      if (!product.is_available) {
        return res
          .status(400)
          .json({ error: "Este producto ya no está disponible." });
      }

      // Insertar compra
      db.run(
        "INSERT INTO purchases (user_id, product_id, status) VALUES (?, ?, ?)",
        [userId, productId, "confirmada"],
        function (err2) {
          if (err2) {
            console.error("❌ Error registrando compra:", err2);
            return res.status(500).json({ error: "Error interno" });
          }

          const purchaseId = this.lastID;

          // Deshabilitar producto
          db.run(
            "UPDATE products SET is_available = 0 WHERE id = ?",
            [productId],
            (err3) => {
              if (err3) {
                console.error("❌ Error deshabilitando producto:", err3);
              }

              // Obtener datos del usuario para el correo
              db.get(
                "SELECT id, username, email, phone FROM users WHERE id = ?",
                [userId],
                (err4, user) => {
                  if (err4) {
                    console.error("❌ Error leyendo usuario para correo:", err4);
                  } else if (user) {
                    // Enviar correo (si está configurado)
                    sendPurchaseEmail({
                      user,
                      product,
                      purchaseId,
                    });
                  }

                  console.log(
                    `✔ Compra confirmada. Usuario ${userId} compró producto ${productId} (compra #${purchaseId}).`
                  );

                  return res.json({
                    ok: true,
                    message:
                      "Gracias por tu compra. El producto ha sido reservado para ti y ya no aparece disponible.",
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

// -------------------- ARRANQUE DEL SERVIDOR --------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
