(function () {
  const page = document.querySelector(".planningPage")
  if (!page) return

  const groupID = page.dataset.groupId
  const isLeader = page.dataset.isLeader === "true"
  const base = "/groups/" + groupID + "/planning/tasks"

  const messageBox = document.getElementById("planningMessage")
  const modal = document.getElementById("cardModal")
  const form = document.getElementById("cardForm")
  const modalTitle = document.getElementById("cardModalTitle")
  const titleInput = document.getElementById("cardTitle")
  const descInput = document.getElementById("cardDescription")
  const dueInput = document.getElementById("cardDue")

  let editingID = null

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

  function openModal(card) {
    form.reset()
    if (card) {
      editingID = card.dataset.taskId
      modalTitle.textContent = "Edit Card"
      titleInput.value = card.dataset.title
      descInput.value = card.dataset.description
      dueInput.value = card.dataset.due
    } else {
      editingID = null
      modalTitle.textContent = "Add Card"
    }
    modal.hidden = false
    titleInput.focus()
  }

  function closeModal() {
    modal.hidden = true
    editingID = null
  }

  document.getElementById("cardCancel").addEventListener("click", closeModal)

  form.addEventListener("submit", async function (event) {
    event.preventDefault()
    const data = {
      title: titleInput.value,
      description: descInput.value,
      dueDate: dueInput.value
    }
    const url = editingID ? base + "/" + editingID + "/edit" : base
    if (await send(url, data)) location.reload()
  })

  const addBtn = document.getElementById("addCardBtn")
  if (addBtn) addBtn.addEventListener("click", function () { openModal(null) })

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
      if (!isLeader) return
      if (!confirm("Delete this card?")) return
      if (await send(base + "/" + id + "/delete")) location.reload()
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

  const weekLabel = document.getElementById("weekLabel")
  const weekDays = document.getElementById("weekDays")
  const dayTasks = document.getElementById("dayTasks")
  const monthViewBtn = document.getElementById("monthViewBtn")
  const weekViewBtn = document.getElementById("weekViewBtn")
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // read every card on the page so the calendar needs no extra requests
  const allCards = Array.from(document.querySelectorAll(".planningCard")).map(function (card) {
    return { title: card.dataset.title, description: card.dataset.description, due: card.dataset.due }
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

  function renderCalendar() {
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
        badge.textContent = count
        badge.setAttribute("aria-label", count + (count === 1 ? " task" : " tasks"))
        btn.appendChild(badge)
      }
      btn.addEventListener("click", function () {
        selected = key
        renderCalendar()
      })
      weekDays.appendChild(btn)
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
  monthViewBtn.addEventListener("click", function () { calendarView = "month"; renderCalendar() })
  weekViewBtn.addEventListener("click", function () { calendarView = "week"; renderCalendar() })

  renderCalendar()
})()
