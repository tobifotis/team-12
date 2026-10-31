USE groupify;

-- One row per pair of users. userOneID is always the smaller ID so (A,B) and (B,A) map to the same row.
CREATE TABLE IF NOT EXISTS PrivateConversation (
    conversationID  INT AUTO_INCREMENT PRIMARY KEY,
    userOneID       INT NOT NULL,
    userTwoID       INT NOT NULL,
    createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lastActivityAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_private_pair (userOneID, userTwoID),
    CONSTRAINT chk_private_order CHECK (userOneID < userTwoID),
    FOREIGN KEY (userOneID) REFERENCES User(userID) ON DELETE CASCADE,
    FOREIGN KEY (userTwoID) REFERENCES User(userID) ON DELETE CASCADE,
    INDEX idx_private_user_two (userTwoID)
);

CREATE TABLE IF NOT EXISTS PrivateMessage (
    messageID       INT AUTO_INCREMENT PRIMARY KEY,
    conversationID  INT NOT NULL,
    senderID        INT NOT NULL,
    content         TEXT NOT NULL,
    createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversationID) REFERENCES PrivateConversation(conversationID) ON DELETE CASCADE,
    FOREIGN KEY (senderID) REFERENCES User(userID) ON DELETE CASCADE,
    INDEX idx_private_message_conv (conversationID, messageID)
);
