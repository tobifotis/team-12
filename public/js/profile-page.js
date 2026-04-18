const profilePicturePreview = document.getElementById("profilePicturePreview");
const displayNameText = document.getElementById("displayNameText");
const organizationText = document.getElementById("organizationText");
const currentRoleText = document.getElementById("currentRoleText");
const bioViewText = document.getElementById("bioViewText");
const skillsList = document.getElementById("skillsList");
const availabilityList = document.getElementById("availabilityList");
const editProfileBtn = document.getElementById("editProfileBtn");
const profileStatus = document.getElementById("profileStatus");

let currentSkills = [];

function formatTime(value) {
  if (!value || typeof value !== "string") return "";

  const parts = value.split(":");
  if (parts.length < 2) return value;

  const hours = Number(parts[0]);
  const minutes = parts[1];
  if (Number.isNaN(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${minutes} ${suffix}`;
}

function getOrderedDays(days) {
  const order = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  return [...days].sort((a, b) => {
    const aIndex = order.indexOf(a);
    const bIndex = order.indexOf(b);

    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}



function renderSkills() {
  skillsList.innerHTML = "";

  if (currentSkills.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No skills added yet.";
    empty.style.color = "#999";
    skillsList.appendChild(empty);
    return;
  }

  currentSkills.forEach((skill) => {
    const pill = document.createElement("span");
    pill.className = "skill-pill view-mode";

    const textNode = document.createElement("span");
    textNode.textContent = skill;
    pill.appendChild(textNode);

    skillsList.appendChild(pill);
  });
}

function renderAvailability(availability) {
  availabilityList.innerHTML = "";

  const days = getOrderedDays(Object.keys(availability || {}));
  if (days.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No availability saved yet.";
    empty.style.color = "#999";
    availabilityList.appendChild(empty);
    return;
  }

  days.forEach((day) => {
    const value = availability[day] || [];
    const row = document.createElement("div");
    row.className = "availability-row";

    const dayLabel = document.createElement("span");
    dayLabel.className = "availability-day";
    dayLabel.textContent = day;

    const timeLabel = document.createElement("span");
    timeLabel.className = "availability-time";
    timeLabel.textContent = `${formatTime(value[0])} - ${formatTime(value[1])}`;

    row.appendChild(dayLabel);
    row.appendChild(timeLabel);
    availabilityList.appendChild(row);
  });
}

function setProfileFields(data) {
  displayNameText.textContent = data.displayName || "No display name";
  document.getElementById("currentRoleValue").textContent = data.currentRole || "No current role";
  document.getElementById("organizationValue").textContent = data.organization || "No organization";
  bioViewText.textContent = data.bio || "No bio added yet.";

  profilePicturePreview.src = data.profilePicture || "";

  currentSkills = Array.isArray(data.skills) ? [...data.skills] : [];
  renderSkills();
  renderAvailability(data.availability || {});
}

async function loadProfile() {
  try {
    const response = await fetch("/profile/data");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load profile");
    }

    setProfileFields(data);
    document.querySelector(".profile-content").classList.add("loaded");
  } catch (error) {
    profileStatus.textContent = error.message;
    document.querySelector(".profile-content").classList.add("loaded");
  }
}

editProfileBtn.addEventListener("click", () => {
  window.location.href = "/profile/edit";
});

loadProfile();
