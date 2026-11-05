require("dotenv").config();

const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from the client folder
app.use(express.static(path.join(__dirname, "..", "client")));

// Health check route (useful for testing the server is running)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// Fallback for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});