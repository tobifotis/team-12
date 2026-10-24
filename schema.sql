
CREATE DATABASE IF NOT EXISTS groupify;
USE groupify;
 
/*
User table stores registered users. username and email are unique
*/
CREATE TABLE IF NOT EXISTS User (
    userID      INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(100) NOT NULL UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    otp         VARCHAR(10) DEFAULT NULL,
    otpExpire   DATETIME DEFAULT NULL
);

/*
Skills Table stores the Skills entered by each user
*/
CREATE TABLE IF NOT EXISTS Skills (
    ID        INT AUTO_INCREMENT PRIMARY KEY,
    userID    INT NOT NULL,
    skills    VARCHAR(100) NOT NULL,
    FOREIGN KEY (userID) REFERENCES User(userID) ON DELETE CASCADE
);
 
/*
Workspace table stores workspaces created by users
*/
CREATE TABLE IF NOT EXISTS Workspace (
    workspaceID     INT AUTO_INCREMENT PRIMARY KEY,
    workspaceName   VARCHAR(100) NOT NULL,
    ownerName       VARCHAR(100) NOT NULL,
    userID          INT NOT NULL,
    joinCode        VARCHAR(20) NOT NULL UNIQUE,
    createdAt       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userID) REFERENCES User(userID) ON DELETE CASCADE
);
 
/*
User_Workspace junction table for the many to many relationship between user and workspace
*/
CREATE TABLE IF NOT EXISTS User_Workspace (
    userID          INT NOT NULL,
    workspaceID     INT NOT NULL,
    isOwner         BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (userID, workspaceID),
    FOREIGN KEY (userID)      REFERENCES User(userID)      ON DELETE CASCADE,
    FOREIGN KEY (workspaceID) REFERENCES Workspace(workspaceID) ON DELETE CASCADE
);
 
/*
Team table stores groups created within a workspace.
*/
CREATE TABLE IF NOT EXISTS `Team` (
    groupID     INT AUTO_INCREMENT PRIMARY KEY,
    groupName   VARCHAR(100) NOT NULL,
    description TEXT,
    ownerName   VARCHAR(100) NOT NULL,
    userID      INT NOT NULL,
    workspaceID INT NOT NULL,
    visibility  VARCHAR(100) NOT NULL,
    joinType    VARCHAR(100) NOT NULL,
    createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userID)      REFERENCES User(userID)          ON DELETE CASCADE,
    FOREIGN KEY (workspaceID) REFERENCES Workspace(workspaceID) ON DELETE CASCADE
);
 
