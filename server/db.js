// ============================================================
// File: server/db.js
// Kaam: SQLite database se connection banana aur "users" table
//       apne aap create karna (agar pehle se nahi hai).
// SQLite ek chhota database hai jo ek single file (chat.db) me
// saara data rakhta hai. Alag se database server install nahi karna padta.
// ============================================================

// "path" aur "fs" Node ke built-in modules hain (install nahi karne).
// path = folder paths banane ke liye, fs = files/folders check ya create karne ke liye.
const path = require("path");
const fs = require("fs");

// sqlite3 library import. .verbose() lagane se error aane par
// zyada detail (stack trace) milti hai, debugging me aasaani hoti hai.
const sqlite3 = require("sqlite3").verbose();

// database/ folder ka path aur uske andar chat.db file ka path.
// __dirname = server/ folder, ".." = ek folder upar (cn_project/).
const DB_DIR = path.join(__dirname, "..", "database");
const DB_PATH = path.join(DB_DIR, "chat.db");

// Agar database/ folder nahi hai to bana do.
// recursive: true ka matlab agar folder pehle se ho to error na de.
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Database se connect karo. Agar chat.db file nahi hai to SQLite khud bana deta hai.
// Callback function me err aaya to connection fail hua.
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Database connect nahi hua:", err.message);
    // Bina database ke app chalane ka koi fayda nahi, isliye band kar do.
    process.exit(1);
  }
  console.log("SQLite database connected:", DB_PATH);
});

// db.serialize(): andar ke queries ek ke baad ek (order me) chalte hain.
db.serialize(() => {
  // Foreign key rules ON karna (aage ke phases me messages table ke liye kaam aayega).
  db.run("PRAGMA foreign_keys = ON");

  // users table banao agar pehle se nahi hai ("IF NOT EXISTS").
  // Columns ka matlab:
  //   id            : har user ka unique number, apne aap badhta hai (AUTOINCREMENT)
  //   username      : unique hona chahiye. COLLATE NOCASE = "Rahul" aur "rahul" same maane jaayenge
  //   email         : unique hona chahiye
  //   password_hash : password ka hash (asli password kabhi store nahi karte!)
  //   created_at    : account kab bana, default abhi ka time
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    (err) => {
      if (err) {
        console.error("users table nahi ban payi:", err.message);
        process.exit(1);
      }
      console.log("users table ready.");
    }
  );
});

// ------------------------------------------------------------
// Helper functions
// sqlite3 callback-style me kaam karta hai. Hum usse Promise me
// lapet dete hain taaki baaki code me async/await use kar sakein
// (code padhne me saaf rehta hai).
// "?" placeholders ka fayda: user ka data SQL se alag jaata hai,
// isse SQL Injection attack nahi ho paata.
// ------------------------------------------------------------

// run(): INSERT / UPDATE / DELETE ke liye. lastID = naye row ka id.
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    // Yahan arrow function nahi, normal function use kiya kyunki
    // "this.lastID" sirf normal function me milta hai.
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// get(): SELECT se sirf ek row chahiye ho (nahi mili to undefined).
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// all(): SELECT se saari matching rows chahiye ho (array milta hai).
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Ctrl + C dabane par database connection ko saaf tareeke se band karo.
process.on("SIGINT", () => {
  db.close(() => {
    console.log("\nDatabase connection closed.");
    process.exit(0);
  });
});

// Dusri files (jaise routes/auth.js) ye cheezein import kar sakengi.
module.exports = { db, run, get, all };