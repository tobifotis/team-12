const express = require("express")
const router = express.Router()
const pool = require("./config/db")
const { mustBeLoggedIn } = require("./middleware/auth")

async function renderCreateGroup(res, workspaceID, errors = [], formData = {}) {
    let workspace = { workspaceID, workspaceName: "Workspace" }
    let isWorkspaceOwner = false
    try {
        const [rows] = await pool.query(
            "SELECT workspaceID, workspaceName FROM Workspace WHERE workspaceID = ?",
            [workspaceID]
        )
        if (rows.length) workspace = rows[0]

        const [own] = await pool.query(
            "SELECT isOwner FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
            [workspaceID, res.req.user.userID]
        )
        isWorkspaceOwner = Number(own[0]?.isOwner) === 1
    } catch (err) {
        console.error(err)
    }

    return res.status(errors.length ? 400 : 200).render("CreateGroups", {
        workspace,
        isWorkspaceOwner,
        message: "",
        errors,
        formData
    })
}

router.get("/create", mustBeLoggedIn, async (req, res) => {
    const workspaceID = Number(req.query.workspaceID)
    if (!Number.isInteger(workspaceID) || workspaceID < 1) {
        return res.status(400).send("Missing or invalid workspaceID")
    }

    try {
        const [membership] = await pool.query(
            "SELECT workspaceID FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
            [workspaceID, req.user.userID]
        )
        if (membership.length === 0) return res.status(403).redirect("/workspaces")

        return renderCreateGroup(res, workspaceID, [], {})
    } catch (err) {
        console.error(err)
        return res.status(500).send("Database error")
    }
})

router.post("/create", mustBeLoggedIn, async (req, res) => {
    const workspaceID = Number(req.body.workspaceID)
    const groupName = typeof req.body.groupName === "string" ? req.body.groupName.trim() : ""
    const description = typeof req.body.description === "string" ? req.body.description.trim() : ""
    const visibility = req.body.visibility
    const joinType = req.body.joinType
    const formData = { groupName, description, visibility, joinType }
    const errors = []

    if (!Number.isInteger(workspaceID) || workspaceID < 1) {
        return res.status(400).send("Missing or invalid workspaceID")
    }
    if (!groupName) errors.push("Group name is required.")
    if (groupName.length > 100) errors.push("Group name cannot exceed 100 characters.")
    if (visibility !== "private" && visibility !== "public") errors.push("Select a valid visibility.")
    if (joinType !== "request" && joinType !== "open") errors.push("Select a valid join type.")

    if (errors.length) return renderCreateGroup(res, workspaceID, errors, formData)

    let connection
    try {
        connection = await pool.getConnection()
        await connection.beginTransaction()

        const [membership] = await connection.query(
            "SELECT workspaceID FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
            [workspaceID, req.user.userID]
        )
        if (membership.length === 0) {
            await connection.rollback()
            return res.status(403).redirect("/workspaces")
        }

        const [profile] = await connection.query(
            "SELECT displayName FROM User_Profile WHERE userID = ?",
            [req.user.userID]
        )
        const ownerName = profile[0]?.displayName?.trim() || req.user.username

        const [group] = await connection.query(
            `INSERT INTO \`Team\` (groupName, description, ownerName, userID, workspaceID, visibility, joinType)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [groupName, description || null, ownerName, req.user.userID, workspaceID, visibility, joinType]
        )

        await connection.query(
            "INSERT INTO User_Team (userID, workspaceID, groupID, isOwner) VALUES (?, ?, ?, 1)",
            [req.user.userID, workspaceID, group.insertId]
        )

        await connection.commit()
        return res.redirect(`/workspaces/${workspaceID}`)
    } catch (err) {
        if (connection) await connection.rollback()
        console.error(err)
        return res.status(500).send("Database error")
    } finally {
        if (connection) connection.release()
    }
})

router.get("/", mustBeLoggedIn, (req, res) => {
    res.send("Groups homepage")
})

router.get("/:groupID", mustBeLoggedIn, async (req, res) => {
    try {
        const [groupRows] = await pool.query(
            `SELECT g.* FROM \`Team\` g
             JOIN User_Team ut ON ut.groupID = g.groupID AND ut.userID = ?
             WHERE g.groupID = ?`,
            [req.user.userID, req.params.groupID]
        )
        if (!groupRows.length) return res.status(403).redirect("/workspaces")
        const group = groupRows[0]

        const [workspaceRows] = await pool.query(
            "SELECT workspaceID, workspaceName FROM Workspace WHERE workspaceID = ?",
            [group.workspaceID]
        )
        const [members] = await pool.query(
            `SELECT u.userID, p.profilePicture, COALESCE(NULLIF(TRIM(p.displayName), ''), u.username) AS name
             FROM User_Team ut
             JOIN User u ON u.userID = ut.userID
             LEFT JOIN User_Profile p ON p.userID = u.userID
             WHERE ut.groupID = ?
             ORDER BY name`,
            [group.groupID]
        )

        return res.render("group_page", {
            group,
            workspace: workspaceRows[0],
            members,
            currentUserID: req.user.userID,
            isGroupOwner: Number(group.userID) === Number(req.user.userID),
            message: req.query.message || ""
        })
    } catch (err) {
        console.error(err)
        return res.status(500).send("Database error")
    }
})

