const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const pool = require("./config/db");
const { mustBeLoggedIn } = require("./middleware/auth");

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
        res.render("workspaces", { workspaces, errors: [] });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// GET create workspace page
router.get("/create", mustBeLoggedIn, (req, res) => {
    res.render("CreateWorkspace", { errors: [] });
});

// GET join workspace page
router.get("/join-page", mustBeLoggedIn, (req, res) => {
    res.render("JoinWorkspace", { errors: [] });
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
        return res.render("CreateWorkspace", { errors });
    }

    try {
        let joinCode, isUnique = false;
        while (!isUnique) {
            joinCode = crypto.randomBytes(5).toString("hex").toUpperCase();
            const [existing] = await pool.query("SELECT workspaceID FROM Workspace WHERE joinCode = ?", [joinCode]);
            if (existing.length === 0) isUnique = true;
        }

        const [result] = await pool.query(
            "INSERT INTO Workspace (workspaceName, ownerName, userID, joinCode) VALUES (?, ?, ?, ?)",
            [workspaceName, req.user.username, req.user.userID, joinCode]
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
            "INSERT INTO Workspace (workspaceName, ownerName, userID, joinCode) VALUES (?, ?, ?, ?)",
            [workspaceName, req.user.username, req.user.userID, joinCode]
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
            return res.render("JoinWorkspace", { errors });
        }

        res.redirect("/workspaces");

    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

// Join group page.
router.get("/:workspaceID/join-groups", mustBeLoggedIn, async (req, res) => {
  try {
    const workspaceID = req.params.workspaceID;
    const [workspaceRows] = await pool.query("SELECT * FROM Workspace WHERE workspaceID = ?", [workspaceID]);
    const [accessRows] = await pool.query(
      "SELECT 1 FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
      [workspaceID, req.user.userID]
    );
    if (!workspaceRows.length || !accessRows.length) return res.redirect("/workspaces");

    const [groups] = await pool.query(`
      SELECT g.groupID, g.groupName, g.ownerName
      FROM \`Group\` g
      WHERE g.workspaceID = ?
        AND NOT EXISTS (
          SELECT 1 FROM User_Group ug WHERE ug.groupID = g.groupID AND ug.userID = ?
        )
      ORDER BY g.createdAt DESC
    `, [workspaceID, req.user.userID]);

    const publicGroups = groups.map(group => ({
      id: group.groupID,
      name: group.groupName,
      owner: group.ownerName
    }));
    const invites = [];

    res.render("JoinGroup", { workspace: workspaceRows[0], publicGroups, invites, message: req.query.message || "" });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

router.post("/:workspaceID/join-groups/:groupID", mustBeLoggedIn, async (req, res) => {
  try {
    const { workspaceID, groupID } = req.params;
    const [groups] = await pool.query("SELECT groupID FROM `Group` WHERE groupID = ? AND workspaceID = ?", [groupID, workspaceID]);
    if (!groups.length) return res.redirect(`/workspaces/${workspaceID}/join-groups?message=That+group+is+no+longer+available.`);
    await pool.query(
      "INSERT IGNORE INTO User_Group (userID, workspaceID, groupID, isOwner) VALUES (?, ?, ?, 'false')",
      [req.user.userID, workspaceID, groupID]
    );
    res.redirect(`/workspaces/${workspaceID}/join-groups?message=Request+sent!+You+have+been+added+to+the+group.`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
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
      SELECT g.* FROM \`Group\` g
      JOIN User_Group ug ON g.groupID = ug.groupID
      WHERE g.workspaceID = ? AND ug.userID = ?
      ORDER BY g.createdAt DESC
    `, [workspaceID, req.user.userID]);

    res.render("user_workspace", { workspace, groups });
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

    res.render("GroupSuggestions", { workspace, user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

module.exports = router;
