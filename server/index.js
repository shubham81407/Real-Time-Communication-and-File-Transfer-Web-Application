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

const multer = require('multer');
const fs = require('fs');

// Uploads folder ensure karna
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});

// File size limit (e.g., max 10MB)
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Uploads folder ko publicly serve karna
app.use('/uploads', express.static(uploadDir));

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

// 3. Group Create API
app.post('/api/groups', async (req, res) => {
  const { name, created_by, member_ids } = req.body;
  if (!name || !created_by) {
    return res.status(400).json({ error: 'Group name aur creator zaroori hai' });
  }

  try {
    const groupResult = await run('INSERT INTO groups (name, created_by) VALUES (?, ?)', [name, created_by]);
    const groupId = groupResult.lastID;

    // Creator ko group member banana
    await run('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, created_by]);

    // Baaki selected members ko add karna
    if (Array.isArray(member_ids)) {
      for (const mId of member_ids) {
        if (mId !== created_by) {
          await run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, mId]);
        }
      }
    }

    res.status(201).json({ message: 'Group created', groupId, name });
  } catch (err) {
    console.error('[Group Error]:', err.message);
    res.status(500).json({ error: 'Group creation failed' });
  }
});

    // File Upload Endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Koi file upload nahi hui' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    message: 'File upload ho gayi',
    fileUrl: fileUrl,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    fileType: req.file.mimetype
  });
}); 


// 4. User ke groups fetch karna
app.get('/api/users/:userId/groups', async (req, res) => {
  const { userId } = req.params;
  try {
    const query = `
      SELECT g.id, g.name, g.created_by 
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
    `;
    const groups = await all(query, [userId]);
    res.json(groups || []);
  } catch (err) {
    res.status(500).json({ error: 'Groups load failed' });
  }
});

// 5. Group chat history fetch karna
app.get('/api/groups/:groupId/messages', async (req, res) => {
  const { groupId } = req.params;
  try {
    const query = `
      SELECT gm.id, gm.group_id, gm.sender_id, gm.message, gm.created_at, u.username as sender_name
      FROM group_messages gm
      JOIN users u ON gm.sender_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.created_at ASC
    `;
    const messages = await all(query, [groupId]);
    res.json(messages || []);
  } catch (err) {
    res.status(500).json({ error: 'Group messages load failed' });
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

  // Socket ko group room me join karana
  socket.on('join_group', (groupId) => {
    socket.join(`group_${groupId}`);
    console.log(`[Socket] Socket ${socket.id} joined room: group_${groupId}`);
  });

  // Group message send karna
  socket.on('send_group_message', async ({ group_id, sender_id, message }) => {
    try {
      const sql = `INSERT INTO group_messages (group_id, sender_id, message) VALUES (?, ?, ?)`;
      const result = await run(sql, [group_id, sender_id, message]);

      // Sender ka username fetch karna display ke liye
      const sender = await get('SELECT username FROM users WHERE id = ?', [sender_id]);

      const savedGroupMsg = {
        id: result.lastID,
        group_id: Number(group_id),
        sender_id: Number(sender_id),
        sender_name: sender ? sender.username : 'Member',
        message: message,
        created_at: new Date().toISOString()
      };

      // Room ke sabhi members ko broadcast karna
      io.to(`group_${group_id}`).emit('receive_group_message', savedGroupMsg);
    } catch (err) {
      console.error('[Group Socket Error]:', err.message);
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