// ============================================================
// File: server/routes/auth.js
// Kaam: Authentication ke 3 API endpoints:
//   POST /api/auth/register  -> naya account banana
//   POST /api/auth/login     -> login karna
//   POST /api/auth/logout    -> logout acknowledge karna
// ============================================================

const express = require("express");
const jwt = require("jsonwebtoken");

// bcryptjs: password ko hash karne aur compare karne ke liye.
// (Pure JavaScript hai, isliye Windows par install me dikkat nahi aati.)
const bcrypt = require("bcryptjs");

// db.js se wo helper functions jo humne banaye the.
const { get, run } = require("../db");
const { authenticateToken, verifyTokenString } = require("../middleware/auth");

// Router = chhota mini-Express app. Isme routes bana ke index.js me
// "/api/auth" ke neeche mount kar denge. Matlab yahan "/register" likhne par
// asli URL banega "/api/auth/register".
const router = express.Router();

// Salt rounds: bcrypt hashing kitni baar repeat karega (2^10 = 1024 rounds).
// Number zyada = zyada secure par slow. 10 ek achha standard value hai.
const SALT_ROUNDS = 10;

// Validation ke rules (Regular Expressions):
// Username: sirf letters, numbers, underscore, aur 3 se 20 characters.
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
// Email: "kuch@kuch.kuch" jaisa basic format (space nahi, @ aur . hona chahiye).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 24 * 60 * 60 * 1000,
};

// ------------------------------------------------------------
// POST /api/auth/register
// Frontend JSON bhejega: { "username": "...", "email": "...", "password": "..." }
// ------------------------------------------------------------
router.post("/register", async (req, res) => {
  try {
    // express.json() middleware ne request body (JSON text) ko JavaScript
    // object bana ke req.body me rakh diya hai. "|| {}" safety ke liye,
    // agar body khali aayi to error na aaye.
    const body = req.body || {};

    // Username/email ke aage-peeche ke spaces hata do (trim).
    const username = typeof body.username === "string" ? body.username.trim() : "";
    // Email ko lowercase me store karte hain taaki "A@x.com" aur "a@x.com" same ho.
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    // ---------- Validation ----------
    // 400 Bad Request = client ne galat/adhoora data bheja.
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email and password are required." });
    }
    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({
        error: "Username must be 3-20 characters (letters, numbers, underscore only).",
      });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    // ---------- Duplicate check ----------
    // SELECT query: kya is username YA email ka koi user pehle se hai?
    // "?" placeholders me niche wali values order se bhar jaati hain.
    const existing = await get(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email]
    );
    if (existing) {
      // 409 Conflict = resource pehle se maujood hai.
      return res.status(409).json({ error: "Username or email already exists." });
    }

    // ---------- Password hashing ----------
    // bcrypt.hash: password + random "salt" mila ke ek lamba hash banata hai.
    // Hash ek-tarfa (one-way) hota hai: hash se wapas asli password nahi nikal sakte.
    // Salt random hota hai, isliye same password ka hash har baar alag banta hai.
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // ---------- Database me insert ----------
    const result = await run(
      "INSERT INTO users (username, email, password_hash, token_version) VALUES (?, ?, ?, 1)",
      [username, email, passwordHash]
    );

    // 201 Created = naya resource ban gaya. Password/hash wapas kabhi nahi bhejte.
    return res.status(201).json({
      message: "Registration successful. Please login.",
      user: { id: result.lastID, username, email },
    });
  } catch (err) {
    // Agar do log exactly ek saath same username se register karein, to
    // upar wala check dono pass kar sakta hai, par database ka UNIQUE rule
    // dusre ko rok dega. Us error ko bhi 409 me badal dete hain.
    if (err && err.code === "SQLITE_CONSTRAINT") {
      return res.status(409).json({ error: "Username or email already exists." });
    }
    console.error("Register error:", err);
    // 500 Internal Server Error = server ki apni galti (bug, DB issue).
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ------------------------------------------------------------
// POST /api/auth/login
// Frontend JSON bhejega: { "identifier": "email ya username", "password": "..." }
// ------------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const body = req.body || {};

    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!identifier || !password) {
      return res.status(400).json({ error: "Email/username and password are required." });
    }

    // User dhundo: email se ya username se. Email lowercase me stored hai,
    // isliye identifier ko lowercase karke email se compare karte hain.
    const user = await get(
      `SELECT id, username, email, password_hash, token_version, created_at
       FROM users
       WHERE email = ? OR username = ?`,
      [identifier.toLowerCase(), identifier]
    );

    // User na mile ya password galat ho, dono case me SAME message dete hain.
    // Isse hacker ko ye pata nahi chalta ki kaunsa email/username register hai.
    // 401 Unauthorized = credentials galat hain.
    if (!user) {
      return res.status(401).json({ error: "Invalid email/username or password." });
    }

    // bcrypt.compare: diya hua password ko wahi salt lagake hash karta hai
    // aur stored hash se match karta hai. Match hua to true, warna false.
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email/username or password." });
    }

    const tokenVersion = Number(user.token_version ?? 1);
    const sessionToken = jwt.sign(
      { userId: user.id, username: user.username, tokenVersion },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "24h" }
    );

    res.cookie("token", sessionToken, COOKIE_OPTIONS);

    // Login successful. 200 OK. Password hash BILKUL wapas nahi bhejna,
    // isliye sirf safe fields chun ke bhej rahe hain.
    return res.status(200).json({
      message: "Login successful.",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

router.get("/me", authenticateToken, (req, res) => {
  return res.status(200).json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
    },
  });
});

// ------------------------------------------------------------
// POST /api/auth/logout
// ------------------------------------------------------------
router.post("/logout", async (req, res) => {
  const token = req.cookies && req.cookies.token ? req.cookies.token : null;

  if (token) {
    const verification = await verifyTokenString(token);
    if (verification.valid && verification.user) {
      try {
        await run(
          "UPDATE users SET token_version = token_version + 1 WHERE id = ?",
          [verification.user.id]
        );
      } catch (err) {
        console.error("Logout token revocation failed:", err);
        return res.status(500).json({ error: "Could not complete logout." });
      }
    }
  }

  res.clearCookie("token", {
    httpOnly: COOKIE_OPTIONS.httpOnly,
    sameSite: COOKIE_OPTIONS.sameSite,
    secure: COOKIE_OPTIONS.secure,
    path: COOKIE_OPTIONS.path,
  });
  return res.status(200).json({ message: "Logged out successfully." });
});

// Router ko export karte hain taaki index.js use mount kar sake.
module.exports = router;