// ==========================================
// SERVER ENTRY POINT (server/index.js)
// ==========================================
require('dotenv').config();

const jwtSecret = (process.env.JWT_SECRET || '').trim();
if (!jwtSecret || jwtSecret.length < 32) {
  console.error('FATAL ERROR: JWT_SECRET must be set in .env and be at least 32 characters long.');
  process.exit(1);
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');

// db.js se database helpers import karna
const { db, run, get, all } = require('./db');
const authRoutes = require('./routes/auth');
const {
  authenticateToken,
  getTokenFromCookieHeader,
  verifyTokenString,
} = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// Socket.IO server initialize karna
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

// Uploads folder ensure karna
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedFileTypes = {
  '.csv': ['text/csv', 'application/vnd.ms-excel'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.gif': ['image/gif'],
  '.jpeg': ['image/jpeg'],
  '.jpg': ['image/jpeg'],
  '.pdf': ['application/pdf'],
  '.png': ['image/png'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.txt': ['text/plain'],
  '.webp': ['image/webp'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});

// Accept common document and raster image formats, but not active content such as HTML or SVG.
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedMimeTypes = allowedFileTypes[extension];
    if (!allowedMimeTypes || !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      const error = new Error('Unsupported file type. Use a supported image or document format.');
      error.code = 'LIMIT_UNEXPECTED_FILE_TYPE';
      return cb(error);
    }
    return cb(null, true);
  },
});

async function hasValidFileSignature(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const handle = await fs.promises.open(file.path, 'r');
  const header = Buffer.alloc(512);
  let bytesRead;
  try {
    ({ bytesRead } = await handle.read(header, 0, header.length, 0));
  } finally {
    await handle.close();
  }

  if (extension === '.png') return header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (extension === '.jpg' || extension === '.jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (extension === '.gif') return ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6));
  if (extension === '.webp') return header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
  if (extension === '.pdf') return header.toString('ascii', 0, 5) === '%PDF-';
  if (['.doc', '.ppt', '.xls'].includes(extension)) {
    return header.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
  }
  if (['.docx', '.pptx', '.xlsx'].includes(extension)) {
    return header[0] === 0x50 && header[1] === 0x4b && header[2] === 0x03 && header[3] === 0x04;
  }
  if (extension === '.txt' || extension === '.csv') {
    const actualHeader = header.subarray(0, bytesRead);
    const textHeader = actualHeader.toString('utf8').replace(/^\uFEFF/, '').trimStart().toLowerCase();
    return !/^<(?:!doctype\s+html|html|script|svg|\?xml)\b/.test(textHeader) && !actualHeader.includes(0);
  }
  return false;
}

// Body parser: JSON data handle karne ke liye
app.use(express.json());
app.use(cookieParser());

app.use('/uploads', authenticateToken, express.static(uploadDir, {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

// Client folder static serve karna
app.use(express.static(path.join(__dirname, '../client')));

// Auth routes (/api/auth/register, /api/auth/login, /api/auth/logout)
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', timestamp: new Date().toISOString() });
});

// 1. All Users API (Sidebar ke liye)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const rows = await all('SELECT id, username, email FROM users');
    res.json(rows || []);
  } catch (err) {
    console.error('[API Error] Users fetch failed:', err.message);
    res.status(500).json({ error: 'Database error fetching users' });
  }
});

// 2. Chat History API (Do users ke purane messages lana)
app.get('/api/messages/:userId1/:userId2', authenticateToken, async (req, res) => {
  const firstUserId = Number(req.params.userId1);
  const secondUserId = Number(req.params.userId2);
  const authenticatedUserId = Number(req.user.id);
  let otherUserId;

  if (firstUserId === authenticatedUserId) {
    otherUserId = secondUserId;
  } else if (secondUserId === authenticatedUserId) {
    otherUserId = firstUserId;
  } else {
    return res.status(403).json({ error: 'You can only view your own conversations.' });
  }
  
  const query = `
    SELECT * FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?) 
       OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `;

  try {
    const rows = await all(query, [authenticatedUserId, otherUserId, otherUserId, authenticatedUserId]);
    res.json(rows || []);
  } catch (err) {
    console.error('[API Error] Messages fetch failed:', err.message);
    res.status(500).json({ error: 'Database error fetching messages' });
  }
});

