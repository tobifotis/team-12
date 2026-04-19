const express = require("express")
const bcrypt = require("bcrypt")
const router = express.Router()
const pool = require("./config/db")
const jwt = require("jsonwebtoken")

// For Forgot Password Functionality
const { isEmpty } = require('./utils/object_isEmpty');
const { FORGOT_PASSWORD_MODEL, RESET_PASSWORD_MODEL } = require('./validation_models/user');
const nodemailer = require('nodemailer');

//block logged in users from visiting authentication pages uses middleware function must be guest
const { mustBeGuest} = require("./middleware/auth")

router.get("/signin", mustBeGuest, (req, res) => {
    res.render("SignIn", { errors: [] });
})

router.get("/signup", mustBeGuest, (req, res) => {
    res.render("SignUp", { errors: [] });
})

// forgot password page
router.get("/forgot-password", mustBeGuest, (req, res) => {
    res.render("ForgotPassword", { errors: [] });
});

// reset password page
router.get("/reset-password", mustBeGuest, (req, res) => {
    const email = req.query.email || req.cookies.resetEmail || "";
    if (!email) {
        return res.redirect("/forgot-password");
    }
    res.render("ResetPassword", { errors: [], email: email });
});

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
    const profilePicture = "https://res.cloudinary.com/dv8cbso62/image/upload/v1775672475/groupify/profile-pictures/kka0hc3m1zzhr8olulb5.jpg"

    await pool.query(
        "INSERT INTO user_profile (userID, profilePicture) VALUES (?, ?)",
        [newUserID, profilePicture]
    )

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

    res.redirect("/profile-details")
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

/* forgot password and reset password */

router.post("/forgot-password", async (req, res) => {
    const errors = [];
    
    //Check the form data is found or not. utils/object_isEmpty.js being used
    if (isEmpty(req.body)) {
        errors.push("Email is required");
        return res.render("ForgotPassword", { errors });
    }
    
    //Check the form data is valid or not. Using user.js from validation_models folder
    const { error } = FORGOT_PASSWORD_MODEL.validate(req.body);
    
    if (error) {
        errors.push(error.details[0].message);
        return res.render("ForgotPassword", { errors });
    }
    
    const email = req.body.email;
    
    try {
        // Check if user exists
        const [rows] = await pool.query(
            "SELECT * FROM User WHERE email = ?",
            [email]
        );
        
        // random number generation for OTP. will expire in 10 min
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        const otpExpire = new Date();
        otpExpire.setMinutes(otpExpire.getMinutes() + 10);
        
        await pool.query("UPDATE User SET otp = ?, otpExpire = ? WHERE email = ?", [otp, otpExpire, email]);
        
        // nodemailer to send email
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: 
            {
                user: 'groupifya@gmail.com',
                pass: 'ovyh yiea lyhz mspj',
            }
        });
        
        await transporter.sendMail({
            from: 'groupifya@gmail.com',
            to: email,
            subject: 'Groupify: Password Reset OTP',
            text: `Your OTP is: ${otp}\n\nExpires in 10 minutes.`
        });
        
        // cookie, email is sent to reset password page
        res.cookie("resetEmail", email, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            maxAge: 1000 * 60 * 15
        });
        
        res.redirect("/reset-password");
        
    } catch (err) {
        console.error("Forgot password error:", err);
        errors.push("Failed to send OTP. Please try again.");
        res.render("ForgotPassword", { errors });
    }
});

// reset password
router.post("/reset-password", async (req, res) => 
    {
    const errors = [];
    //cookie retrieved
    const email = req.cookies.resetEmail || "";
    
    if (!email) 
    {
        return res.redirect("/forgot-password");
    }

    if (isEmpty(req.body)) {
        errors.push("Form data not found");
        return res.render("ResetPassword", { errors, email });
    }
    
    try {
        // Check the form data is valid or not. Using user.js from validation_models folder
        const { error } = RESET_PASSWORD_MODEL.validate(req.body);
        if (error) {
            errors.push(error.details[0].message);
            return res.render("ResetPassword", { errors, email });
        }
    
        const otp = req.body.otp;
        const password = req.body.password;
        const confirmPassword = req.body.confirmPassword;
    
        if (password !== confirmPassword) {
            errors.push("Passwords do not match");
            return res.render("ResetPassword", { errors, email });
        }

        const [rows] = await pool.query("SELECT * FROM User WHERE email = ? AND otp = ? AND otpExpire > NOW()", [email, otp]);
        
        if (rows.length === 0) {
            errors.push("Invalid or expired OTP");
            return res.render("ResetPassword", { errors, email });
        }
        
        // encryption
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // database update
        await pool.query("UPDATE User SET password = ?, otp = NULL, otpExpire = NULL WHERE email = ?", [hashedPassword, email]);
        
        res.clearCookie("resetEmail");
        res.redirect("/signin");
        
    } 
    catch (err) 
    {
        console.error("Reset password error:", err);
        errors.push("Failed to reset password. Please try again.");
        res.render("ResetPassword", { errors, email });
    }
});

module.exports = router;
