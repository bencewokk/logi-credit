# Website (starter site)

This folder contains a very small static starter website for the Logi Credit project.

How to use

- Note: `website/index.html` is a dev-only, team starter page and may be replaced — treat it as scaffolding for development rather than a production homepage.
- Each team member has a personal page under `website/people/` to add notes and prototype UI. The `people/` pages are the canonical area for individual work and small prototypes.

Structure

- `index.html` – homepage and quick links
- `styles.css` – shared styles
- `app.js` – tiny JS helpers
- `people/` – per-person starter pages

Additions

If you'd like, you can run a tiny local server with npm and `lite-server` to get live reload while you edit.

Quick run (Windows PowerShell):

```powershell
# install dev dependencies once
npm install

# start the dev server from project root
npm start
```

The server will serve the `website/` folder and usually opens a browser at http://localhost:3000.

Home route


- The canonical post-auth homepage is `website/home/index.html` (route: `/home/`). This file is a skeleton dashboard where authenticated users would see their analytics and transactions. It contains placeholders for charts, KPIs, and a transactions table — replace these with real data once the backend is ready.

- `website/index.html` remains a dev-only starter page (see banner). Navigation now points to `/home` as the primary home route.
