// ============================================================
// File: client/js/app.js
// Kaam: Page ka UI logic + backend se baat karna.
//   1. Login / Register tabs switch karna
//   2. Register aur Login forms ko fetch() se server ko bhejna
//   3. Login success par user info localStorage me save karke dashboard dikhana
//   4. Page reload par localStorage check karke user ko logged-in rakhna
//   5. Logout (localStorage clear + auth screen)
//   6. Conversation select, search, mock message (pehle jaisa)
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  // ----------------------------------------------------------
  // 1. ELEMENTS KO SELECT KARNA
  //    Baar-baar document.getElementById na likhna pade, isliye variables me store.
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
  const conversationItems = document.querySelectorAll(".conversation-item");

  const chatName = document.getElementById("chat-name");
  const chatAvatar = document.getElementById("chat-avatar");
  const chatStatus = document.getElementById("chat-status");
  const typingIndicator = document.getElementById("typing-indicator");
  const backBtn = document.getElementById("back-btn");

  const messageFeed = document.getElementById("message-feed");
  const messageForm = document.getElementById("message-form");
  const messageInput = document.getElementById("message-input");

  // localStorage me user info is key (naam) se save hogi.
  const STORAGE_KEY = "chatUser";

  // Client side par username ka wahi rule jo server par hai (3-20, letters/numbers/_).
  const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

  // ----------------------------------------------------------
  // 2. HELPER FUNCTIONS
  // ----------------------------------------------------------

  // Abhi ka time "10:42 AM" format me.
  function getCurrentTime() {
    return new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Message feed ko sabse neeche scroll karta hai.
  function scrollToBottom() {
    messageFeed.scrollTop = messageFeed.scrollHeight;
  }

  // ---------- localStorage helpers ----------
  // localStorage browser ka chhota storage hai jo page reload / browser band
  // karne ke baad bhi data rakhta hai. Ye sirf STRING store karta hai,
  // isliye object ko JSON.stringify se string banate hain aur JSON.parse se wapas object.

  // Saved user wapas padho. Kuch na ho ya data kharab ho to null.
  function getSavedUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function clearUser() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ---------- UI state helpers ----------

  // Message dikhane ka helper. type "success" ho to hara color, warna CSS ka default (laal error).
  // element.style.color = "" karne se inline color hat jaata hai aur CSS wala wapas aa jaata hai.
  function showMessage(element, text, type) {
    element.textContent = text;
    element.style.color = type === "success" ? "#00a884" : "";
  }

  // Dono message boxes khali karo.
  function clearAuthMessages() {
    showMessage(loginError, "", "error");
    showMessage(loginSuccess, "", "error");
    showMessage(registerError, "", "error");
  }

  // Button ko loading state me daalo (request chal rahi ho tab double click na ho).
  function setLoading(button, isLoading, loadingText, normalText) {
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : normalText;
  }

  // Auth screen chhupao aur dashboard dikhao, logged-in user ka naam laga ke.
  function showDashboard(user) {
    // textContent use kiya (innerHTML nahi) taaki username me koi HTML/script likha ho
    // to wo run na ho (XSS attack se bachav).
    myName.textContent = user.username;
    myAvatar.textContent = user.username.charAt(0).toUpperCase();

    authView.classList.add("hidden");
    chatView.classList.remove("hidden");
    scrollToBottom();
  }

  // Dashboard chhupao aur wapas auth screen dikhao.
  function showAuth() {
    chatView.classList.add("hidden");
    chatView.classList.remove("chat-open");
    authView.classList.remove("hidden");
  }

  // Tab badalne wala function ("login" ya "register").
  function switchTab(tabName) {
    tabButtons.forEach((btn) => {
      // Sirf wahi tab "active" jiska data-tab match kare.
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    loginForm.classList.toggle("active", tabName === "login");
    registerForm.classList.toggle("active", tabName === "register");

    clearAuthMessages();
  }

  // ----------------------------------------------------------
  // 3. SERVER SE BAAT KARNE WALA FUNCTION (fetch)
  //    fetch() browser ka built-in function hai jo HTTP request bhejta hai.
  //    Ye function ek JSON POST request bhejta hai aur hamesha
  //    { ok, status, data } wala object return karta hai.
  // ----------------------------------------------------------
  async function apiPost(url, body) {
    try {
      const response = await fetch(url, {
        method: "POST", // HTTP method POST: data server ko bhejna
        headers: {
          // Header batata hai ki body JSON format me hai.
          // Server ka express.json() isi header ko dekh ke body padhta hai.
          "Content-Type": "application/json",
        },
        // JavaScript object ko JSON text me badal ke body me bheja.
        body: JSON.stringify(body),
      });

      // Server ka jawab JSON hota hai, usse object me badlo.
      // Agar jawab JSON nahi hai to data khali object rahega.
      let data = {};
      try {
        data = await response.json();
      } catch (parseError) {
        data = {};
      }

      // response.ok = status code 200-299 ke beech ho to true.
      return { ok: response.ok, status: response.status, data: data };
    } catch (networkError) {
      // fetch tabhi fail hota hai jab server tak request pahunchi hi nahi
      // (server band hai, internet nahi hai, etc.). Tab status 0 maante hain.
      return {
        ok: false,
        status: 0,
        data: { error: "Cannot reach the server. Is it running?" },
      };
    }
  }

  // ----------------------------------------------------------
  // 4. TABS CLICK
  // ----------------------------------------------------------
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });

  // ----------------------------------------------------------
  // 5. REGISTER FORM SUBMIT -> POST /api/auth/register
  // ----------------------------------------------------------
  registerForm.addEventListener("submit", async (event) => {
    // preventDefault: form ka default behaviour (page reload) rok deta hai.
    event.preventDefault();

    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;

    // ---- Client side validation (server request bachane ke liye) ----
    // Dhyan rahe: ye sirf user ki suvidha ke liye hai. Asli validation server par
    // hoti hai, kyunki koi bhi browser ko bypass karke seedha request bhej sakta hai.
    if (!username || !email || !password || !confirm) {
      showMessage(registerError, "Please fill all the fields.", "error");
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      showMessage(
        registerError,
        "Username must be 3-20 characters (letters, numbers, underscore only).",
        "error"
      );
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

    // Server ko request bhejo. "await" ka matlab jawab aane tak ruko.
    // confirm password server ko nahi bhejte, wo sirf frontend ka check hai.
    const result = await apiPost("/api/auth/register", { username, email, password });

    setLoading(registerBtn, false, "Creating account...", "Create Account");

    if (!result.ok) {
      // Server ne jo error bheja wahi dikhao (jaise "Username or email already exists.")
      showMessage(registerError, result.data.error || "Registration failed.", "error");
      return;
    }

    // Register successful: form saaf karo, Login tab par jao,
    // email pehle se bhar do aur hara success message dikhao.
    registerForm.reset();
    switchTab("login");
    document.getElementById("login-email").value = email;
    showMessage(loginSuccess, "Account created! Please login.", "success");
    document.getElementById("login-password").focus();
  });

  // ----------------------------------------------------------
  // 6. LOGIN FORM SUBMIT -> POST /api/auth/login
  // ----------------------------------------------------------
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Input ka id "login-email" hai par usme email YA username dono chalte hain.
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
      // Galat password par yahan "Invalid email/username or password." dikhega (401).
      showMessage(loginError, result.data.error || "Login failed.", "error");
      return;
    }

    // Login successful: server ne user ka safe data bheja (password hash ke bina).
    // Use localStorage me save karo taaki page reload par bhi login bana rahe.
    saveUser(result.data.user);

    // Password field saaf karo (security ke liye) aur dashboard dikhao.
    loginForm.reset();
    showDashboard(result.data.user);
  });

  // ----------------------------------------------------------
  // 7. LOGOUT
  // ----------------------------------------------------------
  logoutBtn.addEventListener("click", async () => {
    // Server ko logout request bhejo. Agar fail bhi ho jaye to koi dikkat nahi,
    // kyunki asli logout browser ka localStorage clear karna hai.
    await apiPost("/api/auth/logout", {});

    clearUser();
    clearAuthMessages();
    switchTab("login");
    showAuth();
  });

  // ----------------------------------------------------------
  // 8. CONVERSATION SELECT KARNA (pehle jaisa)
  // ----------------------------------------------------------
  conversationItems.forEach((item) => {
    item.addEventListener("click", () => {
      // Pehle sabse "active" hatao, phir clicked item par lagao
      conversationItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      // data-name aur data-status attributes se info nikali
      const name = item.dataset.name;
      const status = item.dataset.status;

      // Chat header me naam aur avatar ka letter update karo
      chatName.textContent = name;
      chatAvatar.textContent = name.charAt(0);

      // Sidebar avatar ki color wali class (jaise "avatar-blue") dhundh ke
      // chat header ke avatar par bhi laga do.
      const sidebarAvatar = item.querySelector(".avatar");
      const colorClass = Array.from(sidebarAvatar.classList).find((cls) =>
        cls.startsWith("avatar-")
      );
      chatAvatar.className = "avatar " + (colorClass || "avatar-blue");

      // Online / offline status update
      chatStatus.textContent = status;
      chatStatus.classList.toggle("online", status === "online");

      // Mobile par chat area dikhane ke liye class lagao
      chatView.classList.add("chat-open");
    });
  });

  // Mobile ka back button: wapas conversation list
  backBtn.addEventListener("click", () => {
    chatView.classList.remove("chat-open");
  });

  // ----------------------------------------------------------
  // 9. SEARCH BAR: naam type karne par list filter hogi
  // ----------------------------------------------------------
  searchInput.addEventListener("input", () => {
    const keyword = searchInput.value.toLowerCase().trim();

    conversationItems.forEach((item) => {
      const name = item.dataset.name.toLowerCase();
      item.style.display = name.includes(keyword) ? "flex" : "none";
    });
  });

  // ----------------------------------------------------------
  // 10. MESSAGE BHEJNA (abhi bhi mock, Socket.IO aage ke phase me)
  // ----------------------------------------------------------

  // Ek naya message bubble banakar feed me add karta hai.
  // type = "sent" (mera) ya "received" (samne wale ka).
  function addMessage(text, type) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", type);

    const textEl = document.createElement("p");
    textEl.classList.add("message-text");
    textEl.textContent = text; // textContent = safe (HTML run nahi hota)

    const timeEl = document.createElement("span");
    timeEl.classList.add("message-time");
    timeEl.textContent = getCurrentTime();

    bubble.appendChild(textEl);
    bubble.appendChild(timeEl);
    messageFeed.appendChild(bubble);

    scrollToBottom();
  }

  messageForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = messageInput.value.trim();
    if (text === "") {
      return;
    }

    addMessage(text, "sent");
    messageInput.value = "";
    messageInput.focus();

    // Mock auto-reply: typing indicator dikhao, 1.5 sec baad reply do.
    chatStatus.classList.add("hidden");
    typingIndicator.classList.remove("hidden");

    setTimeout(() => {
      typingIndicator.classList.add("hidden");
      chatStatus.classList.remove("hidden");
      addMessage("Thik hai, mil gaya message! (mock reply)", "received");
    }, 1500);
  });

  // ----------------------------------------------------------
  // 11. PAGE LOAD PAR: kya user pehle se logged-in hai?
  //     localStorage me user mila to seedha dashboard, warna login screen.
  // ----------------------------------------------------------
  const savedUser = getSavedUser();
  if (savedUser && savedUser.username) {
    showDashboard(savedUser);
  } else {
    showAuth();
  }
});