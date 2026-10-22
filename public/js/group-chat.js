(() => {
  const page = document.getElementById("group-chat");
  if (!page) return;

  const groupID = Number(page.dataset.groupId);
  const currentUserID = Number(page.dataset.currentUserId);
  const messageList = document.getElementById("chat-messages");
  const loadingMessage = document.getElementById("chat-loading");
  const status = document.getElementById("chat-status");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendButton = document.getElementById("chat-send");
  const messages = new Map();
  const socket = io();
  let joined = false;

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function initials(name) {
    return (name || "?").trim().charAt(0).toUpperCase() || "?";
  }

  function createAvatar(name, picture, className) {
    if (picture) {
      const image = document.createElement("img");
      image.src = picture;
      image.alt = "";
      image.className = `chat-avatar ${className}`;
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => {
        const fallback = document.createElement("span");
        fallback.className = `chat-avatar ${className}`;
        fallback.textContent = initials(name);
        image.replaceWith(fallback);
      }, { once: true });
      return image;
    }

    const avatar = document.createElement("span");
    avatar.className = `chat-avatar ${className}`;
    avatar.textContent = initials(name);
    avatar.setAttribute("aria-hidden", "true");
    return avatar;
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }

  function buildMessage(message) {
    const mine = Number(message.userID) === currentUserID;
    const row = document.createElement("article");
    row.className = `chat-message-row${mine ? " is-mine" : ""}`;

    if (!mine) {
      const avatar = createAvatar(message.senderName, message.profilePicture, "chat-message-avatar");
      const senderID = Number(message.userID);
      if (Number.isSafeInteger(senderID) && senderID > 0) {
        const profileLink = document.createElement("a");
        profileLink.className = "chat-message-avatar-link";
        profileLink.href = `/profile/${encodeURIComponent(senderID)}`;
        profileLink.setAttribute("aria-label", `View ${message.senderName}'s profile`);
        profileLink.append(avatar);
        row.append(profileLink);
      } else {
        row.append(avatar);
      }
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
    time.dateTime = new Date(message.timestamp).toISOString();
    time.textContent = formatTime(message.timestamp);
    meta.append(sender, time);

    const content = document.createElement("p");
    content.className = "chat-message-content";
    content.textContent = message.content;
    bubble.append(meta, content);
    row.append(bubble);
    return row;
  }

  function renderMessages(shouldScroll) {
    const ordered = Array.from(messages.values())
      .sort((left, right) => Number(left.messageID) - Number(right.messageID));
    messageList.replaceChildren();

    if (!ordered.length) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "chat-feedback";
      emptyMessage.textContent = "No messages yet. Start the conversation.";
      messageList.append(emptyMessage);
    } else {
      ordered.forEach(message => messageList.append(buildMessage(message)));
    }
    if (shouldScroll) messageList.scrollTop = messageList.scrollHeight;
  }

  async function loadHistory() {
    const response = await fetch(`/groups/${groupID}/chat/messages`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load message history");
    }

    const shouldScroll = true;
    result.messages.forEach(message => messages.set(Number(message.messageID), message));
    renderMessages(shouldScroll);
    loadingMessage.remove();
  }

  socket.on("connect", () => {
    joined = false;
    sendButton.disabled = true;
    showStatus("Connecting to this group…");
    socket.timeout(8000).emit("group:join", { groupID }, async (timeoutError, result) => {
      if (timeoutError || !result?.success) {
        showStatus(result?.message || "Unable to connect to this group chat. Reconnecting…", true);
        return;
      }

      joined = true;
      sendButton.disabled = false;
      showStatus("");
      try {
        await loadHistory();
      } catch (error) {
        console.error("Unable to load chat history:", error);
        showStatus(error.message || "Unable to load messages. Please try again.", true);
      }
    });
  });

  socket.on("disconnect", () => {
    joined = false;
    sendButton.disabled = true;
    showStatus("Connection lost. Reconnecting…", true);
  });

  socket.on("connect_error", error => {
    joined = false;
    sendButton.disabled = true;
    showStatus(error.message === "Unauthorized"
      ? "Your session has expired. Please sign in again."
      : "Unable to connect. Reconnecting…", true);
  });

  socket.on("group:message", message => {
    if (Number(message.groupID) && Number(message.groupID) !== groupID) return;
    const messageID = Number(message.messageID);
    if (!messageID || messages.has(messageID)) return;

    const wasNearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 100;
    messages.set(messageID, message);
    renderMessages(wasNearBottom || Number(message.userID) === currentUserID);
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) {
      showStatus("Enter a message before sending.", true);
      input.focus();
      return;
    }
    if (!joined || !socket.connected) {
      showStatus("Not connected. Please wait for chat to reconnect.", true);
      return;
    }

    sendButton.disabled = true;
    socket.timeout(8000).emit("group:message", { groupID, content }, (timeoutError, result) => {
      sendButton.disabled = !joined;
      if (timeoutError || !result?.success) {
        showStatus(result?.message || "Unable to send message. Please try again.", true);
        return;
      }
      input.value = "";
      input.style.height = "auto";
      showStatus("");
      input.focus();
    });
  });

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

  const individualTab = document.getElementById("individual-tab");
  const groupTab = document.getElementById("group-tab");
  const groupConversations = document.getElementById("group-conversations");
  const individualConversations = document.getElementById("individual-conversations");

  function selectTab(selectedTab) {
    const isGroup = selectedTab === groupTab;
    groupTab.classList.toggle("is-active", isGroup);
    individualTab.classList.toggle("is-active", !isGroup);
    groupTab.setAttribute("aria-selected", String(isGroup));
    individualTab.setAttribute("aria-selected", String(!isGroup));
    groupConversations.hidden = !isGroup;
    individualConversations.hidden = isGroup;
  }

  individualTab.addEventListener("click", () => selectTab(individualTab));
  groupTab.addEventListener("click", () => selectTab(groupTab));
})();
