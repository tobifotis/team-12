
const express = require("express")
const jwt = require("jsonwebtoken")
const pool = require("./config/db")
const { mustBeLoggedIn } = require("./middleware/auth")

const router = express.Router()
const MAX_MESSAGE_LENGTH = 2000

function parseWorkspaceID(value) {
    if (!/^[1-9]\d*$/.test(String(value))) return null
    const workspaceID = Number(value)
    return Number.isSafeInteger(workspaceID) && workspaceID > 0
        ? workspaceID
        : null
}

// Check whether the user belongs to the workspace.
async function getWorkspaceAccess(workspaceID, userID) {
    const [rows] = await pool.query(
        `SELECT w.workspaceID, w.workspaceName, w.userID AS ownerID
         FROM Workspace w
         JOIN User_Workspace uw
           ON uw.workspaceID = w.workspaceID
          AND uw.userID = ?
         WHERE w.workspaceID = ?`,
        [userID, workspaceID]
    )

    return rows[0] || null
}

// Render the workspace chat page.
router.get("/:workspaceID/chat", mustBeLoggedIn, async (req, res) => {
    const workspaceID = parseWorkspaceID(req.params.workspaceID)
    if (!workspaceID) return res.status(400).send("Invalid workspace ID")

    try {
        const workspace = await getWorkspaceAccess(
            workspaceID,
            req.user.userID
        )

        if (!workspace) return res.status(403).redirect("/workspaces")

        const [conversations] = await pool.query(
            `SELECT w.workspaceID, w.workspaceName
             FROM User_Workspace uw
             JOIN Workspace w ON w.workspaceID = uw.workspaceID
             WHERE uw.userID = ?
             ORDER BY w.workspaceName, w.workspaceID`,
            [req.user.userID]
        )

        return res.render("WorkspaceChat", {
            workspace,
            conversations,
            currentUserID: req.user.userID,
            chatPage: true
        })
    } catch (err) {
        console.error("Unable to load workspace chat:", err)
        return res.status(500).send("Unable to load workspace chat")
    }
})

// Load workspace message history.
router.get("/:workspaceID/chat/messages", mustBeLoggedIn, async (req, res) => {
    const workspaceID = parseWorkspaceID(req.params.workspaceID)

    if (!workspaceID) {
        return res.status(400).json({
            success: false,
            message: "Invalid workspace ID"
        })
    }

    try {
        const workspace = await getWorkspaceAccess(
            workspaceID,
            req.user.userID
        )

        if (!workspace) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this workspace"
            })
        }

        const [messages] = await pool.query(
            `SELECT gc.messageID, gc.userID,
                    u.username AS senderName,
                    up.profilePicture,
                    gc.content, gc.timestamp
             FROM Groupchat gc
             JOIN User u ON u.userID = gc.userID
             LEFT JOIN User_Profile up ON up.userID = u.userID
             WHERE gc.workspaceID = ?
             ORDER BY gc.messageID DESC
             LIMIT 200`,
            [workspaceID]
        )

        return res.json({
            success: true,
            messages: messages.reverse()
        })
    } catch (err) {
        console.error("Unable to load workspace messages:", err)
        return res.status(500).json({
            success: false,
            message: "Unable to load messages"
        })
    }
})

 // Get members of the current workspace for the Individual tab.
router.get("/:workspaceID/chat/members", mustBeLoggedIn, async (req, res) => {
    const workspaceID = parseWorkspaceID(req.params.workspaceID);

    if (!workspaceID) {
        return res.status(400).json({
            success: false,
            message: "Invalid workspace ID"
        });
    }

    try {
        // Make sure the current user belongs to this workspace.
        const workspace = await getWorkspaceAccess(
            workspaceID,
            req.user.userID
        );

        if (!workspace) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this workspace"
            });
        }

        // Get the other members of this workspace.
        const [members] = await pool.query(
            `SELECT u.userID, u.username, up.profilePicture
             FROM User_Workspace uw
             JOIN User u ON u.userID = uw.userID
             LEFT JOIN User_Profile up ON up.userID = u.userID
             WHERE uw.workspaceID = ?
               AND uw.userID <> ?
             ORDER BY u.username ASC`,
            [workspaceID, req.user.userID]
        );

        return res.json({
            success: true,
            members
        });
    } catch (err) {
        console.error("Unable to load workspace members:", err);

        return res.status(500).json({
            success: false,
            message: "Unable to load workspace members"
        });
    }
});

