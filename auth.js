const express = require("express")
const bcrypt = require("bcrypt")
const router = express.Router()
const pool = require("./config/db")
const jwt = require("jsonwebtoken")

//block logged in users from visiting authentication pages uses middleware function must be guest
const { mustBeGuest} = require("./middleware/auth")

router.get("/signin", mustBeGuest, (req, res) => {
    res.render("SignIn", { errors: [] });
})

router.get("/signup", mustBeGuest, (req, res) => {
    res.render("SignUp", { errors: [] });
})


// registration route
router.post("/signup", async (req, res) => {
    const errors = []

    let { username, email, password } = req.body

    if (typeof username !== "string") username = ""
    if (typeof email !== "string") email = ""
    if (typeof password !== "string") password = ""

    username = username.trim()
    email = email.trim().toLowerCase()

    if (!username) errors.push("Username is required!")
    if (username.length < 3) errors.push("Username must be at least 3 characters")
    if (username.length > 15) errors.push("Username cannot exceed 15 characters")
    if (!username.match(/^[a-zA-Z0-9]+$/)) errors.push("Username can only contain letters and numbers")

    if (!email) errors.push("Email is required!")
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push("Enter a valid email")
    }
    if (!password) errors.push("Password is required!")
    if (password.length < 8) errors.push("Password must be at least 8 characters")

    // check if email or username already exists in database
    try {
        const [emailRows] = await pool.query(
            "SELECT * FROM User WHERE email = ?", 
            [email]
        )
        if (emailRows.length) errors.push("Email already in use!")

        const [userRows] = await pool.query(
            "SELECT * FROM User WHERE username = ?", 
            [username]
        )
        if (userRows.length) errors.push("Username already in use!")

    } 
    catch (err) {
        console.error(err)
        return res.send("Database error")
    }

    if (errors.length) {
        return res.render("SignUp", { errors })
    }

    // hash password with bcrypt
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)



    const [result] = await pool.query(
    "INSERT INTO User (username, email, password) VALUES (?, ?, ?)",
    [username, email, hashedPassword]
    )

    const newUserID = result.insertId

    const tokenVal = jwt.sign(
        { userID: newUserID, username },
        process.env.JWTSECRET,
        { expiresIn: "1d" }
    )

    res.cookie("GROUPIFY", tokenVal, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 24
    })

    res.redirect("/skills-selection")
})

// signin route
router.post("/signin", async (req, res) => {

    // user can log in with either username or email, + password
    const { userOrEmail, password } = req.body;

    try {
        // find user using email OR username
        const [rows] = await pool.query(
            "SELECT * FROM User WHERE email = ? OR username = ?",
            [userOrEmail, userOrEmail]
        );

        if (!rows.length) {
            return res.render("SignIn", { errors: ["Invalid credentials"] });
        }

        const user = rows[0]

        // compare password with hashed password in database
        const match = await bcrypt.compare(password, user.password)

        if (!match) {
            return res.render("SignIn", { errors: ["Invalid credentials"] })
        }

        // create jwt token that expires in a day
        const tokenVal = jwt.sign(
            {
                userID: user.userID,
                username: user.username
            },
            process.env.JWTSECRET,
            { expiresIn: "1d" }
        )

        // set cookie with token
        res.cookie("GROUPIFY", tokenVal, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            maxAge: 1000 * 60 * 60 * 24
        })

        res.redirect("/dashboard")
    } catch (err) {
        console.error(err)
        res.send("Sign In error")
    }
})

router.get("/logout", (req, res) => {
  res.clearCookie("GROUPIFY");
  res.redirect("/");
});

module.exports = router;