/*
User_Team junction table for the many to many relationship between user and team.
*/
CREATE TABLE IF NOT EXISTS User_Team (
    userID      INT NOT NULL,
    workspaceID INT NOT NULL,
    groupID     INT NOT NULL,
    isOwner     VARCHAR(100) NOT NULL DEFAULT 'false',
    PRIMARY KEY (userID, workspaceID, groupID),
    FOREIGN KEY (userID)      REFERENCES User(userID)          ON DELETE CASCADE,
    FOREIGN KEY (workspaceID) REFERENCES Workspace(workspaceID) ON DELETE CASCADE,
    FOREIGN KEY (groupID)     REFERENCES `Team`(groupID)      ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Group_Invite (
    groupID       INT NOT NULL,
    invitedBy     INT NOT NULL,
    invitedUserID INT NOT NULL,
    status        ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (groupID, invitedUserID),
    FOREIGN KEY (groupID) REFERENCES `Team`(groupID) ON DELETE CASCADE,
    FOREIGN KEY (invitedBy) REFERENCES User(userID) ON DELETE CASCADE,
    FOREIGN KEY (invitedUserID) REFERENCES User(userID) ON DELETE CASCADE
);
 
/*
AI_Suggestion table that holds AI-generated suggestions for group formation
*/
CREATE TABLE IF NOT EXISTS AI_Suggestion (
    suggestionID        INT AUTO_INCREMENT PRIMARY KEY,
    workspaceID         INT NOT NULL,
    generatedAt         DATETIME DEFAULT CURRENT_TIMESTAMP,
    algorithmVersion    VARCHAR(20),
    FOREIGN KEY (workspaceID) REFERENCES Workspace(workspaceID) ON DELETE CASCADE
);
 
/*
User_Profile table that holds a user's profile information
*/
CREATE TABLE IF NOT EXISTS User_Profile (
    profileID       INT AUTO_INCREMENT PRIMARY KEY,
    userID          INT NOT NULL UNIQUE,
    suggestionID    INT,
    availability    VARCHAR(255),
    personalityType VARCHAR(100),
    skills          TEXT,
    FOREIGN KEY (userID)       REFERENCES User(userID)             ON DELETE CASCADE,
    FOREIGN KEY (suggestionID) REFERENCES AI_Suggestion(suggestionID) ON DELETE SET NULL
);
 
/*
Groupchat table for either a group or workspace
*/
CREATE TABLE IF NOT EXISTS Groupchat (
    messageID   INT AUTO_INCREMENT PRIMARY KEY,
    senderName  VARCHAR(100) NOT NULL,
    userID      INT NOT NULL,
    content     TEXT NOT NULL,
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
    groupID     INT,
    workspaceID INT,
    FOREIGN KEY (userID)      REFERENCES User(userID)          ON DELETE CASCADE,
    FOREIGN KEY (groupID)     REFERENCES `Team`(groupID)      ON DELETE CASCADE,
    FOREIGN KEY (workspaceID) REFERENCES Workspace(workspaceID) ON DELETE CASCADE
);
 
/*
Tasks table that holds tasks created within a planning section of a group. assignedTo is nullable because a task may not be assigned to anyone yet
*/
CREATE TABLE IF NOT EXISTS Tasks (
    taskID      INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(100) NOT NULL,
    description TEXT,
    assignedTo  INT,
    status      ENUM('To Do', 'In Progress', 'Done') NOT NULL DEFAULT 'To Do',
    groupID     INT NOT NULL,
    createdBy   INT NOT NULL,
    createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    dueDate     DATETIME,
    sortOrder   INT NOT NULL DEFAULT 0,
    FOREIGN KEY (assignedTo) REFERENCES User(userID)     ON DELETE SET NULL,
    FOREIGN KEY (groupID)    REFERENCES `Team`(groupID) ON DELETE CASCADE,
    FOREIGN KEY (createdBy)  REFERENCES User(userID)     ON DELETE CASCADE
);

ALTER TABLE user_profile ADD COLUMN displayName VARCHAR(100);
ALTER TABLE user_profile ADD COLUMN currentRole VARCHAR(100);
ALTER TABLE user_profile ADD COLUMN organization VARCHAR(100);
ALTER TABLE user_profile ADD COLUMN bio VARCHAR(255);
 ALTER TABLE user_profile DROP COLUMN availability;
ALTER TABLE user_profile DROP COLUMN skills;
ALTER TABLE user_profile DROP COLUMN personalityType;
ALTER TABLE user_profile ADD COLUMN profilePicture VARCHAR(255);
ALTER TABLE Workspace ADD COLUMN description VARCHAR(500);

CREATE TABLE IF NOT EXISTS Availability (
    ID        INT AUTO_INCREMENT PRIMARY KEY,
    userID    INT NOT NULL,
    day    VARCHAR(100) NOT NULL,
    start TIME NOT NULL,
    end TIME NOT NULL,
    FOREIGN KEY (userID) REFERENCES User(userID) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS common_skills (
    skillID INT AUTO_INCREMENT PRIMARY KEY,
    skill VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS Team_Request (
    requestID   INT AUTO_INCREMENT PRIMARY KEY,
    groupID     INT NOT NULL,
    workspaceID INT NOT NULL,
    userID      INT NOT NULL,
    createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_request (groupID, userID),
    FOREIGN KEY (groupID)     REFERENCES `Team`(groupID)          ON DELETE CASCADE,
    FOREIGN KEY (workspaceID) REFERENCES Workspace(workspaceID)   ON DELETE CASCADE,
    FOREIGN KEY (userID)      REFERENCES User(userID)             ON DELETE CASCADE
);

/*Individual Messages in groups and workspaces*/
CREATE TABLE IF NOT EXISTS DirectMessage (
    messageID   INT AUTO_INCREMENT PRIMARY KEY,

    workspaceID INT NOT NULL,
    groupID     INT NULL,

    senderID    INT NOT NULL,
    recipientID INT NOT NULL,
    content     TEXT NOT NULL,

    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (workspaceID)
        REFERENCES Workspace(workspaceID)
        ON DELETE CASCADE,

    FOREIGN KEY (groupID)
        REFERENCES `Team`(groupID)
        ON DELETE CASCADE,

    FOREIGN KEY (senderID)
        REFERENCES User(userID)
        ON DELETE CASCADE,

    FOREIGN KEY (recipientID)
        REFERENCES User(userID)
        ON DELETE CASCADE
);