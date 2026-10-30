const express = require("express")
const router = express.Router()
const pool = require("./config/db")
const { mustBeLoggedIn } = require("./middleware/auth")

const JOIN_MESSAGES = {
  requested: "Join Request Sent",
  joined: "You Joined The Group",
  approved: "Request Approved",
  denied: "Request Denied",
  already: "You Already Joined Or Requested This Group",
  inviteAccepted: "You Joined The Group",
  inviteDeclined: "Invitation Declined",
  error: "Something Went Wrong"
}

function backToJoin(res, workspaceID, code, groupName) {
  let url = `/workspaces/${workspaceID}/join-groups?m=${code}`
  if (groupName) url += `&g=${encodeURIComponent(groupName)}`
  return res.redirect(url)
}

router.get("/:workspaceID/join-groups", mustBeLoggedIn, async (req, res) => {
  const workspaceID = Number(req.params.workspaceID)
  const userID = req.user.userID
  try {
    const [membership] = await pool.query(
      "SELECT 1 FROM User_Workspace WHERE workspaceID = ? AND userID = ?", [workspaceID, userID])
    if (!membership.length) return res.status(403).redirect("/workspaces")

    const [workspaceRows] = await pool.query(
      "SELECT workspaceID, workspaceName, userID FROM Workspace WHERE workspaceID = ?", [workspaceID])

    const [invites] = await pool.query(
      `SELECT r.requestID AS id, t.groupName,
              COALESCE(NULLIF(TRIM(p.displayName), ''), u.username) AS requester
       FROM Team_Request r
       JOIN Team t ON t.groupID = r.groupID
       JOIN User u ON u.userID = r.userID
       LEFT JOIN User_Profile p ON p.userID = u.userID
       WHERE t.userID = ? AND t.workspaceID = ?
       ORDER BY r.createdAt`,
      [userID, workspaceID])

    const [publicGroups] = await pool.query(
      `SELECT t.groupID AS id, t.groupName AS name, t.ownerName AS owner, t.joinType,
              EXISTS(SELECT 1 FROM Team_Request r
                     WHERE r.groupID = t.groupID AND r.userID = ?) AS requested
       FROM Team t
       WHERE t.workspaceID = ? AND t.visibility = 'public'
         AND NOT EXISTS (SELECT 1 FROM User_Team ut
                         WHERE ut.groupID = t.groupID AND ut.userID = ?)
       ORDER BY t.groupName`,
      [userID, workspaceID, userID])

    const [groupInvites] = await pool.query(
      `SELECT t.groupID, t.groupName,
              COALESCE(NULLIF(TRIM(p.displayName), ''), u.username) AS inviter
       FROM Group_Invite i
       JOIN Team t ON t.groupID = i.groupID
       JOIN User u ON u.userID = i.invitedBy
       LEFT JOIN User_Profile p ON p.userID = u.userID
       WHERE i.invitedUserID = ? AND t.workspaceID = ? AND i.status = 'pending'
       ORDER BY i.createdAt`,
      [userID, workspaceID])

    let message = JOIN_MESSAGES[req.query.m] || ""
    const joinedName = typeof req.query.g === "string" ? req.query.g.slice(0, 100) : ""
    if ((req.query.m === "inviteAccepted" || req.query.m === "joined") && joinedName) {
      message = `You Joined ${joinedName}`
    }

    res.render("JoinGroup", {
      isWorkspaceOwner: Number(workspaceRows[0].userID) === Number(userID),
      workspace: workspaceRows[0],
      invites,
      groupInvites,
      publicGroups,
      message
    })
  } catch (err) {
    console.error(err)
    res.status(500).send("Database error")
  }
})

