// ============================================================
// File: server/index.js
// Kaam: Express server start karna, database connect karna,
//       auth routes mount karna aur client/ ki static files serve karna.
// ============================================================

// .env ke variables (jaise PORT) load karta hai. Sabse upar rakhna zaroori hai.
require("dotenv").config();

const path = require("path");
const express = require("express");

// db.js ko import karte hi database connect ho jaata hai aur
// users table ban jaati hai (db.js ke andar ka code chal jaata hai).
require("./db");

// Auth routes wali file import (register, login, logout).
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 5000;

// client folder ka absolute path.
const CLIENT_DIR = path.join(__dirname, "..", "client");

// ------------------------------------------------------------
// Middleware (har request ke beech me chalne wale helpers)
// ------------------------------------------------------------

// express.json(): jab frontend JSON body bhejta hai (Content-Type: application/json),
// ye usse padh ke JavaScript object bana deta hai aur req.body me rakh deta hai.
// Iske bina req.body undefined hota.
app.use(express.json());

// HTML form ka urlencoded data samajhne ke liye.
app.use(express.urlencoded({ extended: true }));

// client/ folder ki files (HTML, CSS, JS) seedhe browser ko do.
app.use(express.static(CLIENT_DIR));

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

// Root route: http://localhost:5000 par index.html bhejo.
app.get("/", (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

// Health check: server chal raha hai ya nahi.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Auth routes ko "/api/auth" ke neeche mount karna.
// Matlab auth.js ka "/login" ab milega "/api/auth/login" par.
// Ye line 404 wale handler se PEHLE honi chahiye, warna har auth request 404 ho jaayegi.
app.use("/api/auth", authRoutes);

// Koi bhi galat /api/... route hit kare to 404 JSON error.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// ------------------------------------------------------------
// Global error handler (4 parameters wala function error handler hota hai)
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  // Agar client ne kharab/invalid JSON bheja to express.json() error deta hai.
  // Ye client ki galti hai, isliye 400 bhejte hain, 500 nahi.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in request body." });
  }

  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ------------------------------------------------------------
// Server start
// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});