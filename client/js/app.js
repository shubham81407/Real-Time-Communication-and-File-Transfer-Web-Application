// ============================================================
// File: client/js/app.js
// Kaam: Page ka UI logic (buttons dabane par kya hoga).
//   1. Login / Register tabs switch karna
//   2. Forms submit hone par dashboard dikhana (dummy)
//   3. Conversation select karna
//   4. Message bhejna (mock) aur auto-reply dikhana
// Concept: DOM manipulation = JavaScript se HTML elements ko
//          dhundhna (select) aur unhe badalna.
// ============================================================

// DOMContentLoaded: jab poora HTML load ho jaye tabhi code chalao,
// warna elements mile hi nahi honge (null error aata).
document.addEventListener("DOMContentLoaded", () => {
  // ----------------------------------------------------------
  // 1. ELEMENTS KO SELECT KARNA (getElementById / querySelector)
  //    Baar-baar document.getElementById na likhna pade,
  //    isliye ek baar variable me store kar lete hain.
  // ----------------------------------------------------------
  const authView = document.getElementById("auth-view");
  const chatView = document.getElementById("chat-view");

  const tabButtons = document.querySelectorAll(".tab-btn");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginError = document.getElementById("login-error");
  const registerError = document.getElementById("register-error");
  const skipBtn = document.getElementById("skip-btn");
  const logoutBtn = document.getElementById("logout-btn");

  const myName = document.getElementById("my-name");
  const searchInput = document.getElementById("search-input");
  const conversationList = document.getElementById("conversation-list");
  const conversationItems = document.querySelectorAll(".conversation-item");

  const chatName = document.getElementById("chat-name");
  const chatAvatar = document.getElementById("chat-avatar");
  const chatStatus = document.getElementById("chat-status");
  const typingIndicator = document.getElementById("typing-indicator");
  const backBtn = document.getElementById("back-btn");

  const messageFeed = document.getElementById("message-feed");
  const messageForm = document.getElementById("message-form");
  const messageInput = document.getElementById("message-input");

  // ----------------------------------------------------------
  // 2. HELPER FUNCTIONS
  // ----------------------------------------------------------

  // Abhi ka time "10:42 AM" format me return karta hai.
  function getCurrentTime() {
    return new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // Feed ko sabse neeche scroll karta hai taaki naya message dikhe.
  // scrollTop = kitna scroll hua, scrollHeight = poori content height.
  function scrollToBottom() {
    messageFeed.scrollTop = messageFeed.scrollHeight;
  }

  // Auth screen chhupao aur chat dashboard dikhao.
  // classList.add/remove se CSS ki ".hidden" class lagti/hatti hai.
  function showDashboard(username) {
    if (username) {
      myName.textContent = username;
    }
    authView.classList.add("hidden");
    chatView.classList.remove("hidden");
    scrollToBottom();
  }

  // Dashboard chhupao aur wapas auth screen dikhao.
  function showAuth() {
    chatView.classList.add("hidden");
    authView.classList.remove("hidden");
  }

  // Ek naya message bubble banakar feed me add karta hai.
  // type = "sent" (mera) ya "received" (samne wale ka).
  function addMessage(text, type) {
    // Naya div element banaya
    const bubble = document.createElement("div");
    bubble.classList.add("message", type);

    // Message ka text wala <p>
    const textEl = document.createElement("p");
    textEl.classList.add("message-text");
    // textContent use kiya (innerHTML nahi) taaki koi <script> likhe to
    // wo code ki tarah run na ho. Ye security (XSS) se bachata hai.
    textEl.textContent = text;

    // Time wala <span>
    const timeEl = document.createElement("span");
    timeEl.classList.add("message-time");
    timeEl.textContent = getCurrentTime();

    // Bubble ke andar text aur time daalo, phir bubble ko feed me daalo
    bubble.appendChild(textEl);
    bubble.appendChild(timeEl);
    messageFeed.appendChild(bubble);

    scrollToBottom();
  }

  // ----------------------------------------------------------
  // 3. LOGIN / REGISTER TABS SWITCH KARNA
  // ----------------------------------------------------------
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // data-tab="login" ya "register" ki value padhi
      const selectedTab = button.dataset.tab;

      // Pehle sab tabs se "active" hatao, phir sirf clicked par lagao
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      // Jo tab chuna uska form dikhao, doosra chhupao
      if (selectedTab === "login") {
        loginForm.classList.add("active");
        registerForm.classList.remove("active");
      } else {
        registerForm.classList.add("active");
        loginForm.classList.remove("active");
      }

      // Purane error messages saaf kar do
      loginError.textContent = "";
      registerError.textContent = "";
    });
  });

  // ----------------------------------------------------------
  // 4. FORM SUBMIT (abhi sirf dummy, backend baad me judega)
  // ----------------------------------------------------------

  // Login form
  loginForm.addEventListener("submit", (event) => {
    // preventDefault: form ka default behaviour (page reload) rok deta hai
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    // Basic validation: khali field na ho
    if (!email || !password) {
      loginError.textContent = "Please enter email and password.";
      return;
    }

    loginError.textContent = "";
    // Email ke @ se pehle wale part ko naam bana liya (sirf demo ke liye)
    showDashboard(email.split("@")[0]);
  });

  // Register form
  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = document.getElementById("register-username").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const confirm = document.getElementById("register-confirm").value;

    if (!username || !email || !password || !confirm) {
      registerError.textContent = "Please fill all the fields.";
      return;
    }
    if (password.length < 6) {
      registerError.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (password !== confirm) {
      registerError.textContent = "Passwords do not match.";
      return;
    }

    registerError.textContent = "";
    showDashboard(username);
  });

  // Testing button: bina login ke dashboard dekhne ke liye
  skipBtn.addEventListener("click", () => {
    showDashboard();
  });

  // Logout: wapas auth screen
  logoutBtn.addEventListener("click", () => {
    showAuth();
  });

  // ----------------------------------------------------------
  // 5. CONVERSATION SELECT KARNA
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

      // Avatar ka color bhi sidebar wale avatar jaisa kar do
      // (sidebar avatar ki classes copy karke)
      const sidebarAvatar = item.querySelector(".avatar");
      chatAvatar.className = sidebarAvatar.className.replace("avatar ", "avatar ");
      // Online badge text ke saath copy na ho, isliye sirf pehla letter set kiya hai

      // Online / offline status update
      chatStatus.textContent = status;
      if (status === "online") {
        chatStatus.classList.add("online");
      } else {
        chatStatus.classList.remove("online");
      }

      // Mobile par chat area dikhane ke liye class lagao
      chatView.classList.add("chat-open");
    });
  });

  // Mobile ka back button: wapas conversation list
  backBtn.addEventListener("click", () => {
    chatView.classList.remove("chat-open");
  });

  // ----------------------------------------------------------
  // 6. SEARCH BAR: naam type karne par list filter hogi
  // ----------------------------------------------------------
  searchInput.addEventListener("input", () => {
    const keyword = searchInput.value.toLowerCase().trim();

    conversationItems.forEach((item) => {
      const name = item.dataset.name.toLowerCase();
      // Agar naam me keyword mila to dikhao, warna chhupao
      item.style.display = name.includes(keyword) ? "flex" : "none";
    });
  });

  // ----------------------------------------------------------
  // 7. MESSAGE BHEJNA (mock)
  // ----------------------------------------------------------
  messageForm.addEventListener("submit", (event) => {
    event.preventDefault(); // page reload rokna

    const text = messageInput.value.trim();

    // Khali message na bhejo
    if (text === "") {
      return;
    }

    // Mera message feed me add karo
    addMessage(text, "sent");

    // Input box saaf karo aur wapas focus do
    messageInput.value = "";
    messageInput.focus();

    // Mock auto-reply: typing indicator dikhao, 1.5 sec baad reply do.
    // Isse typing indicator ka placeholder test ho jaata hai.
    chatStatus.classList.add("hidden");
    typingIndicator.classList.remove("hidden");

    setTimeout(() => {
      typingIndicator.classList.add("hidden");
      chatStatus.classList.remove("hidden");
      addMessage("Thik hai, mil gaya message! (mock reply)", "received");
    }, 1500);
  });

  // Sidebar me pehli conversation ki taraf ek baar scroll set kar do
  scrollToBottom();
});