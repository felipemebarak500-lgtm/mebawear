// server.js
// Backend para Mebawear – usando better-sqlite3 (compatible con Render)

const express = require("express");
const path = require("path");
const session = require("express-session");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3"); // <-- reemplaza sqlite3

// ------------------ CONFIG BÁSICA ------------------
const app = express();
const PORT = process.env.PORT || 3000;

// Base de datos SQLite
const db = new Database(path.join(__dirname, "db.sqlite"));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Sesiones (para login)
app.use(
  session({
    secret: "mebawear_super_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

// Rutas estáticas
app.use(express.static(path.join(__dirname, "public")));

// ------------------ TABLAS ------------------
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    email TEXT,
    phone TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    used INTEGER DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER,
    description TEXT,
    category TEXT,
    image TEXT,
    is_available INTEGER DEFAULT 1
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    product_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Semilla básica de productos (siempre habrá solo 2)
const countProducts = db.prepare("SELECT COUNT(*) as c FROM products").get().c;
if (countProducts === 0) {
  const insertProd = db.prepare(`
    INSERT INTO products (name, price, description, category, image, is_available)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  insertProd.run(
    "Hoodie negro/oro Edición Limitada",
    390000,
    "Buzo premium en tela gruesa, bordado dorado de alta calidad y triángulo azul celeste distintivo.",
    "Hoodies",
    "/img/hoodie_oro.png"
  );

  insertProd.run(
    "Gorra negro/oro IMI Edición Limitada",
    230000,
    "Gorra negra con bordado dorado IMI, edición especial limitada.",
    "Gorras",
    "/img/gorra_oro.png"
  );

  console.log("✔ Productos iniciales creados");
}

// Semilla de invitación de ejemplo (para que puedas probar)
const countInvites = db.prepare("SELECT COUNT(*) as c FROM invites").get().c;
if (countInvites === 0) {
  db.prepare("INSERT INTO invites (code, used) VALUES (?, 0)").run("INVITE-MEBA-001");
  console.log("✔ Código de invitación inicial: INVITE-MEBA-001");
}

// ------------------ MIDDLEWARE DE SESIÓN ------------------
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  next();
}

// ------------------ RUTAS DE VISTAS ------------------

// Siempre que entren a / se va al login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Protegemos index.html para que solo se vea logueado
app.get("/index.html", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Registro por invitación (página)
app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

// ------------------ AUTENTICACIÓN ------------------

// POST /login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  try {
    const stmt = db.prepare(
      "SELECT * FROM users WHERE username = ? AND password = ?"
    );
    const user = stmt.get(username, password);

    if (!user) {
      return res.status(401).send("Usuario o contraseña incorrectos");
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
    };

    return res.redirect("/index.html");
  } catch (err) {
    console.error("❌ Error en /login:", err);
    return res.status(500).send("Error interno");
  }
});

// GET /logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

// POST /register (con código de invitación)
app.post("/register", (req, res) => {
  const { username, password, email, phone, invite_code } = req.body;

  try {
    // Verificamos el código de invitación
    const invite = db
      .prepare("SELECT * FROM invites WHERE code = ? AND used = 0")
      .get(invite_code);

    if (!invite) {
      return res.status(400).send("Código de invitación no válido o ya usado.");
    }

    const insertUser = db.prepare(`
      INSERT INTO users (username, password, email, phone)
      VALUES (?, ?, ?, ?)
    `);

    insertUser.run(username, password, email, phone);

    // Marcamos la invitación como usada
    db.prepare("UPDATE invites SET used = 1 WHERE id = ?").run(invite.id);

    res.redirect("/login.html");
  } catch (err) {
    console.error("❌ Error en /register:", err);
    if (String(err).includes("UNIQUE constraint failed")) {
      return res.status(400).send("Ese usuario ya existe.");
    }
    return res.status(500).send("Error interno.");
  }
});

// ------------------ API DE PRODUCTOS ------------------

// Obtener productos disponibles
app.get("/api/products", (req, res) => {
  try {
    const rows = db
      .prepare("SELECT * FROM products WHERE is_available = 1")
      .all();
    res.json(rows);
  } catch (err) {
    console.error("❌ Error en GET /api/products:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// Obtener todos los productos (ej. para panel admin, si luego lo necesitas)
app.get("/api/products/all", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM products").all();
    res.json(rows);
  } catch (err) {
    console.error("❌ Error en GET /api/products/all:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// ------------------ COMPRA DE PRODUCTO ------------------

// POST /api/purchase
app.post("/api/purchase", (req, res) => {
  const { productId } = req.body;
  const userSession = req.session.user;

  if (!userSession) {
    return res.status(401).json({ error: "No has iniciado sesión." });
  }

  try {
    const product = db
      .prepare("SELECT * FROM products WHERE id = ?")
      .get(productId);

    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado." });
    }

    if (product.is_available === 0) {
      return res
        .status(400)
        .json({ error: "Este producto ya no está disponible." });
    }

    const update = db.prepare(
      "UPDATE products SET is_available = 0 WHERE id = ? AND is_available = 1"
    );
    const result = update.run(productId);

    if (result.changes === 0) {
      return res
        .status(400)
        .json({ error: "Este producto ya fue comprado por otro usuario." });
    }

    db.prepare(
      "INSERT INTO purchases (user_id, product_id) VALUES (?, ?)"
    ).run(userSession.id, productId);

    // Si más adelante configuramos SMTP, aquí dispararemos el correo
    console.log(
      `📩 Nueva compra: usuario ${userSession.username} (id=${userSession.id}) compró producto ${product.name} (id=${product.id})`
    );

    return res.json({
      success: true,
      message:
        "Gracias por tu compra. Pronto el dueño de la tienda se pondrá en contacto contigo por WhatsApp.",
    });
  } catch (err) {
    console.error("❌ Error en POST /api/purchase:", err);
    return res.status(500).json({ error: "Error interno." });
  }
});

// ------------------ ARRANQUE ------------------
app.listen(PORT, () => {
  console.log(`✅ Servidor Mebawear escuchando en http://localhost:${PORT}`);
});
