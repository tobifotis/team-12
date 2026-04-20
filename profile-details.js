const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const pool = require("./config/db");
const { mustBeLoggedIn } = require("./middleware/auth");
const multer = require("multer");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

router.get("/", mustBeLoggedIn, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT * FROM User_Profile WHERE userID = ?`,
            [req.user.userID]
        );

        const profile = rows[0] || null;

        res.render("ProfileDetails", { profile, errors: [] });
    } catch (err) {
        console.error(err);
        res.status(500).send("Database error");
    }
});

router.post("/save-profile", mustBeLoggedIn, upload.single("profilePicture"), async (req, res) => {
    const { displayName, currentRole, organization, bio} = req.body;
    const userID = req.user.userID;

    try {
      let profilePicture = null;
      if (req.file) {
        const uploadFromBuffer = () =>
          new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: "groupify/profile-pictures",
                resource_type: "image",
              },
              (error, result) => {
                if (error) return reject(error);
                resolve(result);
              }
            );

            streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
          });

        const result = await uploadFromBuffer();
        profilePicture = result.secure_url;
      }
      // check if profile exists
      const [rows] = await pool.query(
        "SELECT profileID FROM User_Profile WHERE userID = ?",
        [userID]
      );

        if (rows.length > 0) {
            if (profilePicture) {
                await pool.query(
                    `UPDATE User_Profile 
                     SET displayName=?, currentRole=?, organization=?, bio=?, profilePicture=?
                     WHERE userID=?`,
                    [displayName, currentRole, organization, bio, profilePicture, userID]
                );
            } else {
                await pool.query(
                    `UPDATE User_Profile 
                     SET displayName=?, currentRole=?, organization=?, bio=?
                     WHERE userID=?`,
                    [displayName, currentRole, organization, bio, userID]
                );
            }
        } else {
            await pool.query(
                `INSERT INTO User_Profile 
                 (userID, displayName, currentRole, organization, bio, profilePicture)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.userID, displayName, currentRole, organization, bio, profilePicture]
            );
        }

        res.redirect("/skills-selection");

    } catch (err) {
        console.error(err);
        res.render("ProfileDetails", {
            errors: ["Could not save profile"],
            profile: req.body
        });
    }
});


module.exports = router;