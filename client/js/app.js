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

  // Ek message bubble banakar feed me jodta hai.
  // msg = server ka savedMessage object ({ sender_id, receiver_id, message, created_at ... })
  // type = "sent" ya "received"
  function addMessageBubble(msg, type) {
    const placeholder = messageFeed.querySelector(".feed-placeholder");
    if (placeholder) placeholder.remove();

    const bubble = document.createElement("div");
    bubble.classList.add("message", type);

    const contentEl = renderMessageContent(msg.message);

    const timeEl = document.createElement("span");
    timeEl.classList.add("message-time");
    timeEl.textContent = formatTime(msg.created_at);

    bubble.appendChild(contentEl);
    bubble.appendChild(timeEl);
    messageFeed.appendChild(bubble);
    scrollToBottom();
  }

  // Sidebar ki "last message" preview update karne ke liye data store karo.
  function setLastMessage(userId, text, createdAt) {
    lastMessages[userId] = { text: text, time: formatTime(createdAt) };
  }

  // Chat header (naam, avatar, online/offline) ko activeChat ke hisaab se update karo.
  function updateChatHeader() {
    if (!activeChat) {
      chatName.textContent = "Select a chat";
      chatAvatar.textContent = "?";
      chatAvatar.className = "avatar avatar-blue";
      chatStatus.textContent = "";
      chatStatus.classList.remove("online");
      return;
    }
    chatName.textContent = activeChat.username;
    chatAvatar.textContent = activeChat.username.charAt(0).toUpperCase();
    chatAvatar.className = "avatar " + colorFor(activeChat.id);

    const online = isOnline(activeChat.id);
    chatStatus.textContent = online ? "online" : "offline";
    chatStatus.classList.toggle("online", online);
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
    const timeEl = document.createElement("span");
    timeEl.className = "conversation-time";
    timeEl.textContent = lastMessages[user.id] ? lastMessages[user.id].time : "";
    top.appendChild(nameEl);
    top.appendChild(timeEl);

    // Neeche wali line: last message preview + unread count
    const last = document.createElement("p");
    last.className = "conversation-last";
    last.textContent = lastMessages[user.id] ? lastMessages[user.id].text : "Tap to start chatting";

    const unread = unreadCounts[user.id] || 0;
    if (unread > 0) {
      const unreadBadge = document.createElement("span");
      unreadBadge.textContent = unread;
      unreadBadge.className = "unread-badge";
      last.appendChild(unreadBadge);
    }

    info.appendChild(top);
    info.appendChild(last);
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
        const last = document.createElement("p");
        last.className = "conversation-last";
        last.textContent = "Tap to open group chat";
        top.appendChild(name);
        info.appendChild(top);
        info.appendChild(last);
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

  // GET /api/users: saare registered users laao aur apne aap ko list se hata do.
  async function loadUsers() {
    try {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error("Users load failed");
      const data = await response.json();

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
    activeChat = user;
    unreadCounts[user.id] = 0; // is chat ke unread messages ab padh liye

    updateChatHeader();
    setInputEnabled(true);
    showFeedPlaceholder("Loading messages...");
    renderUserList(); // active highlight + unread badge hatane ke liye

    chatView.classList.add("chat-open"); // mobile par chat area dikhao
    loadHistory(user);
    messageInput.focus();
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
    const fromId = msg.sender_id;
    const isOpenChat = activeChat && Number(activeChat.id) === Number(fromId);

    if (isOpenChat) {
      // Wahi chat khuli hai to seedha bubble add karo (real-time)
      addMessageBubble(msg, "received");
    } else {
      // Chat band hai (ya dusri chat khuli hai) to unread count badhao
      unreadCounts[fromId] = (unreadCounts[fromId] || 0) + 1;
    }

    setLastMessage(fromId, messagePreview(msg.message), msg.created_at);
    renderUserList();
  });

  // "message_sent_confirm": server ne confirm kiya ki mera message save ho gaya aur bhej diya gaya.
  // Bubble yahin dikhate hain (send par nahi) taaki sirf wahi message dikhe jo sach me save hua.
  socket.on("message_sent_confirm", (msg) => {
    const toId = msg.receiver_id;
    if (activeChat && Number(activeChat.id) === Number(toId)) {
      addMessageBubble(msg, "sent");
    }
    setLastMessage(toId, "You: " + messagePreview(msg.message), msg.created_at);
    renderUserList();
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

    // 1. Agar Group Chat open hai
    if (activeGroup) {
      socket.emit("send_group_message", {
        group_id: activeGroup.id,
        sender_id: currentUser.id,
        message: text
      });
    } 
    // 2. Agar Private One-to-One Chat open hai
    else if (activeChat) {
      socket.emit("send_private_message", {
        sender_id: currentUser.id,
        receiver_id: activeChat.id,
        message: text
      });
    }

    messageInput.value = "";
    messageInput.focus();
  });

  // Group message receive hone par
  socket.on("receive_group_message", (msg) => {
    if (activeGroup && Number(activeGroup.id) === Number(msg.group_id)) {
      const type = Number(msg.sender_id) === Number(currentUser.id) ? "sent" : "received";
      addGroupMessageBubble(msg, type);
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

      const groupName = prompt("Naye Group ka naam likhein:");
      if (!groupName || groupName.trim() === "") return;

      try {
        const memberIds = allUsers.map((u) => u.id);
        memberIds.push(currentUser.id);

        const res = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            name: groupName.trim(),
            member_ids: memberIds
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Group creation failed");

        showNotice(`Group "${groupName}" created.`, "success");
        loadUserGroups();
      } catch (err) {
        showNotice(err.message || "Group creation failed.", "error");
      }
    });
  }

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
    activeChat = null;
    activeGroup = group;

    chatName.textContent = "👥 " + group.name;
    chatAvatar.textContent = "👥";
    chatAvatar.className = "avatar avatar-purple";
    chatStatus.textContent = "Group Chat";
    chatStatus.classList.remove("online");

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

    if (type === "received") {
      const senderTag = document.createElement("small");
      senderTag.style.cssText = "display:block;font-size:11px;font-weight:bold;color:#00a884;margin-bottom:2px;";
      senderTag.textContent = msg.sender_name || "User " + msg.sender_id;
      bubble.appendChild(senderTag);
    }

    const contentEl = renderMessageContent(msg.message);

    const timeEl = document.createElement("span");
    timeEl.classList.add("message-time");
    timeEl.textContent = formatTime(msg.created_at);

    bubble.appendChild(contentEl);
    bubble.appendChild(timeEl);
    messageFeed.appendChild(bubble);
    scrollToBottom();
  }

  // ----------------------------------------------------------
  // 11. PAGE LOAD: user pehle se logged-in hai?
  // ----------------------------------------------------------
  restoreSession();
});

