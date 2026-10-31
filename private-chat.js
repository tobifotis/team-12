const express = require("express")
const pool = require("./config/db")

const router = express.Router()
const MAX_MESSAGE_LENGTH = 2000

function parseID(value) {
    if (!/^[1-9]\d*$/.test(String(value))) return null
    const id = Number(value)
    return Number.isSafeInteger(id) ? id : null
}

function requireUser(req, res, next) {
    if (!req.user) return res.status(401).json({ success: false, message: "Please sign in again" })
    next()
}

function pairOf(a, b) {
    return a < b ? [a, b] : [b, a]
}

// returns the conversation only if userID is one of its two participants
async function getConversationForUser(conversationID, userID) {
    const [rows] = await pool.query(
        `SELECT conversationID, userOneID, userTwoID
         FROM PrivateConversation
         WHERE conversationID = ? AND (userOneID = ? OR userTwoID = ?)`,
        [conversationID, userID, userID]
    )
    return rows[0] || null
}

async function getUserSummary(userID) {
    const [rows] = await pool.query(
        `SELECT u.userID, u.username, up.displayName, up.profilePicture
         FROM User u
         LEFT JOIN User_Profile up ON up.userID = u.userID
         WHERE u.userID = ?`,
        [userID]
    )
    return rows[0] || null
}

router.use(requireUser)

router.get("/conversations", async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT pc.conversationID, pc.lastActivityAt,
                    u.userID AS otherUserID, u.username, up.displayName, up.profilePicture,
                    (SELECT pm.content FROM PrivateMessage pm
                      WHERE pm.conversationID = pc.conversationID
                      ORDER BY pm.messageID DESC LIMIT 1) AS lastMessage
             FROM PrivateConversation pc
             JOIN User u ON u.userID = IF(pc.userOneID = ?, pc.userTwoID, pc.userOneID)
             LEFT JOIN User_Profile up ON up.userID = u.userID
             WHERE (pc.userOneID = ? OR pc.userTwoID = ?)
               AND EXISTS (SELECT 1 FROM PrivateMessage m WHERE m.conversationID = pc.conversationID)
             ORDER BY pc.lastActivityAt DESC, pc.conversationID DESC`,
            [req.user.userID, req.user.userID, req.user.userID]
        )
        return res.json({ success: true, conversations: rows })
    } catch (err) {
        console.error("Unable to load private conversations:", err)
        return res.status(500).json({ success: false, message: "Unable to load conversations" })
    }
})

router.get("/users", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : ""
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`

    try {
        const [rows] = await pool.query(
            `SELECT u.userID, u.username, up.displayName, up.profilePicture
             FROM User u
             LEFT JOIN User_Profile up ON up.userID = u.userID
             WHERE u.userID <> ?
               AND (? = '' OR u.username LIKE ? OR up.displayName LIKE ?)
             ORDER BY COALESCE(NULLIF(up.displayName, ''), u.username), u.userID
             LIMIT 30`,
            [req.user.userID, q, like, like]
        )
        return res.json({ success: true, users: rows })
    } catch (err) {
        console.error("Unable to search users:", err)
        return res.status(500).json({ success: false, message: "Unable to search users" })
    }
})

// Read-only: looks up the other user and any existing conversation. Nothing is created here;
// the conversation row is created when the first message is sent.
router.get("/with/:userID", async (req, res) => {
    const otherID = parseID(req.params.userID)
    const me = Number(req.user.userID)
    if (!otherID) return res.status(400).json({ success: false, message: "Invalid user" })
    if (otherID === me) {
        return res.status(400).json({ success: false, message: "You cannot message yourself" })
    }

    try {
        const other = await getUserSummary(otherID)
        if (!other) return res.status(404).json({ success: false, message: "User not found" })

        const [one, two] = pairOf(me, otherID)
        const [rows] = await pool.query(
            `SELECT conversationID FROM PrivateConversation WHERE userOneID = ? AND userTwoID = ?`,
            [one, two]
        )
        return res.json({
            success: true,
            conversationID: rows[0]?.conversationID || null,
            user: {
                userID: other.userID,
                username: other.username,
                displayName: other.displayName,
                profilePicture: other.profilePicture
            }
        })
    } catch (err) {
        console.error("Unable to open private conversation:", err)
        return res.status(500).json({ success: false, message: "Unable to open conversation" })
    }
})

