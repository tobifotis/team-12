let skills = [];

function addSkill() {
    const input = document.getElementById("skillInput");
    const skill = input.value.trim();

    if (!skill) return;

    if (skills.includes(skill)) {
        input.value = "";
        return;
    }

    skills.push(skill);
    input.value = "";

    renderSkills();
}

function renderSkills() {
    const container = document.getElementById("enteredSkills");
    container.innerHTML = "";

    skills.forEach((skill, index) => {
        const skillEl = document.createElement("div");
        skillEl.classList.add("skill-tag");

        const text = document.createElement("span");
        text.textContent = skill;

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "X";
        removeBtn.classList.add("remove-btn");

        removeBtn.onclick = () => {
            skills.splice(index, 1);
            renderSkills();
        };

        skillEl.appendChild(text);
        skillEl.appendChild(removeBtn);

        container.appendChild(skillEl);
    });
}

async function submitSkills() {
    if (skills.length === 0) {
        alert("Please add at least one skill");
        return;
    }

    const res = await fetch("/skills-selection", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ skills })
    });

    const data = await res.json();

    if (data.success) {
        window.location.href = "/dashboard";
    } else {
        alert("Error saving skills");
    }
}