router.post("/:workspaceID/join-groups/:groupID", mustBeLoggedIn, async (req, res) => {
  const workspaceID = Number(req.params.workspaceID)
  const groupID = Number(req.params.groupID)
  const userID = req.user.userID
  try {
    const [membership] = await pool.query(
      "SELECT 1 FROM User_Workspace WHERE workspaceID = ? AND userID = ?", [workspaceID, userID])
    if (!membership.length) return res.status(403).redirect("/workspaces")

    const [groups] = await pool.query(
      "SELECT groupID, groupName, joinType FROM Team WHERE groupID = ? AND workspaceID = ? AND visibility = 'public'",
      [groupID, workspaceID])
    if (!groups.length) return backToJoin(res, workspaceID, "error")

    const [already] = await pool.query(
      "SELECT 1 FROM User_Team WHERE groupID = ? AND userID = ?", [groupID, userID])
    if (already.length) return backToJoin(res, workspaceID, "already")

    if (groups[0].joinType === "open") {
      await pool.query(
        "INSERT INTO User_Team (userID, workspaceID, groupID, isOwner) VALUES (?, ?, ?, 0)",
        [userID, workspaceID, groupID])
      return backToJoin(res, workspaceID, "joined", groups[0].groupName)
    }

    await pool.query(
      "INSERT IGNORE INTO Team_Request (groupID, workspaceID, userID) VALUES (?, ?, ?)",
      [groupID, workspaceID, userID])
    return backToJoin(res, workspaceID, "requested")
  } catch (err) {
    console.error(err)
    return backToJoin(res, workspaceID, "error")
  }
})

router.post("/:workspaceID/join-groups/requests/:requestID/approve", mustBeLoggedIn, async (req, res) => {
  const workspaceID = Number(req.params.workspaceID)
  const requestID = Number(req.params.requestID)
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [rows] = await connection.query(
      `SELECT r.userID, r.groupID FROM Team_Request r
       JOIN Team t ON t.groupID = r.groupID
       WHERE r.requestID = ? AND t.userID = ? AND t.workspaceID = ?
       FOR UPDATE`,
      [requestID, req.user.userID, workspaceID])
    if (!rows.length) {
      await connection.rollback()
      return backToJoin(res, workspaceID, "error")
    }

    const [stillMember] = await connection.query(
      "SELECT 1 FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
      [workspaceID, rows[0].userID])
    if (!stillMember.length) {
      await connection.query("DELETE FROM Team_Request WHERE requestID = ?", [requestID])
      await connection.commit()
      return backToJoin(res, workspaceID, "error")
    }

    await connection.query(
      `INSERT INTO User_Team (userID, workspaceID, groupID, isOwner)
       SELECT ?, ?, ?, 0 FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM User_Team WHERE userID = ? AND groupID = ?)`,
      [rows[0].userID, workspaceID, rows[0].groupID, rows[0].userID, rows[0].groupID])
    await connection.query("DELETE FROM Team_Request WHERE requestID = ?", [requestID])

    await connection.commit()
    return backToJoin(res, workspaceID, "approved")
  } catch (err) {
    if (connection) await connection.rollback()
    console.error(err)
    return backToJoin(res, workspaceID, "error")
  } finally {
    if (connection) connection.release()
  }
})

router.post("/:workspaceID/join-groups/requests/:requestID/deny", mustBeLoggedIn, async (req, res) => {
  const workspaceID = Number(req.params.workspaceID)
  try {
    await pool.query(
      `DELETE r FROM Team_Request r
       JOIN Team t ON t.groupID = r.groupID
       WHERE r.requestID = ? AND t.userID = ? AND t.workspaceID = ?`,
      [Number(req.params.requestID), req.user.userID, workspaceID])
    return backToJoin(res, workspaceID, "denied")
  } catch (err) {
    console.error(err)
    return backToJoin(res, workspaceID, "error")
  }
})

