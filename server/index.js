// ==========================================
// SERVER ENTRY POINT (server/index.js)
// ==========================================
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// db.js se database helpers import karna
const { db, run, get, all } = require('./db');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);

// Socket.IO server initialize karna
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// Body parser: JSON data handle karne ke liye
app.use(express.json());

// Client folder static serve karna
app.use(express.static(path.join(__dirname, '../client')));

// Auth routes (/api/auth/register, /api/auth/login, /api/auth/logout)
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', timestamp: new Date().toISOString() });
});

// 1. All Users API (Sidebar ke liye)
app.get('/api/users', async (req, res) => {
  try {
    const rows = await all('SELECT id, username, email FROM users');
    res.json(rows || []);
  } catch (err) {
    console.error('[API Error] Users fetch failed:', err.message);
    res.status(500).json({ error: 'Database error fetching users' });
  }
});

// 2. Chat History API (Do users ke purane messages lana)
app.get('/api/messages/:userId1/:userId2', async (req, res) => {
  const { userId1, userId2 } = req.params;
  
  const query = `
    SELECT * FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?) 
       OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `;

  try {
    const rows = await all(query, [userId1, userId2, userId2, userId1]);
    res.json(rows || []);
  } catch (err) {
    console.error('[API Error] Messages fetch failed:', err.message);
    res.status(500).json({ error: 'Database error fetching messages' });
  }
});

// ==========================================
// REAL-TIME SOCKET.IO LOGIC
// ==========================================
const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('[Socket] Client connect hua, ID:', socket.id);

  // User online aane par register karna
  socket.on('register_user', (userId) => {
    if (!userId) return;
    const numId = Number(userId);
    onlineUsers.set(numId, socket.id);
    console.log(`[Socket] User ${numId} Online hai (Socket: ${socket.id})`);

    // Sabhi clients ko updated online list bhejna
    const onlineArray = Array.from(onlineUsers.keys());
    io.emit('online_users_list', onlineArray);
  });

  // Private message send karna
  socket.on('send_private_message', async ({ sender_id, receiver_id, message }) => {
    try {
      const sql = `INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)`;
      const result = await run(sql, [sender_id, receiver_id, message]);

      const savedMessage = {
        id: result.lastID,
        sender_id: Number(sender_id),
        receiver_id: Number(receiver_id),
        message: message,
        created_at: new Date().toISOString()
      };

      // Receiver agar online hai toh use send karo
      const receiverSocketId = onlineUsers.get(Number(receiver_id));
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_private_message', savedMessage);
      }

      // Sender ko delivery confirmation emit karo
      socket.emit('message_sent_confirm', savedMessage);
    } catch (err) {
      console.error('[Socket Error] Message save failed:', err.message);
    }
  });

  // Disconnect hone par
  socket.on('disconnect', () => {
    let disconnectedUser = null;
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUser = userId;
        onlineUsers.delete(userId);
        break;
      }
    }

    if (disconnectedUser) {
      console.log(`[Socket] User ${disconnectedUser} Offline ho gaya`);
      io.emit('online_users_list', Array.from(onlineUsers.keys()));
    }
  });
});

// Server Listen
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`=================================`);
});