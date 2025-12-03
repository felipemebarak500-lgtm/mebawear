const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("db.sqlite");

db.run(
  `INSERT INTO users (username, password) VALUES ('admin', '1234')`,
  function (err) {
    if (err) {
      console.log("❌ Error insertando admin:", err.message);
    } else {
      console.log("✔ Usuario admin creado con éxito");
    }
    db.close();
  }
);
