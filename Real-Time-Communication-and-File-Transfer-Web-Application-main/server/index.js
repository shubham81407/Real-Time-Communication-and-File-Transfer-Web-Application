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
    const rows = await all('SELECT id, username, email, avatar_url FROM users');
    res.json(rows || []);
  } catch (err) {
    console.error('[API Error] Users fetch failed:', err.message);
    res.status(500).json({ error: 'Database error fetching users' });
  }
});

// 1.1 Unread message counts per sender
app.get('/api/unread-counts', authenticateToken, async (req, res) => {
  try {
    const currentUserId = Number(req.user.id);
    const query = `
      SELECT sender_id, COUNT(*) as unread_count
      FROM messages
      WHERE receiver_id = ? AND status != 'seen'
        AND is_deleted_for_everyone != 1
        AND (deleted_for_users IS NULL OR deleted_for_users NOT LIKE '%,${currentUserId},%')
      GROUP BY sender_id
    `;
    const rows = await all(query, [currentUserId]);
    const counts = {};
    rows.forEach((r) => {
      counts[r.sender_id] = r.unread_count;
    });
    res.json(counts);
  } catch (err) {
    console.error('[API Error] Unread counts fetch failed:', err.message);
    res.status(500).json({ error: 'Database error fetching unread counts' });
  }
});

// 1.2 Blocked users list
app.get('/api/users/blocked', authenticateToken, async (req, res) => {
  try {
    const currentUserId = Number(req.user.id);
    const blockedByMeRows = await all('SELECT blocked_id FROM blocked_users WHERE blocker_id = ?', [currentUserId]);
    const blockedMeRows = await all('SELECT blocker_id FROM blocked_users WHERE blocked_id = ?', [currentUserId]);

    res.json({
      blockedByMe: (blockedByMeRows || []).map((r) => r.blocked_id),
      blockedMe: (blockedMeRows || []).map((r) => r.blocker_id)
    });
  } catch (err) {
    console.error('[API Error] Blocked users fetch failed:', err.message);
    res.status(500).json({ error: 'Database error fetching blocked users' });
  }
});

// 1.3 Block user API
app.post('/api/users/block', authenticateToken, async (req, res) => {
  try {
    const blockerId = Number(req.user.id);
    const blockedId = Number(req.body && req.body.userId);
    if (!Number.isSafeInteger(blockedId) || blockerId === blockedId) {
      return res.status(400).json({ error: 'Invalid user to block.' });
    }
    await run('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)', [blockerId, blockedId]);
    res.json({ success: true, message: 'User blocked.' });
  } catch (err) {
    console.error('[API Error] Block user failed:', err.message);
    res.status(500).json({ error: 'Database error blocking user' });
  }
});

