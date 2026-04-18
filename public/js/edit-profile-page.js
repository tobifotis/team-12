const editProfilePicturePreview = document.getElementById("editProfilePicturePreview");
const editProfilePictureInput = document.getElementById("editProfilePictureInput");
const editChangePhotoBtn = document.getElementById("editChangePhotoBtn");
const editPictureStatus = document.getElementById("editPictureStatus");

const editDisplayNameText = document.getElementById("editDisplayNameText");

const editDisplayNameInput = document.getElementById("editDisplayName");
const editOrganizationInput = document.getElementById("editOrganization");
const editCurrentRoleInput = document.getElementById("editCurrentRole");
const editBioInput = document.getElementById("editBio");
const editBioCount = document.getElementById("editBioCount");

const editProfileForm = document.getElementById("editProfileForm");
const editSaveProfileBtn = document.getElementById("editSaveProfileBtn");
const editCancelBtn = document.getElementById("editCancelBtn");

const editNewSkillInput = document.getElementById("editNewSkillInput");
const editAddSkillBtn = document.getElementById("editAddSkillBtn");
const editUpdateSkillsBtn = document.getElementById("editUpdateSkillsBtn");
const editSkillsList = document.getElementById("editSkillsList");

const editAvailabilityList = document.getElementById("editAvailabilityList");
const editEditAvailabilityBtn = document.getElementById("editEditAvailabilityBtn");

const editProfileStatus = document.getElementById("editProfileStatus");
const editSkillsStatus = document.getElementById("editSkillsStatus");

let editCurrentSkills = [];

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

function updateEditBioCount() {
  editBioCount.textContent = `${editBioInput.value.length}/150`;
}

function renderEditSkills() {
  editSkillsList.innerHTML = "";

  if (editCurrentSkills.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No skills added yet.";
    empty.style.color = "#999";
    editSkillsList.appendChild(empty);
    return;
  }

  editCurrentSkills.forEach((skill, index) => {
    const pill = document.createElement("span");
    pill.className = "skill-pill";

    const textNode = document.createElement("span");
    textNode.textContent = skill;
    pill.appendChild(textNode);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "skill-remove-btn";
    removeBtn.textContent = "x";
    removeBtn.addEventListener("click", () => {
      editCurrentSkills.splice(index, 1);
      renderEditSkills();
    });
    pill.appendChild(removeBtn);

    editSkillsList.appendChild(pill);
  });
}

function renderEditAvailability(availability) {
  editAvailabilityList.innerHTML = "";

  const days = getOrderedDays(Object.keys(availability || {}));
  if (days.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No availability saved yet.";
    empty.style.color = "#999";
    editAvailabilityList.appendChild(empty);
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
    editAvailabilityList.appendChild(row);
  });
}

function setEditProfileFields(data) {
  editDisplayNameText.textContent = data.displayName || "Display Name";
  editDisplayNameInput.value = data.displayName || "";
  editCurrentRoleInput.value = data.currentRole || "";
  editOrganizationInput.value = data.organization || "";
  editBioInput.value = data.bio || "";
  updateEditBioCount();

  editProfilePicturePreview.src = data.profilePicture || "";
  editPictureStatus.textContent = data.profilePicture ? "" : "No profile picture uploaded yet.";

  editCurrentSkills = Array.isArray(data.skills) ? [...data.skills] : [];
  renderEditSkills();
  renderEditAvailability(data.availability || {});
}

async function loadEditProfile() {
  try {
    const response = await fetch("/profile/data");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load profile");
    }

    setEditProfileFields(data);
    document.querySelector(".profile-content").classList.add("loaded");
  } catch (error) {
    editProfileStatus.textContent = error.message;
    document.querySelector(".profile-content").classList.add("loaded");
  }
}

editChangePhotoBtn.addEventListener("click", () => {
  editProfilePictureInput.click();
});

editProfilePictureInput.addEventListener("change", async () => {
  if (!editProfilePictureInput.files || editProfilePictureInput.files.length === 0) return;

  const formData = new FormData();
  formData.append("profilePicture", editProfilePictureInput.files[0]);

  try {
    const response = await fetch("/profile/upload-picture", {
      method: "PATCH",
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to upload picture");
    }

    editPictureStatus.textContent = "Profile picture updated.";
    await loadEditProfile();
  } catch (error) {
    editPictureStatus.textContent = error.message;
  }
});

editProfileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const response = await fetch("/profile/save", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: editDisplayNameInput.value,
        organization: editOrganizationInput.value,
        currentRole: editCurrentRoleInput.value,
        bio: editBioInput.value,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Failed to save profile");
    }

    editProfileStatus.textContent = "Profile saved.";
    window.location.href = "/profile";
  } catch (error) {
    editProfileStatus.textContent = error.message;
  }
});

editCancelBtn.addEventListener("click", () => {
  window.location.href = "/profile";
});

editAddSkillBtn.addEventListener("click", () => {
  const skill = editNewSkillInput.value.trim();
  if (!skill) return;

  editCurrentSkills.push(skill);
  editNewSkillInput.value = "";
  renderEditSkills();
});

editUpdateSkillsBtn.addEventListener("click", async () => {
  try {
    const response = await fetch("/profile/update-skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: editCurrentSkills }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Failed to update skills");
    }

    editSkillsStatus.textContent = "Skills updated.";
    await loadEditProfile();
  } catch (error) {
    editSkillsStatus.textContent = error.message;
  }
});

editEditAvailabilityBtn.addEventListener("click", () => {
  window.location.href = "/profile/availability";
});

editBioInput.addEventListener("input", updateEditBioCount);

loadEditProfile();
