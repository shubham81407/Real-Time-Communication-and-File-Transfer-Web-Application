const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbDir = path.join(__dirname, '../database');
fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'chat.db');
const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) return reject(err);
    resolve({ lastID: this.lastID, changes: this.changes });
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row);
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows || []);
  });
});

const ensureColumn = (tableName, columnName, definition) => {
  db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
    if (err) {
      console.error(`[DB Migration] Failed to inspect ${tableName}:`, err.message);
      return;
    }
    const exists = rows.some((row) => row.name === columnName);
    if (!exists) {
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  });
};

const ensureTokenVersionColumn = () => {
  db.all('PRAGMA table_info(users)', (err, rows) => {
    if (err) {
      console.error('[DB Migration] Unable to inspect users table:', err.message);
      return;
    }

    const exists = rows.some((row) => row.name === 'token_version');
    if (!exists) {
      db.run('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1', (alterErr) => {
        if (alterErr) {
          console.error('[DB Migration] Failed to add token_version column:', alterErr.message);
          return;
        }

        db.run('UPDATE users SET token_version = 1 WHERE token_version IS NULL', (updateErr) => {
          if (updateErr) {
            console.error('[DB Migration] Failed to initialize existing user token versions:', updateErr.message);
          }
        });
      });
      return;
    }

    db.run('UPDATE users SET token_version = 1 WHERE token_version IS NULL', (updateErr) => {
      if (updateErr) {
        console.error('[DB Migration] Failed to normalize existing user token versions:', updateErr.message);
      }
    });
  });
};

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  )`);

    // 3. Groups table
  db.run(`CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  // 4. Group Members table
  db.run(`CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY(group_id, user_id),
    FOREIGN KEY(group_id) REFERENCES groups(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // 5. Group Messages table
  db.run(`CREATE TABLE IF NOT EXISTS group_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(group_id) REFERENCES groups(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  )`);

  // File transfer support ke liye optional columns ensure karna
  ensureColumn('messages', 'file_url', 'TEXT DEFAULT NULL');
  ensureColumn('messages', 'file_name', 'TEXT DEFAULT NULL');
  ensureColumn('group_messages', 'file_url', 'TEXT DEFAULT NULL');
  ensureColumn('group_messages', 'file_name', 'TEXT DEFAULT NULL');

  ensureTokenVersionColumn();
});

module.exports = { db, run, get, all };