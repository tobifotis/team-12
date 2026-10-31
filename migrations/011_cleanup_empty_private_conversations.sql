USE groupify;

-- Conversations are now created on the first sent message; remove empty ones created by earlier behavior.
DELETE pc FROM PrivateConversation pc
WHERE NOT EXISTS (SELECT 1 FROM PrivateMessage pm WHERE pm.conversationID = pc.conversationID);