// 3. Group Create API
app.post('/api/groups', authenticateToken, async (req, res) => {
  const { name, member_ids } = req.body || {};
  const createdBy = req.user.id;
  const groupName = typeof name === 'string' ? name.trim() : '';
  if (!groupName || groupName.length > 60) {
    return res.status(400).json({ error: 'Group name must be between 1 and 60 characters.' });
  }

  try {
    const groupResult = await run('INSERT INTO groups (name, created_by) VALUES (?, ?)', [groupName, createdBy]);
    const groupId = groupResult.lastID;

    // Creator ko group member banana
    await run('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, createdBy]);

    // Baaki selected members ko add karna
    if (Array.isArray(member_ids)) {
      for (const mId of member_ids) {
        const memberId = Number(mId);
        if (!Number.isSafeInteger(memberId) || memberId < 1 || memberId === Number(createdBy)) continue;
        const member = await get('SELECT id FROM users WHERE id = ?', [memberId]);
        if (member) await run('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, memberId]);
      }
    }

    res.status(201).json({ message: 'Group created', groupId, name: groupName });
  } catch (err) {
    console.error('[Group Error]:', err.message);
    res.status(500).json({ error: 'Group creation failed' });
  }
});

    // File Upload Endpoint
    app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Koi file upload nahi hui' });
  }

      try {
        if (!(await hasValidFileSignature(req.file))) {
          await fs.promises.unlink(req.file.path);
          return res.status(400).json({ error: 'File content does not match its file type.' });
        }
      } catch (err) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(err);
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

app.use((err, req, res, next) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_UNEXPECTED_FILE_TYPE')) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.message });
  }
  return next(err);
});


