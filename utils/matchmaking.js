// utils/matchmaking.js
// Rule-based member suggestions for a workspace.
// For one user, ranks the other workspace members by skills fit and shared availability.
//
// skillMode:
//   "complementary" (default): rewards candidates who bring skills the user does NOT have
//   "similar": rewards candidates who share skills with the user

const TARGET_OVERLAP_MINUTES = 360; // 6 hrs/week of shared time counts as a full availability score
const WEIGHTS = { skills: 0.5, availability: 0.5 };
const NO_OVERLAP_PENALTY = 0.4; // multiplier applied when two people share zero meeting time

function timeToMinutes(timeStr) {
    // mysql2 returns TIME columns as "HH:MM:SS"
    const [h, m] = String(timeStr).split(":").map(Number);
    return h * 60 + m;
}

function overlapMinutes(startA, endA, startB, endB) {
    return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

// Total minutes per week that two users' availability blocks overlap
function computeAvailabilityOverlap(availA, availB) {
    let total = 0;
    for (const a of availA) {
        for (const b of availB) {
            if (a.day !== b.day) continue;
            total += overlapMinutes(
                timeToMinutes(a.start), timeToMinutes(a.end),
                timeToMinutes(b.start), timeToMinutes(b.end)
            );
        }
    }
    return total;
}

// Lowercase-dedupe a skills list, keeping the first original spelling
function uniqueSkills(list) {
    const seen = new Map();
    for (const s of list) {
        const key = String(s).trim().toLowerCase();
        if (key && !seen.has(key)) seen.set(key, String(s).trim());
    }
    return [...seen.values()];
}

function computeSkillScore(userSkills, candidateSkills, mode) {
    const mine = new Set(userSkills.map(s => s.toLowerCase()));
    const shared = candidateSkills.filter(s => mine.has(s.toLowerCase()));
    const added = candidateSkills.filter(s => !mine.has(s.toLowerCase()));

    let score = 0;
    if (userSkills.length > 0 && candidateSkills.length > 0) {
        if (mode === "similar") {
            // Jaccard: shared / union
            const union = userSkills.length + candidateSkills.length - shared.length;
            score = shared.length / union;
        } else {
            // fraction of the candidate's skills the user lacks
            score = added.length / candidateSkills.length;
        }
    }
    return { score, shared, added };
}

// Pure scoring function (no database), easy to test.
// me / candidates look like { userID, username, skills: [..], availability: [{day,start,end}] }
function scoreCandidates(me, candidates, { skillMode = "complementary" } = {}) {
    const mySkills = uniqueSkills(me.skills);

    const scored = candidates.map(c => {
        const candSkills = uniqueSkills(c.skills);
        const skill = computeSkillScore(mySkills, candSkills, skillMode);
        const overlapMins = computeAvailabilityOverlap(me.availability, c.availability);
        const availabilityScore = Math.min(overlapMins / TARGET_OVERLAP_MINUTES, 1);

        let total = skill.score * WEIGHTS.skills + availabilityScore * WEIGHTS.availability;

        // No shared meeting time means they can't realistically work together,
        // so push them down the list no matter how good the skills fit is.
        const noOverlap = overlapMins === 0;
        if (noOverlap) total *= NO_OVERLAP_PENALTY;

        return {
            userID: c.userID,
            username: c.username,
            displayName: c.displayName || "",
            profilePicture: c.profilePicture || "",
            skills: candSkills,
            sharedSkills: skill.shared,
            newSkills: skill.added,
            overlapHours: Math.round((overlapMins / 60) * 10) / 10,
            skillScore: skill.score,
            availabilityScore,
            noOverlap,
            matchPercent: Math.round(total * 100)
        };
    });

    scored.sort((a, b) => b.matchPercent - a.matchPercent || b.overlapHours - a.overlapHours);
    return scored;
}

function groupBy(rows, keyFn, valueFn) {
    const map = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(valueFn(row));
    }
    return map;
}

// Main entry point. Three queries total, no matter how many members.
async function getSuggestionsForUser(pool, workspaceID, userID, options = {}) {
    const [members] = await pool.query(
        `SELECT u.userID, u.username, p.displayName, p.profilePicture
         FROM User_Workspace uw
         JOIN User u ON u.userID = uw.userID
         LEFT JOIN User_Profile p ON p.userID = u.userID
         WHERE uw.workspaceID = ?`,
        [workspaceID]
    );

    const warnings = [];
    const others = members.filter(m => Number(m.userID) !== Number(userID));
    if (others.length === 0) {
        return { suggestions: [], warnings: ["No other members have joined this workspace yet."] };
    }

    const ids = members.map(m => m.userID);
    const [skillRows] = await pool.query("SELECT userID, skills FROM Skills WHERE userID IN (?)", [ids]);
    const [availRows] = await pool.query("SELECT userID, day, start, end FROM Availability WHERE userID IN (?)", [ids]);

    const skillsByUser = groupBy(skillRows, r => r.userID, r => r.skills);
    const availByUser = groupBy(availRows, r => r.userID, r => ({ day: r.day, start: r.start, end: r.end }));

    const withData = m => ({
        ...m,
        skills: skillsByUser.get(m.userID) || [],
        availability: availByUser.get(m.userID) || []
    });

    const me = withData(members.find(m => Number(m.userID) === Number(userID)) || { userID });
    if (me.skills.length === 0) warnings.push("Add skills to your profile to improve your matches.");
    if (me.availability.length === 0) warnings.push("Set your weekly availability to see who you can meet with.");

    const suggestions = scoreCandidates(me, others.map(withData), options);
    return { suggestions, warnings };
}

module.exports = { getSuggestionsForUser, scoreCandidates };