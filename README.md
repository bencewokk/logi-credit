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

Render.com (static site) — recommended

- Service type: Static Site
- Build Command: npm install
- Publish Directory: website

Render.com (Web Service) — if you need a Node process

- Build Command: npm install
- Start Command: npm run start:render

Notes

- The repo includes a `start:render` npm script which runs `npx serve website -l $PORT` so Render will bind to the correct port.
- Alternatively you can add a Dockerfile if you want full control.
