# Groupify 

Repository for **Team 12 Capstone Project**.

---

## Project Overview
**Project Name:** Group Formation App

**Product Name:** Groupify

**Group Name:** The Survivors

A website that enables users to create groups from a particular workspace, communicate, and manage tasks efficiently. The website supports user authentication, role-based access, workspace management, AI assisted member suggestions based on skills, group chat, and a task planner with comments.

This repository contains the source code, documentation, and resources for the Team 12 capstone project.  

---

## Key Features
- User login and signup
- Role-based access control
- Workspace creation and management
- User profiles
- Group creation and management
- AI assisted member suggestion
- Group chat
- Task planner

---

## Tech Stack
- Language(s): JavaScript (Node.js) 
- Frameworks/Libraries: Express.js, bcrypt, jsonwebtoken, cookie-parser
- Database: MySQL 
- Tools & Platforms: Node.js, npm, GitHub, MySQL

---

## Team Members

1. Oluwatobi Emmanuel
2. Gregory Oganesyan
3. Neevia Vinod
4. Leslie Thapa Magar
5. Saba Alhaidar

---

## Run Code on localhost

First:
- Create .env file with:
	- DB_HOST=localhost
	- DB_USER=root
	- DB_PASS=(your password used when downloading mysql)
	- DB_NAME=groupify
	- JWTSECRET=secret
- Make sure the file is in the root directory (not in any folder)

In Terminal:
  - npm install


Database Setup:

- Download mysql: https://dev.mysql.com/downloads/mysql/
- Open download and set up password
In Terminal:
	- mysql -u root -p (or /usr/local/mysql/bin/mysql -u root -p)
	- CREATE DATABASE IF NOT EXISTS groupify;
	- USE groupify;
	- SOURCE /yourPath/schema.sql;
	- SHOW TABLES;
	- exit

For an existing database created with the older group schema, run the migration before `001_workspace_teams.sql`:

	- SOURCE /yourPath/migrations/003_group_schema.sql;

Run this only when the database still has the `Group` and `User_Group` tables. Fresh databases should use `schema.sql` above and do not need this migration.

If you already ran an earlier version of `003_group_schema.sql` and joining a
group now returns `Database error`, check `User_Team` with `DESCRIBE User_Team;`.
If it is missing both `workspaceID` and `isOwner`, run
`migrations/005_user_team_workspace_columns.sql` once. The current
`003_group_schema.sql` adds these columns for future legacy upgrades.

For an existing database that does not yet have the workspace description column, run:

	- SOURCE /yourPath/migrations/002_workspace_description.sql;

Do not run this migration if `Workspace.description` already exists; fresh databases get it from `schema.sql`.

### Individual (private) messaging tables

Individual messaging needs two extra tables, which `schema.sql` does not create. Run these in order (both fresh and existing databases):

	- SOURCE /yourPath/migrations/010_private_messages.sql;
	- SOURCE /yourPath/migrations/011_cleanup_empty_private_conversations.sql;

`010` creates `PrivateConversation` and `PrivateMessage`. `011` removes empty conversations left over from earlier versions (it never deletes messages) and is safe to run on a database with none. Without `010`, starting a private conversation or sending a private message fails. The `CHECK` constraint in `010` is only enforced on MySQL 8.0.16+; older versions ignore it. After running them, restart the server and reload the Chat page.

- npm run dev
- Visit localhost:3000 on browser

## Cloudinary Setup
Cloud Name
	- On the Cloudinary Dashboard (homepage)
	- Copy your Cloud Name
API Key & API Secret
	- Go to Settings → API Keys
	- Copy:
		- API Key
		- API Secret
Add Environment Variables in .env file
	- CLOUDINARY_CLOUD_NAME=your_cloud_name
	- CLOUDINARY_API_KEY=your_api_key
	- CLOUDINARY_API_SECRET=your_api_secret

## License

This project is developed for academic purposes as part of a capstone requirement.