router.get("/conversations/:conversationID/messages", async (req, res) => {
    const conversationID = parseID(req.params.conversationID)
    if (!conversationID) return res.status(400).json({ success: false, message: "Invalid conversation" })

    try {
        const conversation = await getConversationForUser(conversationID, req.user.userID)
        if (!conversation) {
            return res.status(403).json({ success: false, message: "You are not part of this conversation" })
        }

        const [messages] = await pool.query(
            `SELECT pm.messageID, pm.conversationID, pm.senderID AS userID, u.username AS senderName,
                    up.profilePicture, pm.content, pm.createdAt AS timestamp
             FROM PrivateMessage pm
             JOIN User u ON u.userID = pm.senderID
             LEFT JOIN User_Profile up ON up.userID = u.userID
             WHERE pm.conversationID = ?
             ORDER BY pm.messageID DESC
             LIMIT 200`,
            [conversationID]
        )
        return res.json({ success: true, messages: messages.reverse() })
    } catch (err) {
        console.error("Unable to load private messages:", err)
        return res.status(500).json({ success: false, message: "Unable to load messages" })
    }
})

function sendAck(ack, result) {
    if (typeof ack === "function") ack(result)
}

// relies on the authentication middleware registered by attachGroupChatSockets (socket.data.userID)
function attachPrivateChatSockets(io) {
    io.on("connection", socket => {
        const userID = socket.data.userID
        if (!userID) return

        socket.on("private:message", async (payload, ack) => {
            let conversationID = parseID(payload?.conversationID)
            const recipientID = parseID(payload?.recipientID)
            const content = typeof payload?.content === "string" ? payload.content.trim() : ""
            if (!conversationID && !recipientID) {
                return sendAck(ack, { success: false, message: "Invalid conversation" })
            }
            if (!conversationID && recipientID === userID) {
                return sendAck(ack, { success: false, message: "You cannot message yourself" })
            }
            if (!content) return sendAck(ack, { success: false, message: "Enter a message before sending" })
            if (content.length > MAX_MESSAGE_LENGTH) {
                return sendAck(ack, { success: false, message: "Messages must be 2000 characters or fewer" })
            }

            try {
                if (!conversationID) {
                    if (!(await getUserSummary(recipientID))) {
                        return sendAck(ack, { success: false, message: "User not found" })
                    }
                    // the unique pair key makes this race-safe and reuses any existing conversation
                    const [one, two] = pairOf(userID, recipientID)
                    await pool.query(
                        "INSERT IGNORE INTO PrivateConversation (userOneID, userTwoID) VALUES (?, ?)",
                        [one, two]
                    )
                    const [found] = await pool.query(
                        "SELECT conversationID FROM PrivateConversation WHERE userOneID = ? AND userTwoID = ?",
                        [one, two]
                    )
                    conversationID = found[0].conversationID
                }

                const conversation = await getConversationForUser(conversationID, userID)
                if (!conversation) {
                    return sendAck(ack, { success: false, message: "You are not part of this conversation" })
                }

                const [result] = await pool.query(
                    "INSERT INTO PrivateMessage (conversationID, senderID, content) VALUES (?, ?, ?)",
                    [conversationID, userID, content]
                )
                await pool.query(
                    "UPDATE PrivateConversation SET lastActivityAt = CURRENT_TIMESTAMP WHERE conversationID = ?",
                    [conversationID]
                )
                const [saved] = await pool.query(
                    `SELECT pm.createdAt AS timestamp, u.username AS senderName, up.profilePicture
                     FROM PrivateMessage pm
                     JOIN User u ON u.userID = pm.senderID
                     LEFT JOIN User_Profile up ON up.userID = u.userID
                     WHERE pm.messageID = ?`,
                    [result.insertId]
                )
                const message = {
                    messageID: result.insertId,
                    conversationID,
                    userID,
                    senderName: saved[0].senderName,
                    profilePicture: saved[0].profilePicture,
                    content,
                    timestamp: saved[0].timestamp
                }

                // only the two participants' personal rooms receive the message
                const [one, two] = [conversation.userOneID, conversation.userTwoID]
                io.to(`user:${one}`).to(`user:${two}`).emit("private:message", message)
                const otherID = conversation.userOneID === userID ? conversation.userTwoID : conversation.userOneID
                const other = await getUserSummary(otherID)
                return sendAck(ack, {
                    success: true,
                    message,
                    conversation: {
                        conversationID,
                        lastActivityAt: message.timestamp,
                        otherUserID: other.userID,
                        username: other.username,
                        displayName: other.displayName,
                        profilePicture: other.profilePicture,
                        lastMessage: content
                    }
                })
            } catch (err) {
                console.error("Unable to send private message:", err)
                return sendAck(ack, { success: false, message: "Unable to send message. Please try again." })
            }
        })
    })
}

module.exports = { router, attachPrivateChatSockets }
