# The Project Management web app

## Business Requirements

This project is building a Project Management App. Key features:
- People can create an account, sign in and out, change their password, and delete their account
- Each user has any number of Kanban boards (create, rename, switch, delete)
- Each user organizes the boards they can access into their own named groups: boards start in the DEFAULT group, groups can be created and renamed, boards are moved between groups by dragging, and groups collapse and expand with a click
- The owner can share a board with other users by username; members can edit it and leave it, only the owner can rename, delete or manage members. Concurrent edits never silently overwrite each other (a stale save is rejected and the client reloads), and shared boards pick up teammates' changes while idle
- Columns can be added, renamed and deleted
- Cards can be added, moved with drag and drop, edited (in a card dialog) and deleted; a card has a title, details, an optional priority (low / medium / high), due date and assignee (a board member), labels, and a checklist
- Cards can be searched (title, details, labels) and filtered by priority and assignee; the board header shows done, overdue and open high-priority counts (the last column counts as done)
- There is an AI chat feature in a sidebar; the AI can create / edit / move cards and columns on the current board

## Limitations

The demo account `user` / `password` is seeded with a sample board.

Members have equal edit rights (no read-only role). There is no real-time push; shared boards poll every 10 seconds while idle.

This runs locally (in a docker container).

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use Claude for the AI calls via the Claude Code CLI (`claude -p`) authenticated with the user's Claude subscription. A CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) is in .env in the project root
- Use the subscription's default Claude model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.