// 4. User ke groups fetch karna
app.get('/api/users/:userId/groups', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT g.id, g.name, g.created_by 
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
    `;
    const groups = await all(query, [req.user.id]);
    res.json(groups || []);
  } catch (err) {
    res.status(500).json({ error: 'Groups load failed' });
  }
});

// 5. Group chat history fetch karna
app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
  const { groupId } = req.params;
  try {
    const membership = await get(
      'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, req.user.id]
    );
    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this group.' });
    }

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
io.use(async (socket, next) => {
  const token = getTokenFromCookieHeader(socket.handshake.headers.cookie);
  const verification = await verifyTokenString(token);
  if (!verification.valid) {
    return next(new Error('Authentication required.'));
  }

  socket.data.user = verification.user;
  socket.data.sessionToken = token;
  return next();
});

const onlineUsers = new Map(); // userId -> Set of socketIds for tabs/devices

function emitOnlineUsers() {
  io.emit('online_users_list', Array.from(onlineUsers.keys()));
}

function registerSocket(socket) {
  const userId = Number(socket.data.user.id);
  let userSockets = onlineUsers.get(userId);
  const wasOffline = !userSockets;
  if (!userSockets) {
    userSockets = new Set();
    onlineUsers.set(userId, userSockets);
  }
  userSockets.add(socket.id);

  if (wasOffline) {
    console.log(`[Socket] User ${userId} Online hai`);
    emitOnlineUsers();
  } else {
    socket.emit('online_users_list', Array.from(onlineUsers.keys()));
  }
}

async function verifySocketSession(socket) {
  const verification = await verifyTokenString(socket.data.sessionToken);
  if (verification.valid) return true;

  socket.emit('session_expired', { message: 'Your session expired. Please log in again.' });
  socket.disconnect(true);
  return false;
}

io.on('connection', (socket) => {
  console.log('[Socket] Authenticated client connected, ID:', socket.id);
  registerSocket(socket);

  // Keep the existing event for old clients, but bind identity to the cookie session.
  socket.on('register_user', async () => {
    if (await verifySocketSession(socket)) registerSocket(socket);
  });

  socket.on('send_private_message', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const data = payload && typeof payload === 'object' ? payload : {};
    const senderId = Number(socket.data.user.id);
    const receiverId = Number(data.receiver_id);
    const message = typeof data.message === 'string' ? data.message.trim() : '';

    if (!Number.isSafeInteger(receiverId) || receiverId < 1 || !message || message.length > 5000) {
      return socket.emit('message_error', { error: 'Invalid message or recipient.' });
    }

    try {
      const receiver = await get('SELECT id FROM users WHERE id = ?', [receiverId]);
      if (!receiver) return socket.emit('message_error', { error: 'Recipient not found.' });

      const result = await run(
        'INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
        [senderId, receiverId, message]
      );
      const savedMessage = {
        id: result.lastID,
        sender_id: senderId,
        receiver_id: receiverId,
        message,
        created_at: new Date().toISOString(),
      };

      const recipientSockets = onlineUsers.get(receiverId);
      if (recipientSockets && recipientSockets.size) {
        io.to(Array.from(recipientSockets)).emit('receive_private_message', savedMessage);
      }
      socket.emit('message_sent_confirm', savedMessage);
    } catch (err) {
      console.error('[Socket Error] Message save failed:', err.message);
      socket.emit('message_error', { error: 'Message could not be sent.' });
    }
  });

  socket.on('join_group', async (groupIdValue) => {
    if (!(await verifySocketSession(socket))) return;
    const groupId = Number(groupIdValue);
    if (!Number.isSafeInteger(groupId) || groupId < 1) return;

    try {
      const membership = await get(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, socket.data.user.id]
      );
      if (!membership) {
        return socket.emit('group_error', { error: 'You are not a member of this group.' });
      }
      await socket.join(`group_${groupId}`);
    } catch (err) {
      console.error('[Group Socket Error] Join failed:', err.message);
      socket.emit('group_error', { error: 'Could not join this group.' });
    }
  });

  socket.on('send_group_message', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const data = payload && typeof payload === 'object' ? payload : {};
    const groupId = Number(data.group_id);
    const senderId = Number(socket.data.user.id);
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!Number.isSafeInteger(groupId) || groupId < 1 || !message || message.length > 5000) {
      return socket.emit('message_error', { error: 'Invalid group message.' });
    }

    try {
      const membership = await get(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        [groupId, senderId]
      );
      if (!membership) {
        return socket.emit('group_error', { error: 'You are not a member of this group.' });
      }

      await socket.join(`group_${groupId}`);
      const result = await run(
        'INSERT INTO group_messages (group_id, sender_id, message) VALUES (?, ?, ?)',
        [groupId, senderId, message]
      );
      const savedGroupMessage = {
        id: result.lastID,
        group_id: groupId,
        sender_id: senderId,
        sender_name: socket.data.user.username,
        message,
        created_at: new Date().toISOString(),
      };
      io.to(`group_${groupId}`).emit('receive_group_message', savedGroupMessage);
    } catch (err) {
      console.error('[Group Socket Error] Message save failed:', err.message);
      socket.emit('message_error', { error: 'Group message could not be sent.' });
    }
  });

  socket.on('disconnect', () => {
    const userId = Number(socket.data.user.id);
    const userSockets = onlineUsers.get(userId);
    if (!userSockets) return;

    userSockets.delete(socket.id);
    if (userSockets.size === 0) {
      onlineUsers.delete(userId);
      console.log(`[Socket] User ${userId} Offline ho gaya`);
      emitOnlineUsers();
    }
  });
});



// Server Listen
server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`=================================`);
});