require("dotenv").config()
const express = require("express")
const cookieParser = require("cookie-parser")
const path = require("path")
const { attachUser } = require("./middleware/auth")
const { mustBeGuest } = require("./middleware/auth")
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
    res.redirect("/workspaces");
});

// mounted route files
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
        app.listen(3000, () => console.log("Running on http://localhost:3000"))
    } catch (err) {
        console.error("Could not connect to MySQL:", err.message)
        process.exit(1)
    }
}

startServer()
