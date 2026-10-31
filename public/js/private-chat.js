(() => {
  const page = document.getElementById("group-chat") || document.getElementById("workspace-chat");
  const panel = document.getElementById("private-panel");
  if (!page || !panel) return;

  const currentUserID = Number(page.dataset.currentUserId);
  const individualTab = document.getElementById("individual-tab");
  const groupTab = document.getElementById("group-tab");
  const groupPanel = document.getElementById("group-panel");
  const newButton = document.getElementById("pc-new");
  const picker = document.getElementById("pc-picker");
  const searchInput = document.getElementById("pc-search");
  const results = document.getElementById("pc-results");
  const list = document.getElementById("pc-list");
  const header = document.getElementById("pc-header");
  const headerLink = document.getElementById("pc-header-link");
  const headerAvatar = document.getElementById("pc-header-avatar");
  const headerName = document.getElementById("pc-header-name");
  const messageList = document.getElementById("pc-messages");
  const status = document.getElementById("pc-status");
  const form = document.getElementById("pc-form");
  const input = document.getElementById("pc-input");
  const sendButton = document.getElementById("pc-send");

  const API = "/chat/private";
  const conversations = new Map();
  const messageCache = new Map(); // conversationID -> Map(messageID -> message)
  const failed = new Map(); // conversationID -> [{ localID, content, error }]
  let selectedID = null;
  let draftPerson = null; // selected user with no saved messages yet; not shown in the sidebar
  let draftConversationID = null; // existing empty conversation row, reused when sending
  let loadedList = false;
  let socket = null;
  let searchTimer = null;
  let searchToken = 0;
  let localCounter = 0;

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      ...options
    });
    let result = null;
    try { result = await response.json(); } catch { /* handled below */ }
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || "Something went wrong. Please try again.");
    }
    return result;
  }

  function nameOf(person) {
    return (person.displayName && person.displayName.trim()) || person.username || "User";
  }

  function createAvatar(name, picture, className) {
    const fallback = () => {
      const span = document.createElement("span");
      span.className = `chat-avatar ${className}`;
      span.textContent = (name || "?").trim().charAt(0).toUpperCase() || "?";
      span.setAttribute("aria-hidden", "true");
      return span;
    };
    if (!picture) return fallback();
    const image = document.createElement("img");
    image.src = picture;
    image.alt = "";
    image.className = `chat-avatar ${className}`;
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.replaceWith(fallback()), { once: true });
    return image;
  }

  function profileHref(userID) {
    return `/profile/${encodeURIComponent(userID)}`;
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }

  function feedback(text, id) {
    const p = document.createElement("p");
    p.className = "chat-feedback";
    if (id) p.id = id;
    p.textContent = text;
    return p;
  }

  /* ---------- tabs ---------- */
  function showPrivate(isPrivate) {
    panel.hidden = !isPrivate;
    if (groupPanel) groupPanel.hidden = isPrivate;
    if (isPrivate) {
      if (!loadedList) loadConversations();
      initSocket();
    }
  }

  individualTab.addEventListener("click", () => showPrivate(true));
  groupTab.addEventListener("click", () => showPrivate(false));

  /* ---------- conversation list ---------- */
  function renderList() {
    const ordered = Array.from(conversations.values())
      .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt)
        || Number(b.conversationID) - Number(a.conversationID));
    list.replaceChildren();

    if (!ordered.length) {
      list.append(feedback(loadedList
        ? "No private conversations yet. Click “New Message” to start one."
        : "Loading conversations…"));
      return;
    }

    ordered.forEach(conversation => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "chat-conversation chat-private-conversation";
      const isSelected = Number(conversation.conversationID) === selectedID;
      item.classList.toggle("is-selected", isSelected);
      if (isSelected) item.setAttribute("aria-current", "true");

      const text = document.createElement("span");
      text.className = "chat-private-text";
      const name = document.createElement("span");
      name.className = "chat-conversation-name";
      name.textContent = nameOf(conversation);
      text.append(name);
      if (conversation.lastMessage) {
        const preview = document.createElement("span");
        preview.className = "chat-private-preview";
        preview.textContent = conversation.lastMessage;
        text.append(preview);
      }

      item.append(createAvatar(nameOf(conversation), conversation.profilePicture, "chat-conversation-avatar"), text);
      item.addEventListener("click", () => selectConversation(conversation.conversationID));
      list.append(item);
    });
  }

  async function loadConversations() {
    try {
      const result = await api("/conversations");
      result.conversations.forEach(c => conversations.set(Number(c.conversationID), c));
      loadedList = true;
      renderList();
    } catch (error) {
      list.replaceChildren(feedback(error.message));
    }
  }

  /* ---------- messages ---------- */
  function buildMessage(message, other) {
    const mine = Number(message.userID) === currentUserID;
    const row = document.createElement("article");
    row.className = `chat-message-row${mine ? " is-mine" : ""}`;

    if (!mine) {
      const link = document.createElement("a");
      link.className = "chat-message-avatar-link";
      link.href = profileHref(message.userID);
      link.setAttribute("aria-label", `View ${message.senderName}'s profile`);
      link.append(createAvatar(message.senderName, message.profilePicture || other?.profilePicture, "chat-message-avatar"));
      row.append(link);
    }

    const bubble = document.createElement("div");
    bubble.className = "chat-message";
    const meta = document.createElement("div");
    meta.className = "chat-message-meta";
    const sender = document.createElement("span");
    sender.className = "chat-message-sender";
    sender.textContent = mine ? `${message.senderName} (you)` : message.senderName;
    const time = document.createElement("time");
    time.className = "chat-message-time";
    time.textContent = formatTime(message.timestamp);
    meta.append(sender, time);

    const content = document.createElement("p");
    content.className = "chat-message-content";
    content.textContent = message.content;
    bubble.append(meta, content);
    row.append(bubble);
    return row;
  }

  function buildFailed(item) {
    const row = document.createElement("article");
    row.className = "chat-message-row is-mine is-failed";
    const bubble = document.createElement("div");
    bubble.className = "chat-message";
    const content = document.createElement("p");
    content.className = "chat-message-content";
    content.textContent = item.content;
    const error = document.createElement("div");
    error.className = "chat-failed-note";
    const text = document.createElement("span");
    text.textContent = `Not sent: ${item.error}`;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "chat-retry";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => retrySend(item));
    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "chat-retry";
    discard.textContent = "Dismiss";
    discard.addEventListener("click", () => {
      failed.set(failKey(), (failed.get(failKey()) || []).filter(entry => entry !== item));
      renderMessages(false);
    });
    error.append(text, retry, discard);
    bubble.append(content, error);
    row.append(bubble);
    return row;
  }

  function activePerson() {
    return conversations.get(selectedID) || draftPerson;
  }

  function failKey() {
    return selectedID !== null ? selectedID : `u${draftPerson?.userID}`;
  }

  function showHeader(person) {
    header.hidden = false;
    form.hidden = false;
    headerLink.href = headerName.href = profileHref(person.otherUserID);
    headerLink.setAttribute("aria-label", `View ${nameOf(person)}'s profile`);
    headerAvatar.replaceChildren(createAvatar(nameOf(person), person.profilePicture, "chat-group-avatar"));
    headerName.textContent = nameOf(person);
    showStatus("");
  }

  // Converts the draft into a listed conversation once it has a saved message.
  function adoptDraftIfListed() {
    if (!draftPerson) return;
    const match = Array.from(conversations.values())
      .find(c => Number(c.otherUserID) === Number(draftPerson.otherUserID));
    if (!match) return;
    const key = failKey();
    const pending = failed.get(key);
    selectedID = Number(match.conversationID);
    draftPerson = null;
    draftConversationID = null;
    setSearchMode(false);
    if (pending) {
      failed.delete(key);
      failed.set(selectedID, pending);
    }
    renderList();
  }

  function renderMessages(shouldScroll) {
    const person = activePerson();
    if (!person) return;
    const cache = selectedID !== null ? messageCache.get(selectedID) : null;
    const ordered = cache
      ? Array.from(cache.values()).sort((a, b) => Number(a.messageID) - Number(b.messageID))
      : [];
    const pending = failed.get(failKey()) || [];
    messageList.replaceChildren();

    if (!ordered.length && !pending.length) {
      messageList.append(feedback("No messages yet. Say hello!"));
    } else {
      ordered.forEach(message => messageList.append(buildMessage(message, person)));
      pending.forEach(item => messageList.append(buildFailed(item)));
    }
    if (shouldScroll) messageList.scrollTop = messageList.scrollHeight;
  }

  async function fetchMessages(conversationID) {
    const result = await api(`/conversations/${conversationID}/messages`);
    const cache = messageCache.get(conversationID) || new Map();
    result.messages.forEach(message => cache.set(Number(message.messageID), message));
    messageCache.set(conversationID, cache);
  }

  async function selectConversation(conversationID) {
    conversationID = Number(conversationID);
    const conversation = conversations.get(conversationID);
    if (!conversation) return;

    selectedID = conversationID;
    draftPerson = null;
    draftConversationID = null;
    setSearchMode(false);
    renderList();
    showHeader(conversation);

    if (!messageCache.has(conversationID)) {
      messageList.replaceChildren(feedback("Loading messages…"));
    } else {
      renderMessages(true);
    }

    try {
      await fetchMessages(conversationID);
      if (selectedID === conversationID) renderMessages(true);
    } catch (error) {
      if (selectedID === conversationID) {
        showStatus(error.message, true);
        if (!messageCache.has(conversationID)) messageList.replaceChildren();
      }
    }
    input.focus();
  }

  function selectDraft(user, existingConversationID) {
    selectedID = null;
    draftConversationID = existingConversationID || null;
    draftPerson = {
      otherUserID: user.userID,
      username: user.username,
      displayName: user.displayName,
      profilePicture: user.profilePicture
    };
    renderList();
    showHeader(draftPerson);
    renderMessages(true);
    input.focus();
  }

  /* ---------- new message picker ---------- */
  function renderResults(users) {
    results.replaceChildren();
    if (!users.length) {
      results.append(feedback("No users found."));
      return;
    }
    users.forEach(user => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "chat-conversation chat-user-option";
      option.setAttribute("role", "option");
      const name = document.createElement("span");
      name.className = "chat-private-text";
      const main = document.createElement("span");
      main.className = "chat-conversation-name";
      main.textContent = nameOf(user);
      name.append(main);
      if (user.displayName && user.displayName.trim() && user.displayName !== user.username) {
        const sub = document.createElement("span");
        sub.className = "chat-private-preview";
        sub.textContent = `@${user.username}`;
        name.append(sub);
      }
      option.append(createAvatar(nameOf(user), user.profilePicture, "chat-conversation-avatar"), name);
      option.addEventListener("click", () => startConversation(user.userID));
      results.append(option);
    });
  }

  async function searchUsers() {
    const token = ++searchToken;
    results.replaceChildren(feedback("Searching…"));
    try {
      const result = await api(`/users?q=${encodeURIComponent(searchInput.value.trim())}`);
      if (token === searchToken) renderResults(result.users);
    } catch (error) {
      if (token === searchToken) results.replaceChildren(feedback(error.message));
    }
  }

  function setSearchMode(on) {
    picker.hidden = !on;
    list.hidden = on;
    newButton.textContent = on ? "← Back to Messages" : "+ New Message";
    if (on) {
      searchInput.value = "";
      searchInput.focus();
      searchUsers();
    }
  }

  newButton.addEventListener("click", () => setSearchMode(picker.hidden));

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchUsers, 250);
  });

  async function startConversation(userID) {
    if (Number(userID) === currentUserID) return;
    try {
      const result = await api(`/with/${encodeURIComponent(userID)}`);
      const id = Number(result.conversationID);
      if (id && conversations.has(id)) {
        await selectConversation(id);
      } else {
        selectDraft(result.user, id || null);
      }
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  /* ---------- sending ---------- */
  function sendContent(content, onDone) {
    if (!socket || !socket.connected) {
      onDone({ success: false, message: "Not connected. Please wait for chat to reconnect." });
      return;
    }
    const payload = selectedID !== null
      ? { conversationID: selectedID, content }
      : draftConversationID
        ? { conversationID: draftConversationID, content }
        : { recipientID: draftPerson.otherUserID, content };
    socket.timeout(8000).emit("private:message", payload, (timeoutError, result) => {
      onDone(timeoutError || !result ? { success: false, message: "Message timed out. Please try again." } : result);
    });
  }

  function handleSent(result) {
    const conversation = result.conversation;
    const id = Number(conversation.conversationID);
    const existing = conversations.get(id);
    conversations.set(id, { ...conversation, ...(existing && { lastMessage: existing.lastMessage }) });
    onIncoming(result.message);
    if (draftPerson) {
      const pending = failed.get(failKey());
      selectedID = id;
      draftPerson = null;
      draftConversationID = null;
      setSearchMode(false);
      if (pending) {
        failed.delete(`u${conversation.otherUserID}`);
        failed.set(id, pending);
      }
      renderList();
      renderMessages(true);
    }
  }

  function recordFailure(key, content, message, existing) {
    const pending = failed.get(key) || [];
    if (existing) {
      existing.error = message;
    } else {
      pending.push({ localID: ++localCounter, content, error: message });
      failed.set(key, pending);
    }
    if (failKey() === key) {
      showStatus(message, true);
      renderMessages(true);
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) {
      showStatus("Enter a message before sending.", true);
      input.focus();
      return;
    }
    if (!activePerson()) return;
    const key = failKey();

    sendButton.disabled = true;
    sendContent(content, result => {
      sendButton.disabled = false;
      input.value = "";
      input.style.height = "auto";
      if (!result.success) {
        recordFailure(key, content, result.message);
        return;
      }
      handleSent(result);
      showStatus("");
      input.focus();
    });
  });

  function retrySend(item) {
    const key = failKey();
    sendContent(item.content, result => {
      if (!result.success) {
        recordFailure(key, item.content, result.message, item);
        return;
      }
      const pending = failed.get(key) || [];
      failed.set(key, pending.filter(entry => entry !== item));
      handleSent(result);
      showStatus("");
    });
  }

  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });

  /* ---------- realtime ---------- */
  function onIncoming(message) {
    const conversationID = Number(message.conversationID);
    const messageID = Number(message.messageID);
    if (!conversationID || !messageID) return;

    let cache = messageCache.get(conversationID);
    if (!cache) {
      cache = new Map();
      messageCache.set(conversationID, cache);
    }
    const isNew = !cache.has(messageID);
    cache.set(messageID, message);

    const conversation = conversations.get(conversationID);
    if (!conversation) {
      // first message of a conversation we have not seen yet
      loadConversations().then(async () => {
        adoptDraftIfListed();
        if (selectedID === conversationID) {
          try { await fetchMessages(conversationID); } catch { /* keep what we have */ }
          renderMessages(true);
        }
      });
      return;
    }

    if (isNew) {
      conversation.lastMessage = message.content;
      conversation.lastActivityAt = message.timestamp;
      renderList();
    }
    if (selectedID === conversationID && isNew) {
      const nearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 100;
      renderMessages(nearBottom || Number(message.userID) === currentUserID);
    }
  }

  async function resync() {
    if (!loadedList) return;
    await loadConversations();
    adoptDraftIfListed();
    if (selectedID !== null) {
      try {
        await fetchMessages(selectedID);
        renderMessages(false);
      } catch { /* keep cached messages */ }
    }
  }

  function initSocket() {
    if (socket) return;
    socket = io();
    let connectedBefore = false;
    socket.on("connect", () => {
      sendButton.disabled = false;
      if (connectedBefore) showStatus("");
      if (connectedBefore) resync();
      connectedBefore = true;
    });
    socket.on("disconnect", () => {
      sendButton.disabled = true;
      showStatus("Connection lost. Reconnecting…", true);
    });
    socket.on("connect_error", error => {
      sendButton.disabled = true;
      showStatus(error.message === "Unauthorized"
        ? "Your session has expired. Please sign in again."
        : "Unable to connect. Reconnecting…", true);
    });
    socket.on("private:message", onIncoming);
  }

  // Connect immediately so messages update the list even while the Group tab is showing.
  loadConversations();
  initSocket();
})();
