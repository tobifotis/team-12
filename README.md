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
