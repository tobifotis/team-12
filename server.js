require("dotenv").config()
const express = require("express")
const cookieParser = require("cookie-parser")
const path = require("path")
const { attachUser } = require("./middleware/auth")
const pool = require("./config/db")

// mounting routes for server to use 
const authRoute = require("./auth")
const workRoute = require("./workspaces")
const groupRoute = require("./groups")
const profDetailRoute = require("./profile-details")
const skillsRoute = require("./skills-selection")
const profRoute = require("./profile")

const app = express()

app.set("views", path.join(__dirname, "views"))
app.set("view engine", "ejs")

// middleware
app.use(express.urlencoded({extended: false}))
app.use(express.json()) 
app.use(express.static(path.join(__dirname, "public")))
app.use(cookieParser())
app.use(attachUser)

app.get("/healthz", (req, res) => {
    res.status(200).send("OK")
})

// make user available to all ejs templates
app.use((req, res, next) => {
    res.locals.user = req.user || null
    next()
})

// middleware to set current page (used for header)
app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
});

// landing page - guests only, logged in users redirect to dashboard
app.get("/", (req, res) => {
    if (req.user) return res.redirect("/dashboard");
    res.render("Landing");
});

// availability routes
app.get("/availability", (req, res) => {
    if (!req.user) return res.redirect("/signin");
    res.render("WeeklyAvailability");
});

app.post("/availability", async (req, res) => {
    let connection

    try {
        const userId = req.user?.userID || req.user?.id

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            })
        }

        const days = [
            'Monday','Tuesday','Wednesday','Thursday',
            'Friday','Saturday','Sunday'
        ]

        const availability = []

        days.forEach(day => {
            const isAvailable = req.body[`available_${day}`] === "on"

            if (isAvailable) {
                const start = req.body[`start_${day}`]
                const end = req.body[`end_${day}`]

                if (start && end) {
                    availability.push({ day, start, end })
                }
            }
        })

        if (availability.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Select at least one valid time slot"
            })
        }

        connection = await pool.getConnection()
        await connection.beginTransaction()

        await connection.query(
            "DELETE FROM Availability WHERE userID = ?",
            [userId]
        )

        const insertQuery = `
            INSERT INTO Availability (userID, day, start, end)
            VALUES (?, ?, ?, ?)
        `

        for (const slot of availability) {
            await connection.query(insertQuery, [
                userId,
                slot.day,
                slot.start,
                slot.end
            ])
        }

        await connection.commit()

        return res.json({
            success: true,
            message: "Availability saved successfully"
        })

    } catch (err) {
        console.error(err)

        if (connection) await connection.rollback()

        return res.status(500).json({
            success: false,
            message: "Failed to save availability"
        })

    } finally {
        if (connection) connection.release()
    }
})

/* ---------------- ROUTES ---------------- */
app.use("/", authRoute)
app.use("/profile-details", profDetailRoute)
app.use("/skills-selection", skillsRoute)
app.use("/profile", profRoute)
app.use("/workspaces", workRoute)
app.use("/groups", groupRoute)

app.get("/dashboard", (req, res) => {
    if (!req.user) return res.redirect("/signin")
    res.redirect("/workspaces")
})

app.use((req, res) => res.status(404).send("404 - Page Not Found"));

// test database connection and start server
async function startServer() {
    try {
        await pool.query("SELECT 1")
        const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log(`Running on port ${PORT}`)
})
    } catch (err) {
        console.error("Could not connect to MySQL:", err.message)
        process.exit(1)
    }
}

startServer()
