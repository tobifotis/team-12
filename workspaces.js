const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const pool = require("./config/db");
const { mustBeLoggedIn } = require("./middleware/auth");
const { getGroupAndPartner } = require("./utils/matchmaking");

const joinPreloads = [
  '/images/joinworkspacestars.webp',
  '/images/joinGlow.webp',
  '/images/buildings.webp',
  '/images/buildingsLightOn.webp',
  '/images/buildingsLightOn2.webp',
  '/images/catblock.png',
  '/images/cattail.png',
  '/images/cat.png'
];

const createPreloads = [
  '/images/sun.webp',
  '/images/topCloud.webp',
  '/images/bottomCloud.webp'
];

const workspacesPreloads = [
  { href: '/images/ground.png',       media: '(min-width: 901px)' },
  { href: '/images/groundMobile.png', media: '(max-width: 900px)' },
  '/images/topStars.webp',
  '/images/bottomStars.webp'
];

const noWorkspacesPreloads = [
  '/images/starsNoWorkspace.webp',
  '/images/groundNoWorkspace.png'
];

const membersPreloads = [
  '/images/rosieWM.webp'
];


// GET user's workspaces
router.get("/", mustBeLoggedIn, async (req, res) => {
    try {
        const [workspaces] = await pool.query(
            `SELECT w.* 
             FROM Workspace w
             JOIN User_Workspace uw
             ON w.workspaceID = uw.workspaceID
             WHERE uw.userID = ?`,
            [req.user.userID]
        );
        res.render("workspaces", {
            workspaces,
            errors: [],
            preloads: workspaces.length ? workspacesPreloads : noWorkspacesPreloads
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// GET create workspace page
router.get("/create", mustBeLoggedIn, (req, res) => {
    res.render("CreateWorkspace", { errors: [], preloads: createPreloads });
});

// GET join workspace page
router.get("/join-page", mustBeLoggedIn, (req, res) => {
    res.render("JoinWorkspace", { errors: [], preloads: joinPreloads });
});

// POST create workspace (from CreateWorkspace page)
router.post("/create", mustBeLoggedIn, async (req, res) => {
    const errors = [];
    let { workspaceName, description, startDate, endDate } = req.body;

    workspaceName = typeof workspaceName === "string" ? workspaceName.trim() : "";
    description = typeof description === "string" ? description.trim() : "";

    if (!workspaceName) errors.push("Workspace name is required!");
    if (workspaceName.length < 3) errors.push("Workspace name must be at least 3 characters");
    if (workspaceName.length > 100) errors.push("Workspace name cannot exceed 100 characters");
    // if (!startDate) errors.push("Start date is required!");
    // if (!endDate) errors.push("End date is required!");
    // if (startDate && endDate && startDate > endDate) errors.push("End date must be after start date");

    if (errors.length) {
      return res.render("CreateWorkspace", { errors, preloads: createPreloads });
    }

    try {
        let joinCode, isUnique = false;
        while (!isUnique) {
            joinCode = crypto.randomBytes(5).toString("hex").toUpperCase();
            const [existing] = await pool.query("SELECT workspaceID FROM Workspace WHERE joinCode = ?", [joinCode]);
            if (existing.length === 0) isUnique = true;
        }

        const [result] = await pool.query(
    "INSERT INTO Workspace (workspaceName, ownerName, userID, joinCode, description) VALUES (?, ?, ?, ?, ?)",
    [workspaceName, req.user.username, req.user.userID, joinCode, description]
);

        await pool.query(
            "INSERT INTO User_Workspace (userID, workspaceID, isOwner) VALUES (?, ?, ?)",
            [req.user.userID, result.insertId, true]
        );

        res.redirect("/workspaces");
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// POST create workspace (original inline form - kept for backward compatibility)
router.post("/", mustBeLoggedIn, async (req, res) => {
    const errors = [];
    let { workspaceName } = req.body;

    workspaceName = typeof workspaceName === "string" ? workspaceName.trim() : "";

    if (!workspaceName) errors.push("Workspace name is required!");
    if (workspaceName.length < 3) errors.push("Workspace name must be at least 3 characters");
    if (workspaceName.length > 100) errors.push("Workspace name cannot exceed 100 characters");

    if (errors.length) {
        const [workspaces] = await pool.query(
            "SELECT w.* FROM Workspace w JOIN User_Workspace uw ON w.workspaceID = uw.workspaceID WHERE uw.userID = ?",
            [req.user.userID]
        );
        return res.render("workspaces", { workspaces, errors });
    }

    try {
        let joinCode, isUnique = false;
        while (!isUnique) {
            joinCode = crypto.randomBytes(5).toString("hex").toUpperCase();
            const [existing] = await pool.query("SELECT workspaceID FROM Workspace WHERE joinCode = ?", [joinCode]);
            if (existing.length === 0) isUnique = true;
        }

        const [result] = await pool.query(
          "INSERT INTO Workspace (workspaceName, ownerName, userID, joinCode, description) VALUES (?, ?, ?, ?, ?)",
          [workspaceName, req.user.username, req.user.userID, joinCode, description]
        );

        await pool.query(
            "INSERT INTO User_Workspace (userID, workspaceID, isOwner) VALUES (?, ?, ?)",
            [req.user.userID, result.insertId, true]
        );

        res.redirect("/workspaces");
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// POST join existing workspace
router.post("/join", mustBeLoggedIn, async (req, res) => {
    const { joinCode } = req.body;
    const errors = [];
    const code = typeof joinCode === "string" ? joinCode.trim().toUpperCase() : "";

    if (!code) errors.push("Join code is required!");

    try {
        const [workspaceRows] = await pool.query(
            "SELECT * FROM Workspace WHERE joinCode = ?",
            [code]
        );

        if (workspaceRows.length === 0) errors.push("Invalid join code!");

        if (!errors.length) {
            const workspace = workspaceRows[0];

            const [existing] = await pool.query(
                "SELECT * FROM User_Workspace WHERE userID = ? AND workspaceID = ?",
                [req.user.userID, workspace.workspaceID]
            );

            if (existing.length > 0) errors.push("You are already a member of this workspace.");
            else await pool.query(
                "INSERT INTO User_Workspace (userID, workspaceID, isOwner) VALUES (?, ?, ?)",
                [req.user.userID, workspace.workspaceID, false]
            );
        }

        if (errors.length) {
          return res.render("JoinWorkspace", { errors, preloads: joinPreloads });
        }

        res.redirect("/workspaces");

    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

router.post("/:workspaceID/rename", mustBeLoggedIn, async (req, res) => {
  const workspaceName = typeof req.body.workspaceName === "string" ? req.body.workspaceName.trim() : "";
  if (workspaceName.length < 3 || workspaceName.length > 100) {
    return res.redirect(`/workspaces/${req.params.workspaceID}`);
  }
  try {
    const [result] = await pool.query(
      "UPDATE Workspace SET workspaceName = ? WHERE workspaceID = ? AND userID = ?",
      [workspaceName, req.params.workspaceID, req.user.userID]
    );
    if (!result.affectedRows) return res.status(403).redirect("/workspaces");
    res.redirect(`/workspaces/${req.params.workspaceID}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

router.post("/:workspaceID/delete", mustBeLoggedIn, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM Workspace WHERE workspaceID = ? AND userID = ?",
      [req.params.workspaceID, req.user.userID]
    );
    if (!result.affectedRows) return res.status(403).redirect("/workspaces");
    res.redirect("/workspaces");
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

router.post("/:workspaceID/leave", mustBeLoggedIn, async (req, res) => {
  const { workspaceID } = req.params;
  let connection;
  try {
    const [workspaceRows] = await pool.query(
      "SELECT userID FROM Workspace WHERE workspaceID = ?",
      [workspaceID]
    );
    if (!workspaceRows.length) return res.redirect("/workspaces");

    if (Number(workspaceRows[0].userID) === Number(req.user.userID)) {
      return res.redirect(`/workspaces/${workspaceID}`);
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    await connection.query(
      "DELETE FROM Team_Request WHERE userID = ? AND workspaceID = ?",
      [req.user.userID, workspaceID]
    );
    await connection.query(
      "DELETE i FROM Group_Invite i JOIN Team t ON t.groupID = i.groupID WHERE i.invitedUserID = ? AND t.workspaceID = ?",
      [req.user.userID, workspaceID]
    );
    await connection.query(
      "DELETE FROM User_Team WHERE userID = ? AND workspaceID = ?",
      [req.user.userID, workspaceID]
    );
    await connection.query(
      "DELETE FROM User_Workspace WHERE userID = ? AND workspaceID = ? AND isOwner = FALSE",
      [req.user.userID, workspaceID]
    );

    await connection.commit();
    res.redirect("/workspaces");
  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).send("Database error");
  } finally {
    if (connection) connection.release();
  }
});

// GET specific user workspace with groups
router.get("/:workspaceID", mustBeLoggedIn, async (req, res) => {
  try {
    const workspaceID = req.params.workspaceID;
    const [workspaceRows] = await pool.query("SELECT * FROM Workspace WHERE workspaceID = ?", [workspaceID]);
    if (workspaceRows.length === 0) {
      return res.status(404).redirect("/workspaces");
    }
    const workspace = workspaceRows[0];

    // Check user access
    const [accessRows] = await pool.query(
      "SELECT * FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
      [workspaceID, req.user.userID]
    );
    if (accessRows.length === 0) {
      return res.status(403).redirect("/workspaces");
    }

    // Fetch user's groups in this workspace
    const [groups] = await pool.query(`
      SELECT g.* FROM \`Team\` g
      JOIN User_Team ug ON g.groupID = ug.groupID
      WHERE g.workspaceID = ? AND ug.userID = ?
      ORDER BY g.createdAt DESC
    `, [workspaceID, req.user.userID]);

    res.render("user_workspace", {
      workspace,
      groups,
      isWorkspaceOwner: Number(workspace.userID) === Number(req.user.userID)
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// GET AI group suggestions page (placeholder for now)
router.get("/:workspaceID/suggestions", mustBeLoggedIn, async (req, res) => {
  try {
    const workspaceID = req.params.workspaceID;
    const [workspaceRows] = await pool.query("SELECT * FROM Workspace WHERE workspaceID = ?", [workspaceID]);
    if (workspaceRows.length === 0) {
      return res.status(404).redirect("/workspaces");
    }
    const workspace = workspaceRows[0];

    // Check user access
    const [accessRows] = await pool.query(
      "SELECT * FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
      [workspaceID, req.user.userID]
    );
    if (accessRows.length === 0) {
      return res.status(403).redirect("/workspaces");
    }

    // ?mode=similar or ?mode=complementary (default)
    const { group, partner, warnings } = await getGroupAndPartner(
  pool, workspaceID, req.user.userID, { groupSize: 5 }
);
res.render("GroupSuggestions", {
  workspace,
  user: req.user,
  group,
  partner,
  warnings,
  isWorkspaceOwner: Number(workspace.userID) === Number(req.user.userID)
});
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

router.get("/:workspaceID/members", mustBeLoggedIn, async (req, res) => {
  try {
    const workspaceID = req.params.workspaceID;
 
    const [workspaceRows] = await pool.query(
      "SELECT * FROM Workspace WHERE workspaceID = ?",
      [workspaceID]
    );
    if (!workspaceRows.length) return res.redirect("/workspaces");
 
    const [accessRows] = await pool.query(
      "SELECT 1 FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
      [workspaceID, req.user.userID]
    );
    if (!accessRows.length) return res.redirect("/workspaces");
 
    const [members] = await pool.query(
      `SELECT u.userID, u.username, u.email, uw.isOwner, up.profilePicture,
          COALESCE(NULLIF(TRIM(up.displayName), ''), u.username) AS displayName
      FROM User_Workspace uw
      JOIN User u ON u.userID = uw.userID
      LEFT JOIN User_Profile up ON up.userID = u.userID
      WHERE uw.workspaceID = ?
      ORDER BY uw.isOwner DESC, COALESCE(NULLIF(TRIM(up.displayName), ''), u.username) ASC`,
      [workspaceID]
    );

    const [myGroups] = await pool.query(
      "SELECT groupID, groupName FROM `Team` WHERE userID = ? AND workspaceID = ? ORDER BY groupName",
      [req.user.userID, workspaceID]
    );
 
    const workspace = workspaceRows[0];
    res.render("WorkspaceMembers", {
      workspace,
      members,
      myGroups,
      currentUserID: req.user.userID,
      isWorkspaceOwner: Number(workspace.userID) === Number(req.user.userID),
      message: req.query.message || "",
      preloads: membersPreloads
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});
 
router.post("/:workspaceID/members/:memberID/remove", mustBeLoggedIn, async (req, res) => {
  const { workspaceID, memberID } = req.params;
  const back = (msg) =>
    res.redirect(`/workspaces/${workspaceID}/members?message=${encodeURIComponent(msg)}`);
 
  let connection;
  try {
    const [workspaceRows] = await pool.query(
      "SELECT userID FROM Workspace WHERE workspaceID = ?",
      [workspaceID]
    );
    if (!workspaceRows.length) return res.redirect("/workspaces");
 
    if (Number(workspaceRows[0].userID) !== Number(req.user.userID)) {
      return res.status(403).redirect(`/workspaces/${workspaceID}/members`);
    }
    if (Number(memberID) === Number(req.user.userID)) {
      return back("The owner can't be removed from the workspace.");
    }
    const [memberRows] = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(up.displayName), ''), u.username) AS name
      FROM User u
      LEFT JOIN User_Profile up ON up.userID = u.userID
      WHERE u.userID = ?`,
      [memberID]
    );
    const memberName = memberRows.length ? memberRows[0].name : "Member";
 
    connection = await pool.getConnection();
    await connection.beginTransaction();
 
    await connection.query(
      "DELETE FROM Team_Request WHERE userID = ? AND workspaceID = ?",
      [memberID, workspaceID]
    );
    await connection.query(
      "DELETE i FROM Group_Invite i JOIN Team t ON t.groupID = i.groupID WHERE i.invitedUserID = ? AND t.workspaceID = ?",
      [memberID, workspaceID]
    );
    await connection.query(
      "DELETE FROM User_Team WHERE userID = ? AND workspaceID = ?",
      [memberID, workspaceID]
    );
    const [result] = await connection.query(
      "DELETE FROM User_Workspace WHERE userID = ? AND workspaceID = ? AND isOwner = FALSE",
      [memberID, workspaceID]
    );
 
    await connection.commit();
    back(
      result.affectedRows
        ? `${memberName} was removed from the workspace.`
        : `${memberName} is no longer in this workspace.`
    );
  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).send("Database error");
  } finally {
    if (connection) connection.release();
  }
});


module.exports = router;