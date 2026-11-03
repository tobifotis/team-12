(function () {
  const page = document.querySelector(".planningPage")
  if (!page) return

  const groupID = page.dataset.groupId
  const base = "/groups/" + groupID + "/planning/tasks"

  const messageBox = document.getElementById("planningMessage")
  const modal = document.getElementById("cardModal")
  const form = document.getElementById("cardForm")
  const modalTitle = document.getElementById("cardModalTitle")
  const titleInput = document.getElementById("cardTitle")
  const descInput = document.getElementById("cardDescription")
  const dueInput = document.getElementById("cardDue")
  const deleteModal = document.getElementById("deleteModal")
  const deleteName = document.getElementById("deleteCardName")

  const MAX_PER_DAY = 99

  let editingID = null
  let deletingID = null
  let addingStatus = "To Do"

  function showMessage(text) {
    messageBox.textContent = text
    messageBox.hidden = false
    setTimeout(function () { messageBox.hidden = true }, 4000)
  }

  async function send(url, data) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data || {})
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        showMessage(json.message || "Something went wrong")
        return false
      }
      return true
    } catch (err) {
      showMessage("Could not reach the server")
      return false
    }
  }

  /* ---------- add / edit modal ---------- */

  function openModal(card, status) {
    form.reset()
    dueInput.setCustomValidity("")
    if (card) {
      editingID = card.dataset.taskId
      modalTitle.textContent = "Edit Card"
      titleInput.value = card.dataset.title
      descInput.value = card.dataset.description
      dueInput.value = card.dataset.due
    } else {
      editingID = null
      addingStatus = status || "To Do"
      modalTitle.textContent = "Add Card"
    }
    modal.classList.add("is-open")
    modal.setAttribute("aria-hidden", "false")
    titleInput.focus()
  }

  function closeModal() {
    modal.classList.remove("is-open")
    modal.setAttribute("aria-hidden", "true")
    editingID = null
  }

  document.getElementById("cardCancel").addEventListener("click", closeModal)
  document.getElementById("cardModalClose").addEventListener("click", closeModal)
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal() })

  form.addEventListener("submit", async function (event) {
    event.preventDefault()
    const data = {
      title: titleInput.value,
      description: descInput.value,
      dueDate: dueInput.value
    }
    if (!editingID) data.status = addingStatus

    if (data.dueDate) {
      const onDay = allCards.filter(function (c) {
        return c.due === data.dueDate && c.id !== editingID
      }).length
      if (onDay >= MAX_PER_DAY) {
        dueInput.setCustomValidity("That day already has " + MAX_PER_DAY + " tasks. Pick another date.")
        dueInput.reportValidity()
        return
      }
    }

    const url = editingID ? base + "/" + editingID + "/edit" : base
    if (await send(url, data)) location.reload()
  })

  dueInput.addEventListener("input", function () { dueInput.setCustomValidity("") })

  document.querySelectorAll(".planningAddBtn").forEach(function (btn) {
    btn.addEventListener("click", function () { openModal(null, btn.dataset.status) })
  })

  /* ---------- delete modal ---------- */

  function openDelete(card) {
    deletingID = card.dataset.taskId
    deleteName.textContent = card.dataset.title
    deleteModal.classList.add("is-open")
    deleteModal.setAttribute("aria-hidden", "false")
  }

  function closeDelete() {
    deleteModal.classList.remove("is-open")
    deleteModal.setAttribute("aria-hidden", "true")
    deletingID = null
  }

  document.getElementById("deleteCancel").addEventListener("click", closeDelete)
  document.getElementById("deleteModalClose").addEventListener("click", closeDelete)
  deleteModal.addEventListener("click", function (e) { if (e.target === deleteModal) closeDelete() })
  document.getElementById("deleteConfirm").addEventListener("click", async function () {
    if (!deletingID) return
    const id = deletingID
    if (await send(base + "/" + id + "/delete")) location.reload()
    else closeDelete()
  })

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeModal(); closeDelete() }
  })

  /* rename columns */

  const NAMES_KEY = "planningColumnNames:" + groupID

  function loadNames() {
    try { return JSON.parse(localStorage.getItem(NAMES_KEY)) || {} } catch (e) { return {} }
  }
  function saveNames(names) {
    try { localStorage.setItem(NAMES_KEY, JSON.stringify(names)) } catch (e) {}
  }
  const columnNames = loadNames()

  function startRename(title, status) {
    if (title.querySelector("input")) return
    const input = document.createElement("input")
    input.type = "text"
    input.className = "planningColumnInput"
    input.maxLength = 30
    input.value = title.textContent.trim()
    input.setAttribute("aria-label", "Column name")
    title.textContent = ""
    title.classList.add("editing")
    title.appendChild(input)
    input.focus()
    input.select()

    let finished = false
    function finish(save) {
      if (finished) return
      finished = true
      if (save) {
        const value = input.value.trim()
        if (value && value !== status) columnNames[status] = value
        else delete columnNames[status]
        saveNames(columnNames)
      }
      title.classList.remove("editing")
      title.textContent = columnNames[status] || status
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") finish(true)
      else if (e.key === "Escape") finish(false)
    })
    input.addEventListener("blur", function () { finish(true) })
  }

  document.querySelectorAll(".planningColumnName").forEach(function (title) {
    const status = title.dataset.status
    if (columnNames[status]) title.textContent = columnNames[status]
    title.addEventListener("dblclick", function () { startRename(title, status) })
  })

  /* ---------- card buttons (edit, move, delete) ---------- */

  document.addEventListener("click", async function (event) {
    const card = event.target.closest(".planningCard")
    if (!card) return
    const id = card.dataset.taskId

    if (event.target.closest(".planningEditBtn")) {
      openModal(card)
    } else if (event.target.closest(".planningMoveBtn")) {
      const target = event.target.closest(".planningMoveBtn").dataset.target
      if (await send(base + "/" + id + "/move", { status: target })) location.reload()
    } else if (event.target.closest(".planningDeleteBtn")) {
      openDelete(card)
    }
  })

  /* ---------- drag and drop ---------- */

  let dragged = null

  document.querySelectorAll(".planningCard").forEach(function (card) {
    card.addEventListener("dragstart", function (event) {
      dragged = card
      card.classList.add("dragging")
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", card.dataset.taskId)
    })
    card.addEventListener("dragend", function () {
      card.classList.remove("dragging")
      document.querySelectorAll(".dragOver").forEach(function (el) { el.classList.remove("dragOver") })
    })
  })

  // finds the card the dragged card should go in front of
  function cardAfter(list, y) {
    const cards = Array.from(list.querySelectorAll(".planningCard:not(.dragging)"))
    let result = null
    let closest = Number.NEGATIVE_INFINITY
    cards.forEach(function (c) {
      const box = c.getBoundingClientRect()
      const offset = y - (box.top + box.height / 2)
      if (offset < 0 && offset > closest) {
        closest = offset
        result = c
      }
    })
    return result
  }

  document.querySelectorAll(".planningCardList").forEach(function (list) {
    list.addEventListener("dragover", function (event) {
      if (!dragged) return
      event.preventDefault()
      list.classList.add("dragOver")
      const after = cardAfter(list, event.clientY)
      if (after) list.insertBefore(dragged, after)
      else list.appendChild(dragged)
    })
    list.addEventListener("dragleave", function (event) {
      if (!list.contains(event.relatedTarget)) list.classList.remove("dragOver")
    })
    list.addEventListener("drop", async function (event) {
      event.preventDefault()
      if (!dragged) return
      const cards = Array.from(list.querySelectorAll(".planningCard"))
      const position = cards.indexOf(dragged)
      const ok = await send(base + "/" + dragged.dataset.taskId + "/move", {
        status: list.dataset.status,
        position: position
      })
      dragged = null
      location.reload()
      if (!ok) showMessage("Could not save the move")
    })
  })

  /* ---------- weekly calendar ---------- */

  const calendarPanel = document.getElementById("calendarPanel")
  const calendarToggle = document.getElementById("calendarToggle")
  const weekLabel = document.getElementById("weekLabel")
  const weekDays = document.getElementById("weekDays")
  const dayTasks = document.getElementById("dayTasks")
  const monthViewBtn = document.getElementById("monthViewBtn")
  const weekViewBtn = document.getElementById("weekViewBtn")
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  calendarToggle.addEventListener("click", function () {
    const collapsed = calendarPanel.classList.toggle("collapsed")
    calendarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true")
  })

  // read every card on the page so the calendar needs no extra requests
  const allCards = Array.from(document.querySelectorAll(".planningCard")).map(function (card) {
    return { id: card.dataset.taskId, title: card.dataset.title, description: card.dataset.description, due: card.dataset.due }
  })

  function dateKey(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return d.getFullYear() + "-" + m + "-" + day
  }

  function startOfWeek(d) {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    copy.setDate(copy.getDate() - copy.getDay())
    return copy
  }

  const today = new Date()
  let selected = dateKey(today)
  let calendarView = "month"

  function shiftMonth(date, amount) {
    const targetMonth = date.getMonth() + amount
    const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate()
    return new Date(date.getFullYear(), targetMonth, Math.min(date.getDate(), lastDay), 12)
  }

  function renderCalendar(slide) {
    const selectedDate = new Date(selected + "T12:00:00")
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
    const gridStart = calendarView === "week" ? startOfWeek(selectedDate) : startOfWeek(monthStart)
    let dayCount = 7
    if (calendarView === "month") {
      const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0)
      dayCount = Math.ceil((lastDay.getDate() + monthStart.getDay()) / 7) * 7
      weekLabel.textContent = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    } else {
      const end = new Date(gridStart)
      end.setDate(end.getDate() + 6)
      weekLabel.textContent = gridStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " - " + end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    }

    monthViewBtn.classList.toggle("active", calendarView === "month")
    weekViewBtn.classList.toggle("active", calendarView === "week")
    monthViewBtn.setAttribute("aria-pressed", calendarView === "month" ? "true" : "false")
    weekViewBtn.setAttribute("aria-pressed", calendarView === "week" ? "true" : "false")
    weekDays.classList.toggle("weekView", calendarView === "week")

    weekDays.innerHTML = ""
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(gridStart)
      d.setDate(d.getDate() + i)
      const key = dateKey(d)
      const count = allCards.filter(function (c) { return c.due === key }).length

      const btn = document.createElement("button")
      btn.type = "button"
      btn.className = "planningDayBtn" + (key === selected ? " selected" : "") +
        (calendarView === "month" && d.getMonth() !== selectedDate.getMonth() ? " outsideMonth" : "")
      btn.setAttribute("aria-pressed", key === selected ? "true" : "false")
      btn.setAttribute("aria-label", d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
        (count ? ", " + count + (count === 1 ? " task" : " tasks") : ""))
      const dayName = document.createElement("span")
      dayName.textContent = dayNames[i]
      const dayNumber = document.createElement("strong")
      dayNumber.textContent = d.getDate()
      btn.appendChild(dayName)
      btn.appendChild(dayNumber)
      if (count) {
        const badge = document.createElement("span")
        badge.className = "planningDayCount"
        badge.textContent = count > MAX_PER_DAY ? MAX_PER_DAY + "+" : count
        badge.setAttribute("aria-label", count + (count === 1 ? " task" : " tasks"))
        btn.appendChild(badge)
      }
      btn.addEventListener("click", function () {
        selected = key
        renderCalendar()
      })
      weekDays.appendChild(btn)
    }

    weekDays.classList.remove("slideFromRight", "slideFromLeft")
    if (slide) {
      void weekDays.offsetWidth
      weekDays.classList.add(slide === "right" ? "slideFromRight" : "slideFromLeft")
    }

    dayTasks.innerHTML = ""
    const due = allCards.filter(function (c) { return c.due === selected })
    const dateHeading = document.createElement("p")
    dateHeading.className = "planningSelectedDate"
    dateHeading.textContent = selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    dayTasks.appendChild(dateHeading)
    if (!due.length) {
      const empty = document.createElement("p")
      empty.className = "planningEmpty"
      empty.textContent = "No tasks due on this day."
      dayTasks.appendChild(empty)
    }
    due.forEach(function (c) {
      const item = document.createElement("div")
      item.className = "planningDayTask"
      const title = document.createElement("span")
      title.className = "planningDayTaskTitle"
      title.textContent = c.title
      item.appendChild(title)
      if (c.description && c.description.trim()) {
        const description = document.createElement("span")
        description.className = "planningDayTaskDescription"
        description.textContent = c.description
        item.appendChild(description)
      }
      dayTasks.appendChild(item)
    })
  }

  document.getElementById("weekPrev").addEventListener("click", function () {
    const period = new Date(selected + "T12:00:00")
    if (calendarView === "month") selected = dateKey(shiftMonth(period, -1))
    else { period.setDate(period.getDate() - 7); selected = dateKey(period) }
    renderCalendar()
  })
  document.getElementById("weekNext").addEventListener("click", function () {
    const period = new Date(selected + "T12:00:00")
    if (calendarView === "month") selected = dateKey(shiftMonth(period, 1))
    else { period.setDate(period.getDate() + 7); selected = dateKey(period) }
    renderCalendar()
  })
  monthViewBtn.addEventListener("click", function () {
    if (calendarView === "month") return
    calendarView = "month"
    renderCalendar("left")
  })
  weekViewBtn.addEventListener("click", function () {
    if (calendarView === "week") return
    calendarView = "week"
    renderCalendar("right")
  })

  renderCalendar()
})()