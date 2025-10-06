# logi-credit

A small project workspace for the Logi Credit team. Below are team responsibilities and a starter website everyone can edit.

Team responsibilities

- zsombi — frontend (HTML / UI)
- david — auth (login / registration)
- pali — analytics / reporting
- kristof — transactions / validation

Team rules

- Everyone must work in Python for code changes. Use a local virtual environment inside your folder (see per-folder READMEs).
- Don't edit other people's top-level folders unless you've coordinated in a PR.

Website starter

See the `website/` folder for a tiny static site you can open in a browser or run locally with npm.

Quick local run (Windows PowerShell):

```powershell
# install dependencies once (fetches lite-server)
npm install

# start a tiny dev server that serves the website/ folder
npm start
```

Render.com (static site)

- Service type: Static Site
- Build Command: npm install
- Publish Directory: website
- Optional: use `npm run start:static` locally if you want to mirror the static-only serving behaviour (no API routes).

Render.com (Web Service) — recommended for API access

- Build Command: npm install
- Start Command: npm run start:render
- This command launches the Express server (`website/server.js`), so `/api/login`, `/api/logout`, and `/api/user` are available in production.

Notes

- The `start:static` npm script runs `npx serve website -l $PORT` if you only need static hosting without the API.
- Alternatively you can add a Dockerfile if you want full control.
