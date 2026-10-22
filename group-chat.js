const express = require("express")
const jwt = require("jsonwebtoken")
const pool = require("./config/db")
const { mustBeLoggedIn } = require("./middleware/auth")

const router = express.Router()
const MAX_MESSAGE_LENGTH = 2000

function parseGroupID(value) {
    if (!/^[1-9]\d*$/.test(String(value))) return null
    const groupID = Number(value)
    return Number.isSafeInteger(groupID) && groupID > 0 ? groupID : null
}

async function getGroupAccess(groupID, userID) {
    const [rows] = await pool.query(
        `SELECT g.groupID, g.groupName, g.workspaceID
         FROM \`Team\` g
         JOIN User_Team ut ON ut.groupID = g.groupID AND ut.userID = ?
         WHERE g.groupID = ?`,
        [userID, groupID]
    )
    return rows[0] || null
}

router.get("/:groupID/chat", mustBeLoggedIn, async (req, res) => {
    const groupID = parseGroupID(req.params.groupID)
    if (!groupID) return res.status(400).send("Invalid group ID")

    try {
        const group = await getGroupAccess(groupID, req.user.userID)
        if (!group) return res.status(403).redirect("/workspaces")

        const [conversations] = await pool.query(
            `SELECT g.groupID, g.groupName
             FROM User_Team ut
             JOIN \`Team\` g ON g.groupID = ut.groupID
             WHERE ut.userID = ?
             ORDER BY g.groupName, g.groupID`,
            [req.user.userID]
        )

        return res.render("GroupChat", {
            group,
            conversations,
            currentUserID: req.user.userID,
            chatPage: true
        })
    } catch (err) {
        console.error("Unable to load group chat:", err)
        return res.status(500).send("Unable to load chat")
    }
})

router.get("/:groupID/chat/messages", mustBeLoggedIn, async (req, res) => {
    const groupID = parseGroupID(req.params.groupID)
    if (!groupID) {
        return res.status(400).json({ success: false, message: "Invalid group ID" })
    }

    try {
        const group = await getGroupAccess(groupID, req.user.userID)
        if (!group) {
            return res.status(403).json({ success: false, message: "You are not a member of this group" })
        }

        const [messages] = await pool.query(
            `SELECT gc.messageID, gc.userID, u.username AS senderName,
                    up.profilePicture, gc.content, gc.timestamp
             FROM Groupchat gc
             JOIN User u ON u.userID = gc.userID
             LEFT JOIN User_Profile up ON up.userID = u.userID
             WHERE gc.groupID = ?
             ORDER BY gc.messageID DESC
             LIMIT 200`,
            [groupID]
        )

        return res.json({ success: true, messages: messages.reverse() })
    } catch (err) {
        console.error("Unable to load group messages:", err)
        return res.status(500).json({ success: false, message: "Unable to load messages" })
    }
})

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

function attachGroupChatSockets(io) {
    io.use((socket, next) => {
        const token = parseCookie(socket.handshake.headers.cookie, "GROUPIFY")
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
        const joinedGroups = new Set()
        socket.join(`user:${userID}`)

        socket.on("group:join", async (payload, ack) => {
            const groupID = parseGroupID(payload?.groupID)
            if (!groupID) {
                return sendAck(ack, { success: false, message: "Invalid group ID" })
            }

            try {
                const group = await getGroupAccess(groupID, userID)
                if (!group) {
                    return sendAck(ack, { success: false, message: "You are not a member of this group" })
                }
                joinedGroups.add(groupID)
                return sendAck(ack, { success: true })
            } catch (err) {
                console.error("Unable to authorize group chat connection:", err)
                return sendAck(ack, { success: false, message: "Unable to connect to this group chat" })
            }
        })

        socket.on("group:message", async (payload, ack) => {
            const groupID = parseGroupID(payload?.groupID)
            const content = typeof payload?.content === "string" ? payload.content.trim() : ""
            if (!groupID || !joinedGroups.has(groupID)) {
                return sendAck(ack, { success: false, message: "Join this group chat before sending messages" })
            }
            if (!content) {
                return sendAck(ack, { success: false, message: "Enter a message before sending" })
            }
            if (content.length > MAX_MESSAGE_LENGTH) {
                return sendAck(ack, { success: false, message: "Messages must be 2000 characters or fewer" })
            }

            try {
                const [members] = await pool.query(
                    `SELECT u.userID, u.username AS senderName, up.profilePicture
                     FROM User_Team ut
                     JOIN User u ON u.userID = ut.userID
                     LEFT JOIN User_Profile up ON up.userID = u.userID
                     WHERE ut.groupID = ?`,
                    [groupID]
                )
                const sender = members.find(member => Number(member.userID) === userID)
                if (!sender) {
                    joinedGroups.delete(groupID)
                    return sendAck(ack, { success: false, message: "You are no longer a member of this group" })
                }

                const [result] = await pool.query(
                    `INSERT INTO Groupchat (senderName, userID, content, groupID, workspaceID)
                     VALUES (?, ?, ?, ?, NULL)`,
                    [sender.senderName, userID, content, groupID]
                )
                const [savedRows] = await pool.query(
                    "SELECT timestamp FROM Groupchat WHERE messageID = ?",
                    [result.insertId]
                )
                const message = {
                    messageID: result.insertId,
                    groupID,
                    userID,
                    senderName: sender.senderName,
                    profilePicture: sender.profilePicture,
                    content,
                    timestamp: savedRows[0].timestamp
                }

                members.forEach(member => {
                    io.to(`user:${member.userID}`).emit("group:message", message)
                })
                return sendAck(ack, { success: true })
            } catch (err) {
                console.error("Unable to send group message:", err)
                return sendAck(ack, { success: false, message: "Unable to send message. Please try again." })
            }
        })
    })
}

module.exports = { router, attachGroupChatSockets }