router.post("/:workspaceID/groups/:groupID/invite", mustBeLoggedIn, async (req, res) => {
  const workspaceID = Number(req.params.workspaceID)
  const groupID = Number(req.params.groupID)
  const inviteeID = Number(req.body.userID)
  const userID = req.user.userID
  try {
    const [groups] = await pool.query(
      "SELECT groupID FROM Team WHERE groupID = ? AND workspaceID = ? AND userID = ?",
      [groupID, workspaceID, userID])
    if (!groups.length) return res.status(403).json({ success: false, message: "You can only invite people to groups you created." })

    if (!Number.isInteger(inviteeID) || inviteeID === Number(userID)) {
      return res.json({ success: false, message: "You can't invite that user." })
    }

    const [inWorkspace] = await pool.query(
      "SELECT 1 FROM User_Workspace WHERE workspaceID = ? AND userID = ?", [workspaceID, inviteeID])
    if (!inWorkspace.length) return res.json({ success: false, message: "That user isn't in this workspace." })

    const [alreadyMember] = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(p.displayName), ''), u.username) AS name
       FROM User_Team ut
       JOIN User u ON u.userID = ut.userID
       LEFT JOIN User_Profile p ON p.userID = u.userID
       WHERE ut.groupID = ? AND ut.userID = ?`,
      [groupID, inviteeID])
    if (alreadyMember.length) return res.json({ success: false, message: `${alreadyMember[0].name} is Already in This Group` })

    await pool.query(
      `INSERT INTO Group_Invite (groupID, invitedBy, invitedUserID) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = 'pending', invitedBy = VALUES(invitedBy), createdAt = CURRENT_TIMESTAMP`,
      [groupID, userID, inviteeID])
    return res.json({ success: true, message: "Invitation sent." })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, message: "Something went wrong." })
  }
})

router.post("/:workspaceID/join-groups/invites/:groupID/accept", mustBeLoggedIn, async (req, res) => {
  const workspaceID = Number(req.params.workspaceID)
  const groupID = Number(req.params.groupID)
  const userID = req.user.userID
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [rows] = await connection.query(
      `SELECT i.groupID, t.groupName FROM Group_Invite i
       JOIN Team t ON t.groupID = i.groupID
       WHERE i.groupID = ? AND i.invitedUserID = ? AND t.workspaceID = ? AND i.status = 'pending'
       FOR UPDATE`,
      [groupID, userID, workspaceID])
    if (!rows.length) {
      await connection.rollback()
      return backToJoin(res, workspaceID, "error")
    }

    const [stillMember] = await connection.query(
      "SELECT 1 FROM User_Workspace WHERE workspaceID = ? AND userID = ?",
      [workspaceID, userID])
    if (!stillMember.length) {
      await connection.rollback()
      return res.status(403).redirect("/workspaces")
    }

    await connection.query(
      `INSERT INTO User_Team (userID, workspaceID, groupID, isOwner)
       SELECT ?, ?, ?, 0 FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM User_Team WHERE userID = ? AND groupID = ?)`,
      [userID, workspaceID, groupID, userID, groupID])
    await connection.query(
      "DELETE FROM Group_Invite WHERE groupID = ? AND invitedUserID = ?", [groupID, userID])

    await connection.commit()
    return backToJoin(res, workspaceID, "inviteAccepted", rows[0].groupName)
  } catch (err) {
    if (connection) await connection.rollback()
    console.error(err)
    return backToJoin(res, workspaceID, "error")
  } finally {
    if (connection) connection.release()
  }
})

router.post("/:workspaceID/join-groups/invites/:groupID/decline", mustBeLoggedIn, async (req, res) => {
  const workspaceID = Number(req.params.workspaceID)
  try {
    await pool.query(
      `DELETE i FROM Group_Invite i
       JOIN Team t ON t.groupID = i.groupID
       WHERE i.groupID = ? AND i.invitedUserID = ? AND t.workspaceID = ?`,
      [Number(req.params.groupID), req.user.userID, workspaceID])
    return backToJoin(res, workspaceID, "inviteDeclined")
  } catch (err) {
    console.error(err)
    return backToJoin(res, workspaceID, "error")
  }
})

module.exports = router