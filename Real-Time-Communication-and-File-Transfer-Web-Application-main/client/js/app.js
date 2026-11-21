// ============================================================
// File: client/js/app.js
// Kaam: UI logic + Auth (fetch) + Real-time chat (Socket.IO client)
// ============================================================

// ------------------------------------------------------------
// SOCKET CONNECTION
// io() function /socket.io/socket.io.js script se aata hai (index.html me load hoti hai).
// Ye same server (jahan se page aaya) se WebSocket connection kholta hai.
// Ye line DOMContentLoaded ke bahar hai taaki socket poore file me sab jagah mile.
// ------------------------------------------------------------
const socket = io({ autoConnect: false });

document.addEventListener("DOMContentLoaded", () => {
  // ----------------------------------------------------------
  // 1. ELEMENTS SELECT KARNA
  // ----------------------------------------------------------
  const authView = document.getElementById("auth-view");
  const chatView = document.getElementById("chat-view");

  const tabButtons = document.querySelectorAll(".tab-btn");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginError = document.getElementById("login-error");
  const loginSuccess = document.getElementById("login-success");
  const registerError = document.getElementById("register-error");
  const loginBtn = document.getElementById("login-btn");
  const registerBtn = document.getElementById("register-btn");
  const logoutBtn = document.getElementById("logout-btn");

  const myName = document.getElementById("my-name");
  const myAvatar = document.getElementById("my-avatar");
  const searchInput = document.getElementById("search-input");
  const conversationList = document.getElementById("conversation-list");

  const chatName = document.getElementById("chat-name");
  const chatAvatar = document.getElementById("chat-avatar");
  const chatStatus = document.getElementById("chat-status");
  const backBtn = document.getElementById("back-btn");

  const messageFeed = document.getElementById("message-feed");
  const messageForm = document.getElementById("message-form");
  const messageInput = document.getElementById("message-input");
  const messageSendBtn = messageForm.querySelector(".send-btn");
  const appNotice = document.getElementById("app-notice");
  const createGroupDialog = document.getElementById("create-group-dialog");
  const createGroupForm = document.getElementById("create-group-form");
  const groupNameInput = document.getElementById("group-name");
  const groupMemberList = document.getElementById("group-member-list");
  const groupMembersEmpty = document.getElementById("group-members-empty");
  const groupError = document.getElementById("group-error");
  const submitGroupBtn = document.getElementById("submit-group-btn");

  const messageActionBar = document.getElementById("message-action-bar");
  const actionBarTitle = document.getElementById("action-bar-title");
  const actionBarText = document.getElementById("action-bar-text");
  const cancelActionBtn = document.getElementById("cancel-action-btn");
  const deleteDialog = document.getElementById("delete-dialog");
  const deleteForEveryoneBtn = document.getElementById("delete-for-everyone-btn");
  const deleteForMeBtn = document.getElementById("delete-for-me-btn");
  const deleteCancelBtn = document.getElementById("delete-cancel-btn");
  const forwardDialog = document.getElementById("forward-dialog");
  const forwardList = document.getElementById("forward-list");
  const forwardCancelBtn = document.getElementById("forward-cancel-btn");

  const emojiBtn = document.getElementById("emoji-btn");
  const emojiPickerContainer = document.getElementById("emoji-picker-container");
  const closeEmojiPicker = document.getElementById("close-emoji-picker");
  const emojiCategoryTabs = document.getElementById("emoji-category-tabs");
  const emojiSearchInput = document.getElementById("emoji-search-input");
  const emojiGrid = document.getElementById("emoji-grid");

  const chatHeaderActions = document.getElementById("chat-header-actions");
  const chatMenuBtn = document.getElementById("chat-menu-btn");
  const chatDropdownMenu = document.getElementById("chat-dropdown-menu");
  const clearChatBtn = document.getElementById("clear-chat-btn");
  const blockUserBtn = document.getElementById("block-user-btn");
  const blockBtnText = document.getElementById("block-btn-text");
  const clearChatDialog = document.getElementById("clear-chat-dialog");
  const clearChatDesc = document.getElementById("clear-chat-desc");
  const confirmClearChatBtn = document.getElementById("confirm-clear-chat-btn");
  const cancelClearChatBtn = document.getElementById("cancel-clear-chat-btn");
  const blockUserDialog = document.getElementById("block-user-dialog");
  const blockDialogTitle = document.getElementById("block-dialog-title");
  const blockDialogDesc = document.getElementById("block-dialog-desc");
  const confirmBlockUserBtn = document.getElementById("confirm-block-user-btn");
  const cancelBlockUserBtn = document.getElementById("cancel-block-user-btn");
  const blockedBanner = document.getElementById("blocked-banner");
  const blockedBannerText = document.getElementById("blocked-banner-text");
  const unblockBannerBtn = document.getElementById("unblock-banner-btn");

  // ----------------------------------------------------------
  // 2. APP STATE (jo cheezein app ko yaad rakhni hain)
  // ----------------------------------------------------------
  const STORAGE_KEY = "chatUser"; // localStorage ki key
  const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
  const AVATAR_COLORS = ["avatar-blue", "avatar-pink", "avatar-green", "avatar-orange", "avatar-purple"];

  let currentUser = null; // logged-in user: { id, username, email, ... }
  let activeChat = null; // jis user se abhi chat khuli hai: { id, username }
  let activeGroup = null; // Agar group select ho: { id, name }
  let userGroups = []; // User ke saare groups
  let allUsers = []; // /api/users se aaye baaki saare users
  let onlineUserIds = []; // server ne jo online users ki id list bheji
  const lastMessages = {}; // { userId: { text, time } } sidebar preview ke liye
  const unreadCounts = {}; // { userId: number } jin chats ke messages abhi padhe nahi
  let noticeTimer = null;
  const typingUsers = new Map(); // userId -> timer
  let typingTimeout = null;
  let isCurrentlyTyping = false;
  let replyingTo = null; // { id, sender_name, message, is_group }
  let editingMessage = null; // { id, message, is_group }
  let pendingDelete = null; // { id, is_group, sender_id, is_deleted_for_everyone }
  let pendingForward = null; // { message }
  let blockedByMe = new Set(); // IDs of users blocked by current user
  let blockedMe = new Set(); // IDs of users who blocked current user
  let pendingBlockAction = null; // { userId, action: 'block' | 'unblock' }

  // ----------------------------------------------------------
  // 3. HELPER FUNCTIONS
  // ----------------------------------------------------------

  // Database ka time (jaise "2026-11-06 14:30:00", UTC me) ko local "2:30 PM" me badalta hai.
  // Value na mile to abhi ka time dikhata hai.
  function formatTime(value) {
    let date = new Date();
    if (value) {
      let text = String(value);
      if (!text.includes("T")) text = text.replace(" ", "T");
      // Timezone info na ho to UTC maan lo (SQLite datetime('now') UTC hota hai)
      if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) text += "Z";
      const parsed = new Date(text);
      if (!isNaN(parsed.getTime())) date = parsed;
    }
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  // Feed ko sabse neeche scroll karo taaki naya message dikhe.
  function scrollToBottom() {
    messageFeed.scrollTop = messageFeed.scrollHeight;
  }

  // User id se ek fixed avatar color chuno (same user ko hamesha same color).
  function colorFor(userId) {
    return AVATAR_COLORS[Number(userId) % AVATAR_COLORS.length];
  }

  // Kya ye user abhi online hai? (ids number/string kuch bhi aayein, Number() se compare)
  function isOnline(userId) {
    return onlineUserIds.map(Number).includes(Number(userId));
  }

  function setTypingIndicator(userId, isTyping) {
    const numId = Number(userId);
    if (isTyping) {
      if (typingUsers.has(numId)) {
        clearTimeout(typingUsers.get(numId));
      }
      const timer = setTimeout(() => {
        setTypingIndicator(numId, false);
      }, 3500);
      typingUsers.set(numId, timer);
    } else {
      if (typingUsers.has(numId)) {
        clearTimeout(typingUsers.get(numId));
        typingUsers.delete(numId);
      }
    }

    if (activeChat && Number(activeChat.id) === numId) {
      updateChatHeader();
    }
    renderUserList();
  }

  // ---------- localStorage helpers ----------
  function saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }
  function clearUser() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ---------- Auth UI helpers ----------
  function showMessage(element, text, type) {
    element.textContent = text;
    element.style.color = type === "success" ? "#00a884" : "";
  }
  function clearAuthMessages() {
    showMessage(loginError, "", "error");
    showMessage(loginSuccess, "", "error");
    showMessage(registerError, "", "error");
  }
  function setLoading(button, isLoading, loadingText, normalText) {
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : normalText;
  }
  function showNotice(message, type) {
    appNotice.textContent = message;
    appNotice.className = "app-notice " + (type || "");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => appNotice.classList.add("hidden"), 4000);
  }
  function switchTab(tabName) {
    tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
    loginForm.classList.toggle("active", tabName === "login");
    registerForm.classList.toggle("active", tabName === "register");
    clearAuthMessages();
  }

  // JSON POST request bhejne wala helper. Hamesha { ok, status, data } return karta hai.
  async function apiPost(url, body) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      let data = {};
      try {
        data = await response.json();
      } catch (parseError) {
        data = {};
      }
      return { ok: response.ok, status: response.status, data: data };
    } catch (networkError) {
      return { ok: false, status: 0, data: { error: "Cannot reach the server. Is it running?" } };
    }
  }

  async function apiGet(url) {
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      let data = {};
      try {
        data = await response.json();
      } catch (parseError) {
        data = {};
      }
      return { ok: response.ok, status: response.status, data: data };
    } catch (networkError) {
      return { ok: false, status: 0, data: { error: "Cannot reach the server. Is it running?" } };
    }
  }

  // ----------------------------------------------------------
  // 4. CHAT UI FUNCTIONS
  // ----------------------------------------------------------

  // Feed me placeholder text dikhane ke liye (jaise "Select a user to start chatting").
  // class "feed-placeholder" isliye lagayi taaki pehla message aate hi ise hata sakein.
  function showFeedPlaceholder(text) {
    messageFeed.textContent = ""; // feed khali karo
    const wrapper = document.createElement("div");
    wrapper.className = "date-divider feed-placeholder";
    const span = document.createElement("span");
    span.textContent = text;
    wrapper.appendChild(span);
    messageFeed.appendChild(wrapper);
  }

  function safeUploadUrl(value) {
    if (typeof value !== "string" || !value) return null;
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/uploads/") || url.search || url.hash) {
        return null;
      }
      return url.pathname;
    } catch (error) {
      return null;
    }
  }

  function parseAttachment(messageText) {
    const raw = String(messageText || "");
    const prefix = "chat-attachment:";
    if (raw.startsWith(prefix)) {
      try {
        const attachment = JSON.parse(raw.slice(prefix.length));
        const url = safeUploadUrl(attachment.url);
        if (!url || attachment.type !== "file") return null;
        return {
          url,
          fileName: typeof attachment.fileName === "string" ? attachment.fileName.slice(0, 255) : "Shared file",
          fileSize: Number(attachment.fileSize) || 0,
        };
      } catch (error) {
        return null;
      }
    }

    // Older versions stored attachment markup. Extract only its text and a
    // same-origin upload URL; the parsed HTML is never inserted into the page.
    if (raw.startsWith("<") && raw.includes("file-message")) {
      const parsed = new DOMParser().parseFromString(raw, "text/html");
      const container = parsed.querySelector(".file-message");
      const link = container && container.querySelector("a[href]");
      const image = container && container.querySelector("img[src]");
      const url = safeUploadUrl((link && link.getAttribute("href")) || (image && image.getAttribute("src")));
      if (!url) return null;
      const linkText = link ? link.textContent.trim().replace(/^[📁📄]\s*/, "") : "";
      return {
        url,
        fileName: (linkText || (image && image.getAttribute("alt")) || "Shared file").slice(0, 255),
        fileSize: 0,
      };
    }
    return null;
  }

  function createAttachmentElement(attachment) {
    const wrap = document.createElement("div");
    wrap.className = "file-message";
    const fileName = attachment.fileName.replace(/[\\/\0]/g, "_");
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(attachment.url);

    if (isImage) {
      const image = document.createElement("img");
      image.className = "file-preview";
      image.src = attachment.url;
      image.alt = fileName;
      image.loading = "lazy";
      wrap.appendChild(image);
    }

    const link = document.createElement("a");
    link.href = attachment.url;
    link.download = fileName;
    link.textContent = fileName;
    wrap.appendChild(link);

    if (attachment.fileSize > 0) {
      const size = document.createElement("span");
      size.className = "file-size";
      size.textContent = `${(attachment.fileSize / 1024).toFixed(1)} KB`;
      wrap.appendChild(size);
    }
    return wrap;
  }

  function messagePreview(messageText) {
    const attachment = parseAttachment(messageText);
    if (attachment) return `File: ${attachment.fileName}`;
    return String(messageText || "").slice(0, 100);
  }

  function renderMessageContent(messageText) {
    const raw = String(messageText || "").trim();
    const attachment = parseAttachment(raw);
    if (attachment) return createAttachmentElement(attachment);

    const textEl = document.createElement("p");
    textEl.classList.add("message-text");
    textEl.textContent = raw;
    return textEl;
  }

  // ----------------------------------------------------------
  // EMOJI DATASET & EMOJI PICKER LOGIC
  // ----------------------------------------------------------
  const EMOJI_DATA = {
    smileys: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
      '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
      '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦',
      '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
      '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿',
      '💀', '💩', '🤡', '👻', '👽', '🤖'
    ],
    gestures: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
      '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
      '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
      '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂',
      '🦻', '👃', '🧠', '👀', '👁️', '👅', '👄'
    ],
    hearts: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💌',
      '💋', '🫂'
    ],
    party: [
      '🎉', '🎊', '🎈', '🎂', '🍰', '🍾', '🥂', '🍻', '🍺', '🎁',
      '🎆', '🎇', '🧨', '✨', '🌟', '⭐', '💫', '🏆', '🥇', '🥈',
      '🥉', '🎖️', '🏅'
    ],
    popular: [
      '🔥', '💯', '⚡', '💥', '💣', '💨', '💫', '🎯', '🚀', '✈️',
      '☀️', '🌙', '🌈', '☕', '🍕', '🍔', '🍟', '🍿', '🍫', '🍩',
      '🍪', '🍦', '🎮', '🎵', '🎶', '📢', '🔔', '💡', '💰', '💵',
      '💎', '🔑', '🔒', '📌', '📍', '🚩', '🏁', '⏳', '⌛', '⚙️'
    ]
  };

  let activeEmojiCategory = 'smileys';

  function renderEmojiGrid(filterText = '') {
    if (!emojiGrid) return;
    emojiGrid.textContent = '';
    const query = (filterText || '').trim();
    let list = [];

    if (query) {
      Object.values(EMOJI_DATA).forEach((arr) => {
        list.push(...arr);
      });
      list = [...new Set(list)];
    } else {
      list = EMOJI_DATA[activeEmojiCategory] || [];
    }

    list.forEach((emoji) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-item';
      btn.textContent = emoji;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        insertEmojiAtCursor(emoji);
      });
      emojiGrid.appendChild(btn);
    });
  }

  function insertEmojiAtCursor(emoji) {
    const start = messageInput.selectionStart || messageInput.value.length;
    const end = messageInput.selectionEnd || messageInput.value.length;
    const oldText = messageInput.value;
    messageInput.value = oldText.substring(0, start) + emoji + oldText.substring(end);
    messageInput.focus();
    const newPos = start + emoji.length;
    messageInput.setSelectionRange(newPos, newPos);

    // Typing indicator ko trigger karo
    messageInput.dispatchEvent(new Event('input'));
  }

  function renderReactions(msg, bubble, isGroup) {
    let container = bubble.querySelector(".message-reactions");
    let reactions = {};
    try {
      reactions = typeof msg.reactions === "string" ? JSON.parse(msg.reactions || "{}") : (msg.reactions || {});
    } catch (e) {
      reactions = {};
    }

    const emojis = Object.keys(reactions);
    if (emojis.length === 0) {
      if (container) container.remove();
      return;
    }

    if (!container) {
      container = document.createElement("div");
      container.className = "message-reactions";
      bubble.appendChild(container);
    } else {
      container.textContent = "";
    }

    emojis.forEach((emoji) => {
      const userList = reactions[emoji];
      if (!Array.isArray(userList) || userList.length === 0) return;

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "reaction-pill";
      const hasMyReaction = userList.includes(Number(currentUser.id));
      if (hasMyReaction) pill.classList.add("mine");
      pill.title = `${userList.length} reaction${userList.length > 1 ? 's' : ''}`;
      pill.innerHTML = `<span>${emoji}</span> <span class="reaction-count">${userList.length}</span>`;

      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        if (socket && socket.connected) {
          socket.emit("message_reaction", {
            message_id: msg.id,
            is_group: isGroup,
            emoji: emoji
          });
        }
      });
      container.appendChild(pill);
    });
  }

  function cancelActionBar() {
    if (editingMessage) {
      messageInput.value = "";
    }
    replyingTo = null;
    editingMessage = null;
    messageActionBar.classList.add("hidden");
    if (emojiPickerContainer) emojiPickerContainer.classList.add("hidden");
    if (chatDropdownMenu) chatDropdownMenu.classList.add("hidden");
  }

  function setReplyingTo(msg, isGroup) {
    editingMessage = null;
    let senderName = "User";
    if (Number(msg.sender_id) === Number(currentUser.id)) {
      senderName = "You";
    } else if (msg.sender_name) {
      senderName = msg.sender_name;
    } else if (activeChat) {
      senderName = activeChat.username;
    }

    replyingTo = {
      id: msg.id,
      sender_name: senderName,
      message: msg.message,
      is_group: isGroup
    };

    actionBarTitle.textContent = "Replying to " + senderName;
    actionBarText.textContent = messagePreview(msg.message);
    messageActionBar.classList.remove("hidden");
    messageInput.focus();
  }

  function setEditingMessage(msg, isGroup) {
    replyingTo = null;
    editingMessage = {
      id: msg.id,
      message: msg.message,
      is_group: isGroup
    };

    actionBarTitle.textContent = "Editing message";
    actionBarText.textContent = messagePreview(msg.message);
    messageActionBar.classList.remove("hidden");
    const att = parseAttachment(msg.message);
    messageInput.value = att ? "" : msg.message;
    messageInput.focus();
  }

  function copyMessageText(msgText) {
    const att = parseAttachment(msgText);
    const textToCopy = att ? (window.location.origin + att.url) : String(msgText || "").trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showNotice("Message copied to clipboard!", "success");
      }).catch(() => {
        fallbackCopy(textToCopy);
      });
    } else {
      fallbackCopy(textToCopy);
    }
  }

  function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      showNotice("Message copied to clipboard!", "success");
    } catch (err) {
      showNotice("Could not copy message.", "error");
    }
    document.body.removeChild(textArea);
  }

  function openDeleteDialog(msg, isGroup) {
    pendingDelete = {
      id: msg.id,
      is_group: isGroup,
      sender_id: msg.sender_id,
      is_deleted_for_everyone: msg.is_deleted_for_everyone
    };

    const isMine = Number(msg.sender_id) === Number(currentUser.id);
    if (isMine && !msg.is_deleted_for_everyone) {
      deleteForEveryoneBtn.classList.remove("hidden");
    } else {
      deleteForEveryoneBtn.classList.add("hidden");
    }
    deleteDialog.showModal();
  }

  function openForwardDialog(msg) {
    pendingForward = { message: msg.message };
    forwardList.textContent = "";

    // Show Groups
    if (userGroups && userGroups.length > 0) {
      userGroups.forEach((g) => {
        const li = document.createElement("li");
        li.className = "forward-item";
        const avatar = document.createElement("div");
        avatar.className = "avatar avatar-purple";
        avatar.textContent = "👥";
        const name = document.createElement("span");
        name.className = "forward-item-name";
        name.textContent = g.name + " (Group)";
        li.appendChild(avatar);
        li.appendChild(name);
        li.addEventListener("click", () => forwardToTarget(g, true));
        forwardList.appendChild(li);
      });
    }

    // Show Users
    allUsers.forEach((u) => {
      const li = document.createElement("li");
      li.className = "forward-item";
      const avatar = document.createElement("div");
      avatar.className = "avatar " + colorFor(u.id);
      avatar.textContent = u.username.charAt(0).toUpperCase();
      const name = document.createElement("span");
      name.className = "forward-item-name";
      name.textContent = u.username;
      li.appendChild(avatar);
      li.appendChild(name);
      li.addEventListener("click", () => forwardToTarget(u, false));
      forwardList.appendChild(li);
    });

    forwardDialog.showModal();
  }

  function forwardToTarget(target, isGroup) {
    if (!pendingForward || !socket.connected) return;
    if (isGroup) {
      socket.emit("send_group_message", {
        group_id: target.id,
        sender_id: currentUser.id,
        message: pendingForward.message
      });
      showNotice(`Message forwarded to ${target.name}!`, "success");
    } else {
      socket.emit("send_private_message", {
        sender_id: currentUser.id,
        receiver_id: target.id,
        message: pendingForward.message
      });
      showNotice(`Message forwarded to ${target.username}!`, "success");
    }
    forwardDialog.close();
    pendingForward = null;
  }

  function createMessageMenu(msg, isGroup, bubble) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msg-menu-btn";
    btn.title = "Message options";
    btn.textContent = "⋮";

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = bubble.querySelector(".msg-dropdown");
      document.querySelectorAll(".msg-dropdown").forEach((d) => d.remove());
      if (existing) return;

      const dropdown = document.createElement("div");
      dropdown.className = "msg-dropdown";

      // Quick emoji reaction bar at top
      const reactionBar = document.createElement("div");
      reactionBar.className = "reaction-bar";
      const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
      quickEmojis.forEach((em) => {
        const rBtn = document.createElement("button");
        rBtn.type = "button";
        rBtn.className = "reaction-btn";
        rBtn.textContent = em;
        rBtn.title = `React ${em}`;
        rBtn.addEventListener("click", () => {
          dropdown.remove();
          if (socket && socket.connected) {
            socket.emit("message_reaction", {
              message_id: msg.id,
              is_group: isGroup,
              emoji: em
            });
          }
        });
        reactionBar.appendChild(rBtn);
      });
      dropdown.appendChild(reactionBar);

      // 1. Reply
      const replyBtn = document.createElement("button");
      replyBtn.type = "button";
      replyBtn.className = "msg-dropdown-item";
      replyBtn.innerHTML = "<span>💬</span> Reply";
      replyBtn.addEventListener("click", () => {
        dropdown.remove();
        setReplyingTo(msg, isGroup);
      });
      dropdown.appendChild(replyBtn);

      // 2. Copy
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "msg-dropdown-item";
      copyBtn.innerHTML = "<span>📋</span> Copy";
      copyBtn.addEventListener("click", () => {
        dropdown.remove();
        copyMessageText(msg.message);
      });
      dropdown.appendChild(copyBtn);

      // 3. Edit (if own message and not deleted)
      const isMine = Number(msg.sender_id) === Number(currentUser.id);
      if (isMine && !msg.is_deleted_for_everyone) {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "msg-dropdown-item";
        editBtn.innerHTML = "<span>✏️</span> Edit";
        editBtn.addEventListener("click", () => {
          dropdown.remove();
          setEditingMessage(msg, isGroup);
        });
        dropdown.appendChild(editBtn);
      }

      // 4. Forward / Share
      const shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "msg-dropdown-item";
      shareBtn.innerHTML = "<span>↗️</span> Forward / Share";
      shareBtn.addEventListener("click", () => {
        dropdown.remove();
        openForwardDialog(msg);
      });
      dropdown.appendChild(shareBtn);

      // 5. Delete
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "msg-dropdown-item danger";
      delBtn.innerHTML = "<span>🗑️</span> Delete";
      delBtn.addEventListener("click", () => {
        dropdown.remove();
        openDeleteDialog(msg, isGroup);
      });
      dropdown.appendChild(delBtn);

      bubble.appendChild(dropdown);
    });

    return btn;
  }

  // Ek message bubble banakar feed me jodta hai.
  // msg = server ka savedMessage object ({ sender_id, receiver_id, message, created_at, status ... })
  // type = "sent" ya "received"
  function addMessageBubble(msg, type) {
    const placeholder = messageFeed.querySelector(".feed-placeholder");
    if (placeholder) placeholder.remove();

    const bubble = document.createElement("div");
    bubble.classList.add("message", type);
    if (msg.id) bubble.dataset.id = msg.id;

    if (msg.is_deleted_for_everyone) {
      bubble.classList.add("deleted");
      const delText = document.createElement("p");
      delText.className = "message-text";
      delText.textContent = "🚫 This message was deleted";
      bubble.appendChild(delText);

      const timeEl = document.createElement("span");
      timeEl.classList.add("message-time");
      timeEl.textContent = formatTime(msg.created_at);
      bubble.appendChild(timeEl);

      messageFeed.appendChild(bubble);
      scrollToBottom();
      return;
    }

    // Quoted reply if exists
    if (msg.reply_to_text) {
      const quoteEl = document.createElement("div");
      quoteEl.className = "message-reply-quote";
      const quoteSender = document.createElement("span");
      quoteSender.className = "quote-sender";
      quoteSender.textContent = msg.reply_to_sender || "User";
      const quoteText = document.createElement("p");
      quoteText.className = "quote-text";
      quoteText.textContent = messagePreview(msg.reply_to_text);
      quoteEl.appendChild(quoteSender);
      quoteEl.appendChild(quoteText);
      quoteEl.addEventListener("click", () => {
        const target = messageFeed.querySelector(`.message[data-id="${msg.reply_to_id}"]`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.style.transition = "background 0.3s";
          const oldBg = target.style.background;
          target.style.background = "#fff3cd";
          setTimeout(() => { target.style.background = oldBg; }, 1200);
        }
      });
      bubble.appendChild(quoteEl);
    }

    const contentEl = renderMessageContent(msg.message);
    bubble.appendChild(contentEl);

    const timeEl = document.createElement("span");
    timeEl.classList.add("message-time");

    if (msg.is_edited) {
      const editedSpan = document.createElement("span");
      editedSpan.className = "edited-badge";
      editedSpan.textContent = "edited";
      timeEl.appendChild(editedSpan);
    }

    const timeText = document.createElement("span");
    timeText.textContent = formatTime(msg.created_at);
    timeEl.appendChild(timeText);

    if (type === "sent") {
      const isSeen = msg.status === "seen";
      const statusEl = document.createElement("span");
      statusEl.className = "message-status " + (isSeen ? "seen" : "sent");
      statusEl.textContent = isSeen ? "✓✓" : "✓";
      statusEl.title = isSeen ? "Seen" : "Sent";
      timeEl.appendChild(statusEl);
    }

    bubble.appendChild(timeEl);
    renderReactions(msg, bubble, false);
    bubble.appendChild(createMessageMenu(msg, false, bubble));

    messageFeed.appendChild(bubble);
    scrollToBottom();
  }

  // Sidebar ki "last message" preview update karne ke liye data store karo.
  function setLastMessage(userId, text, createdAt) {
    lastMessages[userId] = { text: text, time: formatTime(createdAt) };
  }

  async function loadBlockedUsers() {
    try {
      const res = await apiGet("/api/users/blocked");
      if (res.ok && res.data) {
        blockedByMe = new Set((res.data.blockedByMe || []).map(Number));
        blockedMe = new Set((res.data.blockedMe || []).map(Number));
        updateChatHeader();
        renderUserList();
      }
    } catch (e) {
      console.error("Failed to load blocked users:", e);
    }
  }

  // Chat header (naam, avatar, online/offline, typing, block status) ko activeChat ke hisaab se update karo.
  function updateChatHeader() {
    const typingIndicator = document.getElementById("typing-indicator");
    if (!activeChat) {
      chatName.textContent = "Select a chat";
      chatAvatar.textContent = "?";
      chatAvatar.className = "avatar avatar-blue";
      chatStatus.textContent = "";
      chatStatus.classList.remove("online", "blocked");
      if (typingIndicator) typingIndicator.classList.add("hidden");
      if (chatHeaderActions) chatHeaderActions.classList.add("hidden");
      if (blockedBanner) blockedBanner.classList.add("hidden");
      return;
    }

    if (chatHeaderActions) {
      chatHeaderActions.classList.remove("hidden");
      if (clearChatBtn) clearChatBtn.classList.remove("hidden");
      if (blockUserBtn) blockUserBtn.classList.remove("hidden");
    }

    chatName.textContent = activeChat.username;
    chatAvatar.textContent = activeChat.username.charAt(0).toUpperCase();
    chatAvatar.className = "avatar " + colorFor(activeChat.id);

    const chatId = Number(activeChat.id);
    const isBlockedByMe = blockedByMe.has(chatId);
    const isBlockedMe = blockedMe.has(chatId);

    if (blockBtnText) {
      blockBtnText.textContent = isBlockedByMe ? "Unblock User" : "Block User";
    }

    if (isBlockedByMe) {
      chatStatus.textContent = "Blocked";
      chatStatus.className = "chat-status blocked";
      if (typingIndicator) typingIndicator.classList.add("hidden");
      if (blockedBanner) {
        blockedBanner.classList.remove("hidden");
        if (blockedBannerText) blockedBannerText.textContent = "You have blocked this contact.";
        if (unblockBannerBtn) unblockBannerBtn.classList.remove("hidden");
      }
      setInputEnabled(false);
      messageInput.placeholder = "You have blocked this contact. Unblock to message.";
    } else if (isBlockedMe) {
      chatStatus.textContent = "offline";
      chatStatus.className = "chat-status";
      if (typingIndicator) typingIndicator.classList.add("hidden");
      if (blockedBanner) {
        blockedBanner.classList.remove("hidden");
        if (blockedBannerText) blockedBannerText.textContent = "You cannot message this contact because you are blocked.";
        if (unblockBannerBtn) unblockBannerBtn.classList.add("hidden");
      }
      setInputEnabled(false);
      messageInput.placeholder = "You cannot message this contact.";
    } else {
      if (blockedBanner) blockedBanner.classList.add("hidden");
      const isTyping = typingUsers.has(chatId);
      const online = isOnline(chatId);
      chatStatus.textContent = online ? "online" : "offline";
      chatStatus.className = "chat-status" + (online ? " online" : "");
      if (isTyping) {
        if (typingIndicator) typingIndicator.classList.remove("hidden");
        chatStatus.classList.add("hidden");
      } else {
        if (typingIndicator) typingIndicator.classList.add("hidden");
        chatStatus.classList.remove("hidden");
      }
      setInputEnabled(true);
      messageInput.placeholder = "Type a message...";
    }
  }

  // Message input ko enable/disable karo (chat select hone se pehle type nahi kar sakte).
  function setInputEnabled(enabled) {
    messageInput.disabled = !enabled;
    messageSendBtn.disabled = !enabled;
  }

  async function restoreSession() {
    const response = await apiGet("/api/auth/me");

    if (!response.ok) {
      clearUser();
      authView.classList.remove("hidden");
      chatView.classList.add("hidden");
      return;
    }

    const user = response.data && response.data.user ? response.data.user : null;
    if (!user || !user.id) {
      clearUser();
      authView.classList.remove("hidden");
      chatView.classList.add("hidden");
      return;
    }

    saveUser(user);
    startSession(user);
  }

  // Sidebar me ek user ka item (li) banao.
  function createUserItem(user) {
    const li = document.createElement("li");
    li.className = "conversation-item";
    if (activeChat && Number(activeChat.id) === Number(user.id)) {
      li.classList.add("active");
    }
    li.dataset.name = user.username;

    // Avatar: pehla letter + (online ho to) hara badge
    const avatar = document.createElement("div");
    avatar.className = "avatar " + colorFor(user.id);
    avatar.textContent = user.username.charAt(0).toUpperCase();
    if (isOnline(user.id)) {
      const badge = document.createElement("span");
      badge.className = "online-badge";
      avatar.appendChild(badge);
    }

    const info = document.createElement("div");
    info.className = "conversation-info";

    // Upar wali line: naam + time
    const top = document.createElement("div");
    top.className = "conversation-top";
    const nameEl = document.createElement("h3");
    nameEl.textContent = user.username;
    if (blockedByMe.has(Number(user.id))) {
      const bBadge = document.createElement("span");
      bBadge.className = "blocked-badge";
      bBadge.textContent = "Blocked";
      nameEl.appendChild(bBadge);
    }
    const timeEl = document.createElement("span");
    timeEl.className = "conversation-time";
    timeEl.textContent = lastMessages[user.id] ? lastMessages[user.id].time : "";
    top.appendChild(nameEl);
    top.appendChild(timeEl);

    // Neeche wali line: last message preview + unread count
    const bottom = document.createElement("div");
    bottom.className = "conversation-bottom";

    const last = document.createElement("p");
    last.className = "conversation-last";

    const isUserTyping = typingUsers.has(Number(user.id));
    if (isUserTyping) {
      const typingSpan = document.createElement("span");
      typingSpan.className = "typing-preview";
      typingSpan.textContent = "typing...";
      last.appendChild(typingSpan);
    } else {
      last.textContent = lastMessages[user.id] ? lastMessages[user.id].text : "Tap to start chatting";
    }
    bottom.appendChild(last);

    const unread = unreadCounts[user.id] || 0;
    if (unread > 0) {
      const unreadBadge = document.createElement("span");
      unreadBadge.textContent = unread > 99 ? "99+" : unread;
      unreadBadge.className = "unread-badge";
      unreadBadge.title = `${unread} unread messages`;
      bottom.appendChild(unreadBadge);
    }

    info.appendChild(top);
    info.appendChild(bottom);
    li.appendChild(avatar);
    li.appendChild(info);

    // Is user par click = isse chat open karo
    li.addEventListener("click", () => selectChat(user));
    return li;
  }

  // Sidebar ki poori list dobara banao (users load, online change, naya message, search ke time).
  function renderUserList() {
    conversationList.textContent = "";
    // Render Groups First
    if (userGroups && userGroups.length > 0) {
      const groupHeader = document.createElement("li");
      groupHeader.className = "conversation-section-title";
      groupHeader.textContent = "Groups";
      conversationList.appendChild(groupHeader);

      userGroups.forEach(group => {
        const li = document.createElement("li");
        li.className = "conversation-item";
        if (activeGroup && activeGroup.id === group.id) li.classList.add("active");

        const avatar = document.createElement("div");
        avatar.className = "avatar avatar-purple";
        avatar.textContent = "👥";
        const info = document.createElement("div");
        info.className = "conversation-info";
        const top = document.createElement("div");
        top.className = "conversation-top";
        const name = document.createElement("h3");
        name.textContent = group.name;
        top.appendChild(name);

        const bottom = document.createElement("div");
        bottom.className = "conversation-bottom";
        const last = document.createElement("p");
        last.className = "conversation-last";
        last.textContent = "Tap to open group chat";
        bottom.appendChild(last);

        info.appendChild(top);
        info.appendChild(bottom);
        li.appendChild(avatar);
        li.appendChild(info);
        li.addEventListener("click", () => selectGroupChat(group));
        conversationList.appendChild(li);
      });

      const userHeader = document.createElement("li");
      userHeader.className = "conversation-section-title";
      userHeader.textContent = "Direct Messages";
      conversationList.appendChild(userHeader);
    }

    const keyword = searchInput.value.toLowerCase().trim();
    const visibleUsers = allUsers.filter((user) => user.username.toLowerCase().includes(keyword));

    if (visibleUsers.length === 0) {
      const empty = document.createElement("li");
      empty.className = "conversation-empty";
      empty.textContent = allUsers.length === 0 ? "No other users registered yet." : "No users found.";
      conversationList.appendChild(empty);
      return;
    }

    visibleUsers.forEach((user) => conversationList.appendChild(createUserItem(user)));
  }

  // ----------------------------------------------------------
  // 5. USERS AUR CHAT HISTORY LOAD KARNA (GET requests)
  // ----------------------------------------------------------

  // GET /api/users: saare registered users laao aur unread counts load karo.
  async function loadUsers() {
    try {
      const [usersRes, unreadRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/unread-counts").catch(() => null),
      ]);
      if (!usersRes.ok) throw new Error("Users load failed");
      const data = await usersRes.json();

      if (unreadRes && unreadRes.ok) {
        try {
          const counts = await unreadRes.json();
          if (counts && typeof counts === "object") {
            Object.assign(unreadCounts, counts);
          }
        } catch (parseError) {}
      }

      // Server array bheje ya { users: [...] }, dono chalega.
      const users = Array.isArray(data) ? data : data.users || [];

      allUsers = users
        .filter((user) => Number(user.id) !== Number(currentUser.id)) // khud ko hatao
        .map((user) => ({ id: user.id, username: user.username || user.name || user.email || "User " + user.id }));

      renderUserList();
    } catch (error) {
      conversationList.textContent = "";
      const failed = document.createElement("li");
      failed.className = "conversation-empty error";
      failed.textContent = "Could not load users.";
      conversationList.appendChild(failed);
    }
  }

  // GET /api/messages/:userId1/:userId2: do users ke beech purane messages laao.
  async function loadHistory(user) {
    const requestedId = user.id; // yaad rakho kis user ki history maangi thi
    try {
      const response = await fetch("/api/messages/" + currentUser.id + "/" + user.id);
      if (!response.ok) throw new Error("History load failed");
      const data = await response.json();
      const messages = Array.isArray(data) ? data : data.messages || [];

      // Agar history aate-aate user ne dusri chat khol li, to ye purana jawab ignore karo
      // (warna galat chat me messages dikh jaate).
      if (!activeChat || Number(activeChat.id) !== Number(requestedId)) return;

      messageFeed.textContent = "";

      if (messages.length === 0) {
        showFeedPlaceholder("No messages yet. Say hi!");
        return;
      }

      // Har purane message ke liye bubble: mera bheja = sent, baaki = received
      messages.forEach((msg) => {
        const type = Number(msg.sender_id) === Number(currentUser.id) ? "sent" : "received";
        addMessageBubble(msg, type);
      });

      // Sidebar preview me aakhri message dikhao
      const lastMsg = messages[messages.length - 1];
      const prefix = Number(lastMsg.sender_id) === Number(currentUser.id) ? "You: " : "";
      setLastMessage(user.id, prefix + messagePreview(lastMsg.message), lastMsg.created_at);
      renderUserList();
    } catch (error) {
      if (activeChat && Number(activeChat.id) === Number(requestedId)) {
        showFeedPlaceholder("Could not load messages.");
      }
    }
  }

  // Sidebar se kisi user par click: use active chat partner banao.
  function selectChat(user) {
    cancelActionBar();
    activeChat = user;
    activeGroup = null;
    unreadCounts[user.id] = 0; // is chat ke unread messages ab padh liye

    updateChatHeader();
    showFeedPlaceholder("Loading messages...");
    renderUserList(); // active highlight + unread badge hatane ke liye

    chatView.classList.add("chat-open"); // mobile par chat area dikhao
    loadHistory(user);
    if (!blockedByMe.has(Number(user.id)) && !blockedMe.has(Number(user.id))) {
      messageInput.focus();
    }

    if (socket && socket.connected) {
      socket.emit("mark_messages_seen", { sender_id: user.id });
    }
  }

  // ----------------------------------------------------------
  // 6. SESSION START / END (login ke baad aur logout par)
  // ----------------------------------------------------------

  // Login ya server-verified session restoration ke baad ye chalta hai.
  function startSession(user) {
    currentUser = user;

    // State reset karo (pichle user ka data bacha na rahe)
    activeChat = null;
    allUsers = [];
    onlineUserIds = [];
    Object.keys(lastMessages).forEach((key) => delete lastMessages[key]);
    Object.keys(unreadCounts).forEach((key) => delete unreadCounts[key]);
    searchInput.value = "";
    activeGroup = null;
    userGroups = [];
    blockedByMe.clear();
    blockedMe.clear();
    pendingBlockAction = null;
    typingUsers.forEach((timer) => clearTimeout(timer));
    typingUsers.clear();
    clearTimeout(typingTimeout);
    isCurrentlyTyping = false;

    // Dashboard dikhao
    myName.textContent = user.username;
    myAvatar.textContent = user.username.charAt(0).toUpperCase();
    authView.classList.add("hidden");
    chatView.classList.remove("hidden");
    chatView.classList.remove("chat-open");

    updateChatHeader();
    setInputEnabled(false);
    showFeedPlaceholder("Select a user to start chatting");

    socket.connect();

    loadBlockedUsers();
    loadUsers(); // sidebar me baaki users laao
    loadUserGroups();
  }

  // Logout par: socket band, state clear, localStorage clear, login screen.
  async function endSession() {
    socket.disconnect(); // WebSocket connection band; server is user ko offline maan lega

    currentUser = null;
    activeChat = null;
    allUsers = [];
    onlineUserIds = [];
    typingUsers.forEach((timer) => clearTimeout(timer));
    typingUsers.clear();
    clearTimeout(typingTimeout);
    isCurrentlyTyping = false;

    clearUser(); // localStorage se user hatao
    conversationList.textContent = "";
    messageFeed.textContent = "";

    clearAuthMessages();
    switchTab("login");
    chatView.classList.add("hidden");
    chatView.classList.remove("chat-open");
    authView.classList.remove("hidden");
  }

  // ----------------------------------------------------------
  // 7. SOCKET.IO EVENT LISTENERS (server se aane wale events)
  // ----------------------------------------------------------

  // "connect": socket server se jud gaya (pehli baar ya network tootne ke baad auto-reconnect par).
  // Reconnect par server purani mapping bhool chuka hota hai, isliye dobara register karna zaroori hai.
  socket.on("connect", () => {
    if (currentUser) {
      socket.emit("register_user", currentUser.id);
    }
  });

  socket.on("connect_error", (error) => {
    showNotice(error.message === "Authentication required." ? "Please log in to connect." : "Connection lost. Trying to reconnect...", "error");
    if (error.message === "Authentication required." && currentUser) endSession();
  });

  socket.on("session_expired", (data) => {
    showNotice(data.message || "Your session expired. Please log in again.", "error");
    endSession();
  });

  socket.on("message_error", (data) => showNotice(data.error || "Message could not be sent.", "error"));
  socket.on("group_error", (data) => showNotice(data.error || "Group action was not allowed.", "error"));

  // "online_users_list": server ne abhi online users ki id array bheji.
  // Isse sidebar ke hare badge aur chat header ka online/offline status update hota hai.
  socket.on("online_users_list", (userIds) => {
    onlineUserIds = Array.isArray(userIds) ? userIds : [];
    renderUserList();
    updateChatHeader();
  });

  // "receive_private_message": kisi ne mujhe message bheja.
  socket.on("receive_private_message", (msg) => {
    const fromId = Number(msg.sender_id);
    const isOpenChat = activeChat && Number(activeChat.id) === fromId;

    if (isOpenChat) {
      // Wahi chat khuli hai to seedha bubble add karo (real-time)
      addMessageBubble(msg, "received");
      // Open chat hai to turant seen mark bhej do
      socket.emit("mark_messages_seen", { sender_id: fromId });
    } else {
      // Chat band hai (ya dusri chat khuli hai) to unread count badhao
      unreadCounts[fromId] = (unreadCounts[fromId] || 0) + 1;
    }

    setTypingIndicator(fromId, false);
    setLastMessage(fromId, messagePreview(msg.message), msg.created_at);
    renderUserList();
  });

  // "message_sent_confirm": server ne confirm kiya ki mera message save ho gaya aur bhej diya gaya.
  // Bubble yahin dikhate hain (send par nahi) taaki sirf wahi message dikhe jo sach me save hua.
  socket.on("message_sent_confirm", (msg) => {
    const toId = Number(msg.receiver_id);
    if (activeChat && Number(activeChat.id) === toId) {
      addMessageBubble(msg, "sent");
    }
    setLastMessage(toId, "You: " + messagePreview(msg.message), msg.created_at);
    renderUserList();
  });

  // "messages_seen": samne wale ne mere messages dekh liye (double blue ticks update)
  socket.on("messages_seen", (data) => {
    const viewerId = Number(data.viewer_id || data.receiver_id);
    if (activeChat && Number(activeChat.id) === viewerId) {
      const sentTicks = messageFeed.querySelectorAll(".message.sent .message-status");
      sentTicks.forEach((tick) => {
        tick.className = "message-status seen";
        tick.textContent = "✓✓";
        tick.title = "Seen";
      });
    }
  });

  // "user_typing": koi user type kar raha hai ya stop ho gaya
  socket.on("user_typing", (data) => {
    if (data && data.sender_id) {
      setTypingIndicator(Number(data.sender_id), Boolean(data.is_typing));
    }
  });

  // ----------------------------------------------------------
  // 8. MESSAGE BHEJNA (send_private_message emit)
  // ----------------------------------------------------------
  messageForm.addEventListener("submit", (event) => {
    event.preventDefault(); // page reload rokna

    const text = messageInput.value.trim();
    if (text === "" || (!activeChat && !activeGroup) || !currentUser) return;

    if (!socket.connected) {
      showNotice("Server connection is unavailable. Reconnecting...", "error");
      return;
    }

    if (isCurrentlyTyping && activeChat) {
      isCurrentlyTyping = false;
      clearTimeout(typingTimeout);
      socket.emit("typing_stop", { receiver_id: activeChat.id });
    }

    // Agar Edit mode hai
    if (editingMessage) {
      socket.emit("edit_message", {
        message_id: editingMessage.id,
        is_group: editingMessage.is_group,
        new_message: text
      });
      cancelActionBar();
      messageInput.value = "";
      return;
    }

    const replyPayload = replyingTo ? {
      reply_to_id: replyingTo.id,
      reply_to_text: replyingTo.message,
      reply_to_sender: replyingTo.sender_name
    } : {};

    // 1. Agar Group Chat open hai
    if (activeGroup) {
      socket.emit("send_group_message", {
        group_id: activeGroup.id,
        sender_id: currentUser.id,
        message: text,
        ...replyPayload
      });
    } 
    // 2. Agar Private One-to-One Chat open hai
    else if (activeChat) {
      socket.emit("send_private_message", {
        sender_id: currentUser.id,
        receiver_id: activeChat.id,
        message: text,
        ...replyPayload
      });
    }

    cancelActionBar();
    messageInput.value = "";
    messageInput.focus();
  });

  // Message input par typing indicator events emit karna
  messageInput.addEventListener("input", () => {
    if (!activeChat || !socket.connected) return;

    if (!isCurrentlyTyping && messageInput.value.trim().length > 0) {
      isCurrentlyTyping = true;
      socket.emit("typing_start", { receiver_id: activeChat.id });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (isCurrentlyTyping) {
        isCurrentlyTyping = false;
        if (activeChat && socket.connected) {
          socket.emit("typing_stop", { receiver_id: activeChat.id });
        }
      }
    }, 1800);
  });

  // Group message receive hone par
  socket.on("receive_group_message", (msg) => {
    if (activeGroup && Number(activeGroup.id) === Number(msg.group_id)) {
      const type = Number(msg.sender_id) === Number(currentUser.id) ? "sent" : "received";
      addGroupMessageBubble(msg, type);
    }
  });

  // "message_edited": message edit ho gaya (real-time update)
  socket.on("message_edited", (data) => {
    const bubble = messageFeed.querySelector(`.message[data-id="${data.id}"]`);
    if (bubble) {
      const textEl = bubble.querySelector(".message-text");
      if (textEl) {
        textEl.textContent = data.message;
      }
      const timeEl = bubble.querySelector(".message-time");
      if (timeEl && !timeEl.querySelector(".edited-badge")) {
        const editedSpan = document.createElement("span");
        editedSpan.className = "edited-badge";
        editedSpan.textContent = "edited";
        timeEl.insertBefore(editedSpan, timeEl.firstChild);
      }
    }
  });

  // "message_deleted_for_everyone": message delete ho gaya sabke liye
  socket.on("message_deleted_for_everyone", (data) => {
    const bubble = messageFeed.querySelector(`.message[data-id="${data.id}"]`);
    if (bubble) {
      bubble.classList.add("deleted");
      bubble.innerHTML = "";
      const delText = document.createElement("p");
      delText.className = "message-text";
      delText.textContent = "🚫 This message was deleted";
      bubble.appendChild(delText);

      const timeEl = document.createElement("span");
      timeEl.classList.add("message-time");
      timeEl.textContent = "Deleted";
      bubble.appendChild(timeEl);
    }
  });

  // "message_deleted_for_me": mere liye message delete ho gaya
  socket.on("message_deleted_for_me", (data) => {
    const bubble = messageFeed.querySelector(`.message[data-id="${data.id}"]`);
    if (bubble) bubble.remove();
  });

  // "message_reaction_updated": reaction add/remove hua (real-time update)
  socket.on("message_reaction_updated", (data) => {
    const bubble = messageFeed.querySelector(`.message[data-id="${data.id}"]`);
    if (bubble) {
      renderReactions({ id: data.id, reactions: data.reactions }, bubble, Boolean(data.is_group));
    }
  });

  // "user_blocked_status": real-time block/unblock updates
  socket.on("user_blocked_status", (data) => {
    const targetId = Number(data.user_id);
    if (data.is_blocked_by_me !== undefined) {
      if (data.is_blocked_by_me) {
        blockedByMe.add(targetId);
      } else {
        blockedByMe.delete(targetId);
      }
    }
    if (data.is_blocked_me !== undefined) {
      if (data.is_blocked_me) {
        blockedMe.add(targetId);
      } else {
        blockedMe.delete(targetId);
      }
    }
    updateChatHeader();
    renderUserList();
  });

  // "chat_cleared": chat successfully cleared
  socket.on("chat_cleared", (data) => {
    const isGroup = Boolean(data.is_group);
    const targetId = Number(data.target_id);

    if (!isGroup && activeChat && Number(activeChat.id) === targetId) {
      messageFeed.textContent = "";
      showFeedPlaceholder("Chat cleared. No messages yet.");
      delete lastMessages[targetId];
      renderUserList();
      showNotice("Chat cleared.", "success");
    } else if (isGroup && activeGroup && Number(activeGroup.id) === targetId) {
      messageFeed.textContent = "";
      showFeedPlaceholder("Group chat cleared.");
      showNotice("Group chat cleared.", "success");
    }
  });

  // Action bar aur dialog buttons ke listeners
  cancelActionBtn.addEventListener("click", cancelActionBar);

  deleteCancelBtn.addEventListener("click", () => {
    deleteDialog.close();
    pendingDelete = null;
  });

  deleteForMeBtn.addEventListener("click", () => {
    if (!pendingDelete || !socket.connected) return;
    socket.emit("delete_message_for_me", {
      message_id: pendingDelete.id,
      is_group: pendingDelete.is_group
    });
    deleteDialog.close();
    const bubble = messageFeed.querySelector(`.message[data-id="${pendingDelete.id}"]`);
    if (bubble) bubble.remove();
    pendingDelete = null;
  });

  deleteForEveryoneBtn.addEventListener("click", () => {
    if (!pendingDelete || !socket.connected) return;
    socket.emit("delete_message_for_everyone", {
      message_id: pendingDelete.id,
      is_group: pendingDelete.is_group
    });
    deleteDialog.close();
    pendingDelete = null;
  });

  forwardCancelBtn.addEventListener("click", () => {
    forwardDialog.close();
    pendingForward = null;
  });

  // Chat Header Menu & Actions
  if (chatMenuBtn && chatDropdownMenu) {
    chatMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      chatDropdownMenu.classList.toggle("hidden");
    });
  }

  // Clear Chat Button & Dialog
  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      if (chatDropdownMenu) chatDropdownMenu.classList.add("hidden");
      if (!activeChat && !activeGroup) return;

      if (clearChatDesc) {
        if (activeChat) {
          clearChatDesc.textContent = `Are you sure you want to clear all messages with ${activeChat.username}? Messages will be deleted for you.`;
        } else if (activeGroup) {
          clearChatDesc.textContent = `Are you sure you want to clear all messages in "${activeGroup.name}"? Messages will be deleted for you.`;
        }
      }
      if (clearChatDialog) clearChatDialog.showModal();
    });
  }

  if (cancelClearChatBtn && clearChatDialog) {
    cancelClearChatBtn.addEventListener("click", () => {
      clearChatDialog.close();
    });
  }

  if (confirmClearChatBtn && clearChatDialog) {
    confirmClearChatBtn.addEventListener("click", () => {
      clearChatDialog.close();
      if (!socket || !socket.connected) return;

      if (activeChat) {
        socket.emit("clear_chat", { target_id: Number(activeChat.id), is_group: false });
      } else if (activeGroup) {
        socket.emit("clear_chat", { target_id: Number(activeGroup.id), is_group: true });
      }
    });
  }

  // Block / Unblock Handlers
  function openBlockDialog() {
    if (!activeChat) return;
    const chatId = Number(activeChat.id);
    const isBlocked = blockedByMe.has(chatId);

    if (isBlocked) {
      if (blockDialogTitle) blockDialogTitle.textContent = `Unblock ${activeChat.username}?`;
      if (blockDialogDesc) blockDialogDesc.textContent = `This contact will be able to send you messages and see your online status.`;
      if (confirmBlockUserBtn) {
        confirmBlockUserBtn.textContent = "Unblock";
        confirmBlockUserBtn.className = "btn-primary";
      }
      pendingBlockAction = { userId: chatId, action: "unblock" };
    } else {
      if (blockDialogTitle) blockDialogTitle.textContent = `Block ${activeChat.username}?`;
      if (blockDialogDesc) blockDialogDesc.textContent = `Blocked contacts will no longer be able to send you messages or see your typing status.`;
      if (confirmBlockUserBtn) {
        confirmBlockUserBtn.textContent = "Block";
        confirmBlockUserBtn.className = "btn-danger";
      }
      pendingBlockAction = { userId: chatId, action: "block" };
    }
    if (blockUserDialog) blockUserDialog.showModal();
  }

  if (blockUserBtn) {
    blockUserBtn.addEventListener("click", () => {
      if (chatDropdownMenu) chatDropdownMenu.classList.add("hidden");
      openBlockDialog();
    });
  }

  if (unblockBannerBtn) {
    unblockBannerBtn.addEventListener("click", () => {
      openBlockDialog();
    });
  }

  if (cancelBlockUserBtn && blockUserDialog) {
    cancelBlockUserBtn.addEventListener("click", () => {
      blockUserDialog.close();
      pendingBlockAction = null;
    });
  }

  if (confirmBlockUserBtn && blockUserDialog) {
    confirmBlockUserBtn.addEventListener("click", () => {
      blockUserDialog.close();
      if (!pendingBlockAction) return;

      const targetId = pendingBlockAction.userId;
      const action = pendingBlockAction.action;
      pendingBlockAction = null;

      if (action === "block") {
        blockedByMe.add(targetId);
        if (socket && socket.connected) {
          socket.emit("block_user", { user_id: targetId });
        }
        updateChatHeader();
        renderUserList();
        showNotice("User blocked.", "success");
      } else {
        blockedByMe.delete(targetId);
        if (socket && socket.connected) {
          socket.emit("unblock_user", { user_id: targetId });
        }
        updateChatHeader();
        renderUserList();
        showNotice("User unblocked.", "success");
      }
    });
  }

  // Emoji Picker UI Handlers
  if (emojiBtn && emojiPickerContainer) {
    emojiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = emojiPickerContainer.classList.contains("hidden");
      if (isHidden) {
        emojiPickerContainer.classList.remove("hidden");
        renderEmojiGrid(emojiSearchInput ? emojiSearchInput.value : "");
      } else {
        emojiPickerContainer.classList.add("hidden");
      }
    });
  }

  if (closeEmojiPicker && emojiPickerContainer) {
    closeEmojiPicker.addEventListener("click", (e) => {
      e.stopPropagation();
      emojiPickerContainer.classList.add("hidden");
    });
  }

  if (emojiCategoryTabs) {
    emojiCategoryTabs.addEventListener("click", (e) => {
      const tabBtn = e.target.closest(".emoji-tab-btn");
      if (!tabBtn) return;
      emojiCategoryTabs.querySelectorAll(".emoji-tab-btn").forEach((t) => t.classList.remove("active"));
      tabBtn.classList.add("active");
      activeEmojiCategory = tabBtn.dataset.category || "smileys";
      renderEmojiGrid(emojiSearchInput ? emojiSearchInput.value : "");
    });
  }

  if (emojiSearchInput) {
    emojiSearchInput.addEventListener("input", (e) => {
      renderEmojiGrid(e.target.value);
    });
  }

  // Bahar click karne par message options dropdown, header dropdown aur emoji picker close hona
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".msg-dropdown") && !e.target.closest(".msg-menu-btn")) {
      document.querySelectorAll(".msg-dropdown").forEach((d) => d.remove());
    }
    if (chatDropdownMenu && !chatDropdownMenu.classList.contains("hidden")) {
      if (!e.target.closest("#chat-dropdown-menu") && !e.target.closest("#chat-menu-btn")) {
        chatDropdownMenu.classList.add("hidden");
      }
    }
    if (emojiPickerContainer && !emojiPickerContainer.classList.contains("hidden")) {
      if (!e.target.closest("#emoji-picker-container") && !e.target.closest("#emoji-btn")) {
        emojiPickerContainer.classList.add("hidden");
      }
    }
  });

  // ----------------------------------------------------------
  // 9. AUTH FORMS (Register / Login / Logout)
  // ----------------------------------------------------------
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  // Register: POST /api/auth/register
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;

    if (!username || !email || !password || !confirm) {
      showMessage(registerError, "Please fill all the fields.", "error");
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      showMessage(registerError, "Username must be 3-20 characters (letters, numbers, underscore only).", "error");
      return;
    }
    if (password.length < 6) {
      showMessage(registerError, "Password must be at least 6 characters.", "error");
      return;
    }
    if (password !== confirm) {
      showMessage(registerError, "Passwords do not match.", "error");
      return;
    }

    showMessage(registerError, "", "error");
    setLoading(registerBtn, true, "Creating account...", "Create Account");
    const result = await apiPost("/api/auth/register", { username, email, password });
    setLoading(registerBtn, false, "Creating account...", "Create Account");

    if (!result.ok) {
      showMessage(registerError, result.data.error || "Registration failed.", "error");
      return;
    }

    registerForm.reset();
    switchTab("login");
    document.getElementById("login-email").value = email;
    showMessage(loginSuccess, "Account created! Please login.", "success");
    document.getElementById("login-password").focus();
  });

  // Login: POST /api/auth/login
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const identifier = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!identifier || !password) {
      showMessage(loginError, "Please enter email/username and password.", "error");
      return;
    }

    showMessage(loginError, "", "error");
    showMessage(loginSuccess, "", "error");
    setLoading(loginBtn, true, "Logging in...", "Login");
    const result = await apiPost("/api/auth/login", { identifier, password });
    setLoading(loginBtn, false, "Logging in...", "Login");

    if (!result.ok) {
      showMessage(loginError, result.data.error || "Login failed.", "error");
      return;
    }

    saveUser(result.data.user); // localStorage me save
    loginForm.reset();
    startSession(result.data.user); // dashboard + socket register + users load
  });

  // Logout button
  logoutBtn.addEventListener("click", async () => {
    await apiPost("/api/auth/logout", {});
    endSession();
  });

  // ----------------------------------------------------------
  // 10. BAAKI UI EVENTS
  // ----------------------------------------------------------

  // Mobile ka back button: wapas users list
  backBtn.addEventListener("click", () => {
    chatView.classList.remove("chat-open");
  });

  // Search bar: type karte hi list filter (renderUserList search text khud padh leta hai)
  searchInput.addEventListener("input", renderUserList);

  const fileInput = document.getElementById("file-input");

  // File upload handler: selected file ko server par upload karke message ke roop me bhej do.
  async function handleFileSelection(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || (!activeChat && !activeGroup) || !currentUser) {
      if (fileInput) fileInput.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    showNotice("Uploading file...", "info");

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        credentials: "same-origin",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "File upload failed");
      }

      const fileUrl = data.fileUrl || "";
      const fileName = data.fileName || file.name;
      const fileSize = data.fileSize || file.size;
      const fileMessage = "chat-attachment:" + JSON.stringify({
        type: "file",
        url: fileUrl,
        fileName,
        fileSize,
      });

      if (activeGroup) {
        socket.emit("send_group_message", {
          group_id: activeGroup.id,
          sender_id: currentUser.id,
          message: fileMessage
        });
      } else if (activeChat) {
        socket.emit("send_private_message", {
          sender_id: currentUser.id,
          receiver_id: activeChat.id,
          message: fileMessage
        });
      }
      showNotice("File uploaded and shared.", "success");
    } catch (error) {
      showNotice(error.message || "File upload failed.", "error");
    } finally {
      if (fileInput) fileInput.value = "";
    }
  }

  if (fileInput) {
    fileInput.addEventListener("change", handleFileSelection);
  }

  // ==========================================
  // GROUP CHAT MANAGEMENT LOGIC
  // ==========================================

  const createGroupBtn = document.getElementById("create-group-btn");
  if (createGroupBtn) {
    createGroupBtn.addEventListener("click", async () => {
      if (!currentUser) return;

      try {
        createGroupBtn.disabled = true;
        await loadUsers();
        groupMemberList.textContent = "";
        groupError.textContent = "";
        groupMembersEmpty.classList.toggle("hidden", allUsers.length > 0);

        allUsers.forEach((user) => {
          const label = document.createElement("label");
          label.className = "group-member-option";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.name = "member_ids";
          checkbox.value = String(user.id);
          const username = document.createElement("span");
          username.textContent = user.username;
          label.appendChild(checkbox);
          label.appendChild(username);
          groupMemberList.appendChild(label);
        });

        groupNameInput.value = "";
        createGroupDialog.showModal();
        groupNameInput.focus();
      } catch (err) {
        showNotice(err.message || "Users could not be loaded.", "error");
      } finally {
        createGroupBtn.disabled = false;
      }
    });
  }

  document.getElementById("cancel-group-btn").addEventListener("click", () => {
    createGroupDialog.close();
    createGroupForm.reset();
    groupError.textContent = "";
  });

  createGroupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = groupNameInput.value.trim();
    if (!name) {
      groupError.textContent = "Enter a group name.";
      groupNameInput.focus();
      return;
    }

    const memberIds = Array.from(groupMemberList.querySelectorAll('input[name="member_ids"]:checked'))
      .map((checkbox) => Number(checkbox.value));

    setLoading(submitGroupBtn, true, "Creating...", "Create Group");
    groupError.textContent = "";
    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, member_ids: memberIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Group creation failed.");

      createGroupDialog.close();
      createGroupForm.reset();
      showNotice(`Group "${data.name}" created.`, "success");
      await loadUserGroups();
    } catch (error) {
      groupError.textContent = error.message || "Group creation failed.";
    } finally {
      setLoading(submitGroupBtn, false, "Creating...", "Create Group");
    }
  });

  async function loadUserGroups() {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/users/${currentUser.id}/groups`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Groups could not be loaded.");
      userGroups = await res.json();
      renderUserList();
    } catch (err) {
      showNotice(err.message || "Groups could not be loaded.", "error");
    }
  }

  async function selectGroupChat(group) {
    cancelActionBar();
    activeChat = null;
    activeGroup = group;

    chatName.textContent = "👥 " + group.name;
    chatAvatar.textContent = "👥";
    chatAvatar.className = "avatar avatar-purple";
    chatStatus.textContent = "Group Chat";
    chatStatus.classList.remove("online", "blocked");

    if (chatHeaderActions) {
      chatHeaderActions.classList.remove("hidden");
      if (clearChatBtn) clearChatBtn.classList.remove("hidden");
      if (blockUserBtn) blockUserBtn.classList.add("hidden");
    }
    if (blockedBanner) blockedBanner.classList.add("hidden");

    setInputEnabled(true);
    showFeedPlaceholder("Group messages load ho rahe hain...");
    renderUserList();

    socket.emit("join_group", group.id);

    try {
      const res = await fetch(`/api/groups/${group.id}/messages`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Group messages could not be loaded.");
      const messages = await res.json();

      messageFeed.textContent = "";
      if (!messages || messages.length === 0) {
        showFeedPlaceholder("Is group me abhi koi message nahi hai. Pehla message bhejein!");
        return;
      }

      messages.forEach((msg) => {
        const type = Number(msg.sender_id) === Number(currentUser.id) ? "sent" : "received";
        addGroupMessageBubble(msg, type);
      });
      scrollToBottom();
    } catch (err) {
      showFeedPlaceholder(err.message || "Group messages could not be loaded.");
    }
  }

  function addGroupMessageBubble(msg, type) {
    const placeholder = messageFeed.querySelector(".feed-placeholder");
    if (placeholder) placeholder.remove();

    const bubble = document.createElement("div");
    bubble.classList.add("message", type);
    if (msg.id) bubble.dataset.id = msg.id;

    if (msg.is_deleted_for_everyone) {
      bubble.classList.add("deleted");
      const delText = document.createElement("p");
      delText.className = "message-text";
      delText.textContent = "🚫 This message was deleted";
      bubble.appendChild(delText);

      const timeEl = document.createElement("span");
      timeEl.classList.add("message-time");
      timeEl.textContent = formatTime(msg.created_at);
      bubble.appendChild(timeEl);

      messageFeed.appendChild(bubble);
      scrollToBottom();
      return;
    }

    if (type === "received") {
      const senderTag = document.createElement("small");
      senderTag.style.cssText = "display:block;font-size:11px;font-weight:bold;color:#00a884;margin-bottom:2px;";
      senderTag.textContent = msg.sender_name || "User " + msg.sender_id;
      bubble.appendChild(senderTag);
    }

    // Quoted reply if exists
    if (msg.reply_to_text) {
      const quoteEl = document.createElement("div");
      quoteEl.className = "message-reply-quote";
      const quoteSender = document.createElement("span");
      quoteSender.className = "quote-sender";
      quoteSender.textContent = msg.reply_to_sender || "User";
      const quoteText = document.createElement("p");
      quoteText.className = "quote-text";
      quoteText.textContent = messagePreview(msg.reply_to_text);
      quoteEl.appendChild(quoteSender);
      quoteEl.appendChild(quoteText);
      quoteEl.addEventListener("click", () => {
        const target = messageFeed.querySelector(`.message[data-id="${msg.reply_to_id}"]`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.style.transition = "background 0.3s";
          const oldBg = target.style.background;
          target.style.background = "#fff3cd";
          setTimeout(() => { target.style.background = oldBg; }, 1200);
        }
      });
      bubble.appendChild(quoteEl);
    }

    const contentEl = renderMessageContent(msg.message);
    bubble.appendChild(contentEl);

    const timeEl = document.createElement("span");
    timeEl.classList.add("message-time");

    if (msg.is_edited) {
      const editedSpan = document.createElement("span");
      editedSpan.className = "edited-badge";
      editedSpan.textContent = "edited";
      timeEl.appendChild(editedSpan);
    }

    const timeText = document.createElement("span");
    timeText.textContent = formatTime(msg.created_at);
    timeEl.appendChild(timeText);

    bubble.appendChild(timeEl);
    renderReactions(msg, bubble, true);
    bubble.appendChild(createMessageMenu(msg, true, bubble));

    messageFeed.appendChild(bubble);
    scrollToBottom();
  }

  // ----------------------------------------------------------
  // 11. PAGE LOAD: user pehle se logged-in hai?
  // ----------------------------------------------------------
  restoreSession();
});

