const saveBtn = document.getElementById("saveBtn");
const exitBtn = document.getElementById("exitBtn");
const messageEl = document.getElementById("formMessage");

function showMessage(text) {
  messageEl.innerText = text;
  messageEl.style.display = "block";
}

function hideMessage() {
  messageEl.style.display = "none";
}

function label(value) {
  const [h, m] = value.split(":");
  const hour = Number(h);
  return `${((hour + 11) % 12) + 1}:${m} ${hour >= 12 ? "PM" : "AM"}`;
}

function setSelectValue(select, value) {
  if (![...select.options].some((o) => o.value === value)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label(value);
    select.appendChild(option);
    [...select.options]
      .sort((a, b) => a.value.localeCompare(b.value))
      .forEach((o) => select.appendChild(o));
  }
  select.value = value;
}

function syncEndOptions(day) {
  const startSel = document.getElementById("start_" + day);
  const endSel = document.getElementById("end_" + day);
  const start = startSel.value;

  Array.from(endSel.options).forEach((opt) => {
    opt.disabled = !!start && !!opt.value && opt.value <= start;
  });

  if (start && endSel.value && endSel.value <= start) {
    endSel.value = "";
  }
}

document.querySelectorAll(".day-toggle").forEach((checkbox) => {
  checkbox.addEventListener("change", function () {
    const day = this.dataset.day;
    document.getElementById("start_" + day).disabled = !this.checked;
    document.getElementById("end_" + day).disabled = !this.checked;
  });
});

document.querySelectorAll('select[id^="start_"]').forEach((select) => {
  select.addEventListener("change", function () {
    syncEndOptions(this.id.replace("start_", ""));
  });
});

async function loadAvailability() {
  try {
    const response = await fetch("/profile/data");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load availability");

    for (const [day, value] of Object.entries(data.availability || {})) {
      const checkbox = document.querySelector(`.day-toggle[data-day="${day}"]`);
      if (!checkbox || !value || !value[0] || !value[1]) continue;

      const startSel = document.getElementById("start_" + day);
      const endSel = document.getElementById("end_" + day);

      checkbox.checked = true;
      startSel.disabled = false;
      endSel.disabled = false;
      setSelectValue(startSel, value[0].slice(0, 5));
      setSelectValue(endSel, value[1].slice(0, 5));
      syncEndOptions(day);
    }
  } catch (error) {
    showMessage(error.message);
  }
}

async function saveAvailability() {
  hideMessage();
  const availability = [];

  for (const checkbox of document.querySelectorAll(".day-toggle:checked")) {
    const day = checkbox.dataset.day;
    const start = document.getElementById("start_" + day).value;
    const end = document.getElementById("end_" + day).value;

    if (!start || !end) {
      showMessage("Choose a start and end time for " + day + ".");
      return;
    }
    if (end <= start) {
      showMessage("End time must be after start time on " + day + ".");
      return;
    }
    availability.push({ day, start, end });
  }

  if (!availability.length) {
    showMessage("Select at least one day.");
    return;
  }

  saveBtn.disabled = true;

  try {
    const response = await fetch("/profile/availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ availability }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to save availability");
    showMessage("Availability saved.");
  } catch (error) {
    showMessage(error.message);
  } finally {
    saveBtn.disabled = false;
  }
}

exitBtn.addEventListener("click", () => {
  window.location.href = "/profile/edit";
});
saveBtn.addEventListener("click", saveAvailability);

loadAvailability();