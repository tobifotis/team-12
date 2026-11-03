const jwt = require("jsonwebtoken");
const pool = require("../config/db");

// middleware to attach user info to req.user if logged in, if not set to null
async function attachUser(req, res, next) {
    const token = req.cookies.GROUPIFY;
    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWTSECRET);
        req.user = {
            userID: decoded.userID,
            username: decoded.username
        };

        // fetch profile picture
        try {
            const [profileRows] = await pool.query(
                "SELECT profilePicture FROM User_Profile WHERE userID = ?",
                [decoded.userID]
            );
            if (profileRows.length > 0) {
                req.user.profilePicture = profileRows[0].profilePicture;
            }
        } catch (err) {
            console.error("Error fetching profile picture:", err);
        }
    } catch (err) {
        req.user = null;
    }
    next();
}

// mustBeGuest middleware blocks logged in users from visiting authentication pages
function mustBeGuest(req, res, next) {
    if (req.user) return res.redirect("/dashboard");
    next();
}

// mustBeLoggedIn middleware blocks non-logged in users from visiting certain pages
function mustBeLoggedIn(req, res, next) {
    if (!req.user) {
        return res.redirect("/signin");
    }
    next();
}

module.exports = {
    attachUser,
    mustBeGuest,
    mustBeLoggedIn
};
