# Real-Time Communication Web Application

A Computer Networks mini-project built with Node.js and Express. Real-time features (Socket.IO) and persistent storage (SQLite) will be added in later phases.

## Tech Stack

- Node.js
- Express
- HTML / CSS / JavaScript
- Socket.IO (planned)
- SQLite (planned)

## Project Structure

```
cn_project/
├── client/        # Frontend files (HTML, CSS, JS)
├── server/        # Backend code (Express server)
│   └── index.js
├── database/      # Database files and scripts (future phases)
├── docs/          # Project documentation
├── .env.example   # Sample environment variables
├── .gitignore
├── package.json
└── README.md
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows (Command Prompt): `copy .env.example .env`

3. Start the server:

   ```bash
   # Development (auto-restarts on changes)
   npm run dev

   # Production
   npm start
   ```

4. Open http://localhost:3000 in your browser.

## API Endpoints

| Method | Route         | Description         |
| ------ | ------------- | ------------------- |
| GET    | `/api/health` | Server health check |

## Project Phases

- [x] Phase 1: Initial setup
- [ ] Phase 2: Socket.IO real-time messaging
- [ ] Phase 3: SQLite database integration
- [ ] Phase 4: Final polish and documentation