router.post("/:groupID/invite", mustBeLoggedIn, async (req, res) => {
    const groupID = req.params.groupID
    const invitee = typeof req.body.invitee === "string" ? req.body.invitee.trim() : ""
    const back = `/groups/${groupID}`
    if (!invitee) return res.redirect(`${back}?message=Enter+a+username+or+email+address.`)
    try {
        const [groups] = await pool.query("SELECT groupID, workspaceID FROM `Team` WHERE groupID = ? AND userID = ?", [groupID, req.user.userID])
        if (!groups.length) return res.status(403).redirect("/workspaces")
        const [users] = await pool.query("SELECT userID FROM User WHERE username = ? OR email = ?", [invitee, invitee])
        if (!users.length) return res.redirect(`${back}?message=No+user+found+with+that+username+or+email.`)
        const inviteeID = users[0].userID
        if (Number(inviteeID) === Number(req.user.userID)) return res.redirect(`${back}?message=You+already+belong+to+this+group.`)
        const [members] = await pool.query("SELECT 1 FROM User_Team WHERE groupID = ? AND userID = ?", [groupID, inviteeID])
        if (members.length) return res.redirect(`${back}?message=That+person+is+already+a+member.`)
        await pool.query("INSERT INTO Group_Invite (groupID, invitedBy, invitedUserID) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = 'pending', invitedBy = VALUES(invitedBy), createdAt = CURRENT_TIMESTAMP", [groupID, req.user.userID, inviteeID])
        return res.redirect(`${back}?message=Invitation+sent.`)
    } catch (err) {
        console.error(err)
        return res.status(500).send("Database error")
    }
})

router.post("/:groupID/rename", mustBeLoggedIn, async (req, res) => {
    const groupName = typeof req.body.groupName === "string" ? req.body.groupName.trim() : ""
    if (!groupName || groupName.length > 100) return res.redirect(`/groups/${req.params.groupID}`)
    try {
        const [result] = await pool.query(
            "UPDATE `Team` SET groupName = ? WHERE groupID = ? AND userID = ?",
            [groupName, req.params.groupID, req.user.userID]
        )
        if (!result.affectedRows) return res.status(403).redirect("/workspaces")
        return res.redirect(`/groups/${req.params.groupID}`)
    } catch (err) {
        console.error(err)
        return res.status(500).send("Database error")
    }
})

router.post("/:groupID/delete", mustBeLoggedIn, async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT workspaceID FROM `Team` WHERE groupID = ? AND userID = ?",
            [req.params.groupID, req.user.userID]
        )
        if (!rows.length) return res.status(403).redirect("/workspaces")
        await pool.query("DELETE FROM `Team` WHERE groupID = ? AND userID = ?", [req.params.groupID, req.user.userID])
        return res.redirect(`/workspaces/${rows[0].workspaceID}`)
    } catch (err) {
        console.error(err)
        return res.status(500).send("Database error")
    }
})

router.post("/:groupID/leave", mustBeLoggedIn, async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT workspaceID, userID FROM `Team` WHERE groupID = ?",
            [req.params.groupID]
        )
        if (!rows.length) return res.redirect("/workspaces")
        if (Number(rows[0].userID) === Number(req.user.userID)) {
            return res.redirect(`/groups/${req.params.groupID}`)
        }
        await pool.query(
            "DELETE FROM User_Team WHERE groupID = ? AND userID = ? AND isOwner = 0",
            [req.params.groupID, req.user.userID]
        )
        return res.redirect(`/workspaces/${rows[0].workspaceID}`)
    } catch (err) {
        console.error(err)
        return res.status(500).send("Database error")
    }
})

router.post("/:groupID/members/:memberID/remove", mustBeLoggedIn, async (req, res) => {
    const { groupID, memberID } = req.params
    const back = (msg) => res.redirect(`/groups/${groupID}?message=${encodeURIComponent(msg)}`)
    try {
        const [groups] = await pool.query(
            "SELECT groupID FROM `Team` WHERE groupID = ? AND userID = ?",
            [groupID, req.user.userID]
        )
        if (!groups.length) return res.status(403).redirect("/workspaces")

        if (Number(memberID) === Number(req.user.userID)) {
            return back("The owner can't be removed from the group.")
        }

        const [result] = await pool.query(
            "DELETE FROM User_Team WHERE groupID = ? AND userID = ? AND isOwner = 0",
            [groupID, memberID]
        )
        return back(result.affectedRows ? "Member removed." : "That person is no longer in this group.")
    } catch (err) {
        console.error(err)
        return res.status(500).send("Database error")
    }
})

module.exports = router