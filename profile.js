const express = require("express")
const router = express.Router()
const multer = require("multer");
const streamifier = require("streamifier");
const cloudinary = require("./config/cloudinary");
const pool = require("./config/db")
const { mustBeLoggedIn } = require("./middleware/auth")

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

router.get("/", mustBeLoggedIn, (req, res) => {
  res.render("profile", {
    profileUser: req.user,
    isOwnProfile: true
  })
})

router.get("/edit", mustBeLoggedIn, (req, res) => {
  res.render("EditProfile")
})

router.get("/availability", mustBeLoggedIn, (req, res) => {
  res.render("WeeklyAvailability")
})

router.get("/data", mustBeLoggedIn, async (req, res) => {
  try {
    const userID = req.user.userID

    // get profile info
    const [profileRows] = await pool.query(
      `SELECT displayName, currentRole, organization, bio, profilePicture
       FROM user_profile
       WHERE userID = ?`,
      [userID]
    )

    // get skills
    const [skillRows] = await pool.query(
      `SELECT skills
       FROM skills
       WHERE userID = ?`,
      [userID]
    )

    // get availability
    const [availabilityRows] = await pool.query(
      `SELECT day, start, end
       FROM availability
       WHERE userID = ?`,
      [userID]
    )

    const profile = profileRows[0] || {}

    const skills = skillRows.map(row => row.skills)

    const availability = {}
    for (const row of availabilityRows) {
      availability[row.day] = [row.start, row.end]
    }

    res.json({
      displayName: profile.displayName || "",
      currentRole: profile.currentRole || "",
      organization: profile.organization || "",
      bio: profile.bio || "",
      skills,
      profilePicture: profile.profilePicture || "",
      availability
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Failed to fetch profile" })
  }
})

router.get("/:userID", mustBeLoggedIn, async (req, res) => {
  const profileUserID = Number(req.params.userID)
  if (!Number.isSafeInteger(profileUserID) || profileUserID < 1) {
    return res.status(400).send("Invalid user ID")
  }

  try {
    const [users] = await pool.query(
      "SELECT userID, username FROM User WHERE userID = ?",
      [profileUserID]
    )
    if (!users.length) return res.status(404).send("Profile not found")

    const profileUser = users[0]
    const isOwnProfile = Number(req.user.userID) === Number(profileUser.userID)
    if (isOwnProfile) return res.redirect("/profile")

    return res.render("profile", { profileUser, isOwnProfile })
  } catch (err) {
    console.error("Unable to load member profile:", err)
    return res.status(500).send("Unable to load profile")
  }
})

router.get("/:userID/data", mustBeLoggedIn, async (req, res) => {
  const profileUserID = Number(req.params.userID)
  if (!Number.isSafeInteger(profileUserID) || profileUserID < 1) {
    return res.status(400).json({ error: "Invalid user ID" })
  }

  try {
    const [users] = await pool.query(
      "SELECT userID, username FROM User WHERE userID = ?",
      [profileUserID]
    )
    if (!users.length) return res.status(404).json({ error: "Profile not found" })

    const [profileRows] = await pool.query(
      `SELECT displayName, currentRole, organization, bio, profilePicture
       FROM user_profile
       WHERE userID = ?`,
      [profileUserID]
    )
    const [skillRows] = await pool.query(
      "SELECT skills FROM skills WHERE userID = ?",
      [profileUserID]
    )

    const profile = profileRows[0] || {}
    return res.json({
      username: users[0].username,
      displayName: profile.displayName || "",
      currentRole: profile.currentRole || "",
      organization: profile.organization || "",
      bio: profile.bio || "",
      skills: skillRows.map(row => row.skills),
      profilePicture: profile.profilePicture || ""
    })
  } catch (err) {
    console.error("Unable to fetch member profile:", err)
    return res.status(500).json({ error: "Failed to fetch profile" })
  }
})

router.patch("/save", mustBeLoggedIn, async (req, res) => {
    const userID = req.user.userID
    const { displayName, currentRole, organization, bio } = req.body

    try {
        await pool.query(
            'UPDATE user_profile SET displayName = ?, currentRole = ?, organization = ?, bio = ? WHERE userID = ?',
            [displayName, currentRole, organization, bio, userID]
        )
        res.json({ message: "Profile updated successfully" })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: "Failed to update profile" })
    }
    

})

router.patch("/update-skills", mustBeLoggedIn, async (req, res) => {
    const userID = req.user.userID
    const { skills } = req.body

    if (!Array.isArray(skills)) {
      return res.status(400).json({ success: false, message: "Skills must be an array" })
    }

    try {
        // remove old skills first
        await pool.query(
            "DELETE FROM Skills WHERE userID = ?",
            [userID]
        );
        // insert new skills
        for (const skill of skills) {
            await pool.query(
                "INSERT INTO Skills (userID, skills) VALUES (?, ?)",
                [userID, skill]
            );
        }
        res.json({ success: true, message: "Skills updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Failed to update skills" });
    }
});

router.patch("/upload-picture", mustBeLoggedIn, upload.single("profilePicture"), async (req, res) => {
    const userID = req.user.userID;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file uploaded" });
      }

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

      await pool.query(
        "UPDATE user_profile SET profilePicture = ? WHERE userID = ?",
        [result.secure_url, userID]
      );

      res.json({
        message: "Profile picture updated successfully",
        profilePicture: result.secure_url,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update profile picture" });
    }
});


module.exports = router