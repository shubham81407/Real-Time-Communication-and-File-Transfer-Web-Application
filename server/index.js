// ============================================================
// File: server/index.js
// Kaam: Express server start karna aur client/ folder ki
//       static files (HTML, CSS, JS) browser ko serve karna.
// ============================================================

// dotenv .env file ke variables (jaise PORT) ko process.env me load karta hai.
// Ye line sabse upar honi chahiye, taaki neeche PORT padh sakein.
require("dotenv").config();

// "path" Node ka built-in module hai. Isse hum folder paths safely bana sakte hain
// (Windows me \ aur Mac/Linux me / hota hai, path.join dono handle kar leta hai).
const path = require("path");

// Express library import kar rahe hain jo web server banane me help karti hai.
const express = require("express");

// app = hamara Express application. Saare routes aur middleware isi par lagte hain.
const app = express();

// PORT .env se aayega. Agar .env me nahi mila to 5000 use hoga.
const PORT = process.env.PORT || 5000;

// client folder ka poora (absolute) path.
// __dirname = abhi wali file (server/) ka folder, ".." ka matlab ek folder upar (cn_project/).
const CLIENT_DIR = path.join(__dirname, "..", "client");

// ------------------------------------------------------------
// Middleware (har request ke beech me chalne wale helpers)
// ------------------------------------------------------------

// Ye JSON body ko samajhta hai (jab frontend fetch se JSON bhejega - aage ke phases me kaam aayega).
app.use(express.json());

// Ye HTML form ke data (urlencoded) ko samajhta hai.
app.use(express.urlencoded({ extended: true }));

// express.static: client/ folder ki files seedhe browser ko de deta hai.
// Isliye /css/style.css aur /js/app.js browser ko mil jaate hain.
app.use(express.static(CLIENT_DIR));

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

// Root route "/" : jab koi http://localhost:5000 kholega to index.html bheji jayegi.
// (express.static bhi ye kar deta hai, par hum clearly likh rahe hain taaki viva me explain kar sakein.)
app.get("/", (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

// Health check route: check karne ke liye ki server zinda hai ya nahi.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Agar koi galat /api/... route hit kare to 404 JSON error milega.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// ------------------------------------------------------------
// Global error handler (4 parameters wala function Express me error handler hota hai)
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ------------------------------------------------------------
// Server ko start karna
// ------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});