function parseCookie(header, name) {
    const cookie = header
        ?.split(";")
        .map(part => part.trim())
        .find(part => part.startsWith(`${name}=`))

    if (!cookie) return null

    try {
        return decodeURIComponent(cookie.slice(name.length + 1))
    } catch {
        return null
    }
}

function sendAck(ack, result) {
    if (typeof ack === "function") ack(result)
}

// Real-time workspace chat.
function attachWorkspaceChatSockets(io) {
    io.use((socket, next) => {
        const token = parseCookie(
            socket.handshake.headers.cookie,
            "GROUPIFY"
        )

        if (!token) return next(new Error("Unauthorized"))

        try {
            const decoded = jwt.verify(token, process.env.JWTSECRET)
            const userID = Number(decoded.userID)

            if (!Number.isSafeInteger(userID) || userID < 1) {
                return next(new Error("Unauthorized"))
            }

            socket.data.userID = userID
            return next()
        } catch {
            return next(new Error("Unauthorized"))
        }
    })

    io.on("connection", socket => {
        const userID = socket.data.userID
        const joinedWorkspaces = new Set()

        socket.join(`user:${userID}`)

        socket.on("workspace:join", async (payload, ack) => {
            const workspaceID = parseWorkspaceID(payload?.workspaceID)

            if (!workspaceID) {
                return sendAck(ack, {
                    success: false,
                    message: "Invalid workspace ID"
                })
            }

            try {
                const workspace = await getWorkspaceAccess(
                    workspaceID,
                    userID
                )

                if (!workspace) {
                    return sendAck(ack, {
                        success: false,
                        message: "You are not a member of this workspace"
                    })
                }

                joinedWorkspaces.add(workspaceID)

                return sendAck(ack, { success: true })
            } catch (err) {
                console.error("Unable to authorize workspace chat:", err)

                return sendAck(ack, {
                    success: false,
                    message: "Unable to connect to workspace chat"
                })
            }
        })

        socket.on("workspace:message", async (payload, ack) => {
            const workspaceID = parseWorkspaceID(payload?.workspaceID)
            const content = typeof payload?.content === "string"
                ? payload.content.trim()
                : ""

            if (!workspaceID || !joinedWorkspaces.has(workspaceID)) {
                return sendAck(ack, {
                    success: false,
                    message: "Join this workspace chat before sending messages"
                })
            }

            if (!content) {
                return sendAck(ack, {
                    success: false,
                    message: "Enter a message before sending"
                })
            }

            if (content.length > MAX_MESSAGE_LENGTH) {
                return sendAck(ack, {
                    success: false,
                    message: "Messages must be 2000 characters or fewer"
                })
            }

            try {
                // Recheck membership when sending a message.
                const [members] = await pool.query(
                    `SELECT u.userID, u.username AS senderName,
                            up.profilePicture
                     FROM User_Workspace uw
                     JOIN User u ON u.userID = uw.userID
                     LEFT JOIN User_Profile up ON up.userID = u.userID
                     WHERE uw.workspaceID = ?`,
                    [workspaceID]
                )

                const sender = members.find(
                    member => Number(member.userID) === userID
                )

                if (!sender) {
                    joinedWorkspaces.delete(workspaceID)

                    return sendAck(ack, {
                        success: false,
                        message: "You are no longer a member of this workspace"
                    })
                }

                const [result] = await pool.query(
                    `INSERT INTO Groupchat
                        (senderName, userID, content, groupID, workspaceID)
                     VALUES (?, ?, ?, NULL, ?)`,
                    [sender.senderName, userID, content, workspaceID]
                )

                const [savedRows] = await pool.query(
                    "SELECT timestamp FROM Groupchat WHERE messageID = ?",
                    [result.insertId]
                )

                const message = {
                    messageID: result.insertId,
                    workspaceID,
                    userID,
                    senderName: sender.senderName,
                    profilePicture: sender.profilePicture,
                    content,
                    timestamp: savedRows[0].timestamp
                }

                members.forEach(member => {
                    io.to(`user:${member.userID}`).emit(
                        "workspace:message",
                        message
                    )
                })

                return sendAck(ack, { success: true })
            } catch (err) {
                console.error("Unable to send workspace message:", err)

                return sendAck(ack, {
                    success: false,
                    message: "Unable to send message. Please try again."
                })
            }
        })
    })
}

module.exports = {
    router,
    attachWorkspaceChatSockets
}