// 1.4 Unblock user API
app.post('/api/users/unblock', authenticateToken, async (req, res) => {
  try {
    const blockerId = Number(req.user.id);
    const blockedId = Number(req.body && req.body.userId);
    if (!Number.isSafeInteger(blockedId)) {
      return res.status(400).json({ error: 'Invalid user to unblock.' });
    }
    await run('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);
    res.json({ success: true, message: 'User unblocked.' });
  } catch (err) {
    console.error('[API Error] Unblock user failed:', err.message);
    res.status(500).json({ error: 'Database error unblocking user' });
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
    WHERE ((sender_id = ? AND receiver_id = ?) 
       OR (sender_id = ? AND receiver_id = ?))
      AND (deleted_for_users IS NULL OR deleted_for_users NOT LIKE '%,${authenticatedUserId},%')
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

// Profile Picture Upload Endpoint
app.post('/api/users/profile-picture', authenticateToken, upload.single('avatar'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (!imageExts.includes(ext)) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'Profile picture must be an image (.jpg, .png, .gif, .webp).' });
  }

  try {
    if (!(await hasValidFileSignature(req.file))) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'File content does not match image format.' });
    }
  } catch (err) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return next(err);
  }

  const avatarUrl = `/uploads/${req.file.filename}`;
  const userId = Number(req.user.id);

  try {
    await run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);

    // Broadcast avatar update so all connected users see the new avatar in real time
    io.emit('user_avatar_updated', { user_id: userId, avatar_url: avatarUrl });

    res.json({
      success: true,
      message: 'Profile picture updated successfully.',
      avatarUrl: avatarUrl
    });
  } catch (err) {
    console.error('[API Error] Profile picture update failed:', err.message);
    res.status(500).json({ error: 'Failed to update profile picture in database.' });
  }
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
      SELECT gm.*, u.username as sender_name
      FROM group_messages gm
      JOIN users u ON gm.sender_id = u.id
      WHERE gm.group_id = ?
        AND (gm.deleted_for_users IS NULL OR gm.deleted_for_users NOT LIKE '%,${req.user.id},%')
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

      // Block check
      const blockRecord = await get(
        'SELECT blocker_id FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
        [senderId, receiverId, receiverId, senderId]
      );
      if (blockRecord) {
        if (Number(blockRecord.blocker_id) === senderId) {
          return socket.emit('message_error', { error: 'You have blocked this contact. Unblock to send messages.' });
        } else {
          return socket.emit('message_error', { error: 'You cannot send messages to this contact.' });
        }
      }

      const replyToId = Number(data.reply_to_id) || null;
      const replyToText = typeof data.reply_to_text === 'string' ? data.reply_to_text.slice(0, 500) : null;
      const replyToSender = typeof data.reply_to_sender === 'string' ? data.reply_to_sender.slice(0, 50) : null;

      const result = await run(
        "INSERT INTO messages (sender_id, receiver_id, message, status, reply_to_id, reply_to_text, reply_to_sender) VALUES (?, ?, ?, 'sent', ?, ?, ?)",
        [senderId, receiverId, message, replyToId, replyToText, replyToSender]
      );
      const savedMessage = {
        id: result.lastID,
        sender_id: senderId,
        receiver_id: receiverId,
        message,
        status: 'sent',
        is_edited: 0,
        is_deleted_for_everyone: 0,
        reply_to_id: replyToId,
        reply_to_text: replyToText,
        reply_to_sender: replyToSender,
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

  socket.on('mark_messages_seen', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const viewerId = Number(socket.data.user.id);
    const senderId = Number(payload && payload.sender_id);
    if (!Number.isSafeInteger(senderId) || senderId < 1) return;

    try {
      const updateResult = await run(
        "UPDATE messages SET status = 'seen', seen_at = datetime('now') WHERE sender_id = ? AND receiver_id = ? AND status != 'seen'",
        [senderId, viewerId]
      );

      if (updateResult.changes > 0) {
        const senderSockets = onlineUsers.get(senderId);
        if (senderSockets && senderSockets.size) {
          io.to(Array.from(senderSockets)).emit('messages_seen', {
            viewer_id: viewerId,
            receiver_id: viewerId,
            sender_id: senderId,
          });
        }
      }
    } catch (err) {
      console.error('[Socket Error] mark_messages_seen failed:', err.message);
    }
  });

  socket.on('typing_start', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const senderId = Number(socket.data.user.id);
    const receiverId = Number(payload && payload.receiver_id);
    if (!Number.isSafeInteger(receiverId) || receiverId < 1) return;

    try {
      const blockRecord = await get(
        'SELECT id FROM blocked_users WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
        [senderId, receiverId, receiverId, senderId]
      );
      if (blockRecord) return;
    } catch (e) {}

    const recipientSockets = onlineUsers.get(receiverId);
    if (recipientSockets && recipientSockets.size) {
      io.to(Array.from(recipientSockets)).emit('user_typing', {
        sender_id: senderId,
        username: socket.data.user.username,
        is_typing: true,
      });
    }
  });

  socket.on('typing_stop', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const senderId = Number(socket.data.user.id);
    const receiverId = Number(payload && payload.receiver_id);
    if (!Number.isSafeInteger(receiverId) || receiverId < 1) return;

    const recipientSockets = onlineUsers.get(receiverId);
    if (recipientSockets && recipientSockets.size) {
      io.to(Array.from(recipientSockets)).emit('user_typing', {
        sender_id: senderId,
        username: socket.data.user.username,
        is_typing: false,
      });
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
      const replyToId = Number(data.reply_to_id) || null;
      const replyToText = typeof data.reply_to_text === 'string' ? data.reply_to_text.slice(0, 500) : null;
      const replyToSender = typeof data.reply_to_sender === 'string' ? data.reply_to_sender.slice(0, 50) : null;

      const result = await run(
        'INSERT INTO group_messages (group_id, sender_id, message, reply_to_id, reply_to_text, reply_to_sender) VALUES (?, ?, ?, ?, ?, ?)',
        [groupId, senderId, message, replyToId, replyToText, replyToSender]
      );
      const savedGroupMessage = {
        id: result.lastID,
        group_id: groupId,
        sender_id: senderId,
        sender_name: socket.data.user.username,
        message,
        is_edited: 0,
        is_deleted_for_everyone: 0,
        reply_to_id: replyToId,
        reply_to_text: replyToText,
        reply_to_sender: replyToSender,
        created_at: new Date().toISOString(),
      };
      io.to(`group_${groupId}`).emit('receive_group_message', savedGroupMessage);
    } catch (err) {
      console.error('[Group Socket Error] Message save failed:', err.message);
      socket.emit('message_error', { error: 'Group message could not be sent.' });
    }
  });

  socket.on('edit_message', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const data = payload && typeof payload === 'object' ? payload : {};
    const messageId = Number(data.message_id);
    const isGroup = Boolean(data.is_group);
    const newText = typeof data.new_message === 'string' ? data.new_message.trim() : '';
    const userId = Number(socket.data.user.id);

    if (!Number.isSafeInteger(messageId) || messageId < 1 || !newText || newText.length > 5000) {
      return socket.emit('message_error', { error: 'Invalid edit request.' });
    }

    try {
      if (isGroup) {
        const msg = await get('SELECT * FROM group_messages WHERE id = ?', [messageId]);
        if (!msg || Number(msg.sender_id) !== userId || msg.is_deleted_for_everyone) {
          return socket.emit('message_error', { error: 'You cannot edit this message.' });
        }
        await run('UPDATE group_messages SET message = ?, is_edited = 1 WHERE id = ?', [newText, messageId]);
        io.to(`group_${msg.group_id}`).emit('message_edited', {
          id: messageId,
          is_group: true,
          group_id: msg.group_id,
          message: newText,
          is_edited: 1
        });
      } else {
        const msg = await get('SELECT * FROM messages WHERE id = ?', [messageId]);
        if (!msg || Number(msg.sender_id) !== userId || msg.is_deleted_for_everyone) {
          return socket.emit('message_error', { error: 'You cannot edit this message.' });
        }
        await run('UPDATE messages SET message = ?, is_edited = 1 WHERE id = ?', [newText, messageId]);
        const editPayload = {
          id: messageId,
          is_group: false,
          sender_id: userId,
          receiver_id: msg.receiver_id,
          message: newText,
          is_edited: 1
        };
        socket.emit('message_edited', editPayload);
        const recipientSockets = onlineUsers.get(msg.receiver_id);
        if (recipientSockets && recipientSockets.size) {
          io.to(Array.from(recipientSockets)).emit('message_edited', editPayload);
        }
      }
    } catch (err) {
      console.error('[Socket Error] Edit failed:', err.message);
      socket.emit('message_error', { error: 'Failed to edit message.' });
    }
  });

  socket.on('delete_message_for_everyone', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const data = payload && typeof payload === 'object' ? payload : {};
    const messageId = Number(data.message_id);
    const isGroup = Boolean(data.is_group);
    const userId = Number(socket.data.user.id);

    if (!Number.isSafeInteger(messageId) || messageId < 1) return;

    try {
      if (isGroup) {
        const msg = await get('SELECT * FROM group_messages WHERE id = ?', [messageId]);
        if (!msg || Number(msg.sender_id) !== userId) {
          return socket.emit('message_error', { error: 'Only the sender can delete for everyone.' });
        }
        await run(
          "UPDATE group_messages SET is_deleted_for_everyone = 1, message = 'This message was deleted' WHERE id = ?",
          [messageId]
        );
        io.to(`group_${msg.group_id}`).emit('message_deleted_for_everyone', {
          id: messageId,
          is_group: true,
          group_id: msg.group_id,
          message: 'This message was deleted'
        });
      } else {
        const msg = await get('SELECT * FROM messages WHERE id = ?', [messageId]);
        if (!msg || Number(msg.sender_id) !== userId) {
          return socket.emit('message_error', { error: 'Only the sender can delete for everyone.' });
        }
        await run(
          "UPDATE messages SET is_deleted_for_everyone = 1, message = 'This message was deleted' WHERE id = ?",
          [messageId]
        );
        const delPayload = {
          id: messageId,
          is_group: false,
          sender_id: userId,
          receiver_id: msg.receiver_id,
          message: 'This message was deleted'
        };
        socket.emit('message_deleted_for_everyone', delPayload);
        const recipientSockets = onlineUsers.get(msg.receiver_id);
        if (recipientSockets && recipientSockets.size) {
          io.to(Array.from(recipientSockets)).emit('message_deleted_for_everyone', delPayload);
        }
      }
    } catch (err) {
      console.error('[Socket Error] Delete for everyone failed:', err.message);
      socket.emit('message_error', { error: 'Failed to delete message.' });
    }
  });

  socket.on('delete_message_for_me', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const data = payload && typeof payload === 'object' ? payload : {};
    const messageId = Number(data.message_id);
    const isGroup = Boolean(data.is_group);
    const userId = Number(socket.data.user.id);

    if (!Number.isSafeInteger(messageId) || messageId < 1) return;

    try {
      const table = isGroup ? 'group_messages' : 'messages';
      const msg = await get(`SELECT id, deleted_for_users FROM ${table} WHERE id = ?`, [messageId]);
      if (!msg) return;

      const currentDeleted = msg.deleted_for_users || '';
      if (!currentDeleted.includes(`,${userId},`)) {
        const updated = (currentDeleted ? currentDeleted : ',') + `${userId},`;
        await run(`UPDATE ${table} SET deleted_for_users = ? WHERE id = ?`, [updated, messageId]);
      }
      socket.emit('message_deleted_for_me', { id: messageId, is_group: isGroup });
    } catch (err) {
      console.error('[Socket Error] Delete for me failed:', err.message);
      socket.emit('message_error', { error: 'Failed to delete message.' });
    }
  });

  socket.on('message_reaction', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const data = payload && typeof payload === 'object' ? payload : {};
    const messageId = Number(data.message_id);
    const isGroup = Boolean(data.is_group);
    const emoji = typeof data.emoji === 'string' ? data.emoji.trim() : '';
    const userId = Number(socket.data.user.id);

    if (!Number.isSafeInteger(messageId) || messageId < 1 || !emoji) return;

    try {
      const table = isGroup ? 'group_messages' : 'messages';
      const msg = await get(
        `SELECT id, reactions, ${isGroup ? 'group_id' : 'sender_id, receiver_id'} FROM ${table} WHERE id = ?`,
        [messageId]
      );
      if (!msg) return;

      let r = {};
      try {
        r = JSON.parse(msg.reactions || '{}');
      } catch (e) {
        r = {};
      }
      if (!Array.isArray(r[emoji])) r[emoji] = [];
      const idx = r[emoji].indexOf(userId);
      if (idx > -1) {
        r[emoji].splice(idx, 1);
        if (r[emoji].length === 0) delete r[emoji];
      } else {
        r[emoji].push(userId);
      }
      const updatedReactions = JSON.stringify(r);
      await run(`UPDATE ${table} SET reactions = ? WHERE id = ?`, [updatedReactions, messageId]);

      const reactionPayload = {
        id: messageId,
        is_group: isGroup,
        reactions: updatedReactions
      };

      if (isGroup) {
        io.to(`group_${msg.group_id}`).emit('message_reaction_updated', reactionPayload);
      } else {
        socket.emit('message_reaction_updated', reactionPayload);
        const otherId = Number(msg.sender_id) === userId ? Number(msg.receiver_id) : Number(msg.sender_id);
        const otherSockets = onlineUsers.get(otherId);
        if (otherSockets && otherSockets.size) {
          io.to(Array.from(otherSockets)).emit('message_reaction_updated', reactionPayload);
        }
      }
    } catch (err) {
      console.error('[Socket Error] Reaction failed:', err.message);
    }
  });

  socket.on('block_user', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const blockerId = Number(socket.data.user.id);
    const blockedId = Number(payload && payload.user_id);
    if (!Number.isSafeInteger(blockedId) || blockerId === blockedId) return;

    try {
      await run('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)', [blockerId, blockedId]);

      const blockerSockets = onlineUsers.get(blockerId);
      if (blockerSockets) {
        io.to(Array.from(blockerSockets)).emit('user_blocked_status', {
          user_id: blockedId,
          is_blocked_by_me: true
        });
      }

      const blockedSockets = onlineUsers.get(blockedId);
      if (blockedSockets) {
        io.to(Array.from(blockedSockets)).emit('user_blocked_status', {
          user_id: blockerId,
          is_blocked_me: true
        });
      }
    } catch (err) {
      console.error('[Socket Error] Block user failed:', err.message);
      socket.emit('message_error', { error: 'Failed to block user.' });
    }
  });

  socket.on('unblock_user', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const blockerId = Number(socket.data.user.id);
    const blockedId = Number(payload && payload.user_id);
    if (!Number.isSafeInteger(blockedId)) return;

    try {
      await run('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?', [blockerId, blockedId]);

      const blockerSockets = onlineUsers.get(blockerId);
      if (blockerSockets) {
        io.to(Array.from(blockerSockets)).emit('user_blocked_status', {
          user_id: blockedId,
          is_blocked_by_me: false
        });
      }

      const blockedSockets = onlineUsers.get(blockedId);
      if (blockedSockets) {
        io.to(Array.from(blockedSockets)).emit('user_blocked_status', {
          user_id: blockerId,
          is_blocked_me: false
        });
      }
    } catch (err) {
      console.error('[Socket Error] Unblock user failed:', err.message);
      socket.emit('message_error', { error: 'Failed to unblock user.' });
    }
  });

  socket.on('clear_chat', async (payload) => {
    if (!(await verifySocketSession(socket))) return;
    const data = payload && typeof payload === 'object' ? payload : {};
    const targetId = Number(data.target_id);
    const isGroup = Boolean(data.is_group);
    const userId = Number(socket.data.user.id);

    if (!Number.isSafeInteger(targetId) || targetId < 1) return;

    try {
      if (isGroup) {
        const member = await get('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', [targetId, userId]);
        if (!member) return socket.emit('group_error', { error: 'Not a member of this group.' });

        const groupMsgs = await all(
          `SELECT id, deleted_for_users FROM group_messages WHERE group_id = ? AND (deleted_for_users IS NULL OR deleted_for_users NOT LIKE '%,${userId},%')`,
          [targetId]
        );
        for (const m of groupMsgs) {
          const current = m.deleted_for_users || '';
          const updated = (current ? current : ',') + `${userId},`;
          await run('UPDATE group_messages SET deleted_for_users = ? WHERE id = ?', [updated, m.id]);
        }
      } else {
        const msgs = await all(
          `SELECT id, deleted_for_users FROM messages WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND (deleted_for_users IS NULL OR deleted_for_users NOT LIKE '%,${userId},%')`,
          [userId, targetId, targetId, userId]
        );
        for (const m of msgs) {
          const current = m.deleted_for_users || '';
          const updated = (current ? current : ',') + `${userId},`;
          await run('UPDATE messages SET deleted_for_users = ? WHERE id = ?', [updated, m.id]);
        }
      }

      socket.emit('chat_cleared', { target_id: targetId, is_group: isGroup });
    } catch (err) {
      console.error('[Socket Error] Clear chat failed:', err.message);
      socket.emit('message_error', { error: 'Failed to clear chat.' });
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