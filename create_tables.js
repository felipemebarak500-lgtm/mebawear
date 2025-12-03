const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("db.sqlite");

db.run(
  `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`,
  function (err) {
    if (err) {
      console.log("❌ Error creando tabla:", err.message);
    } else {
      console.log("✔ Tabla USERS creada o ya existente");
    }
    db.close();
  }
);
