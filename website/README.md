# Website (Logi Credit Admin Portal)

Ez a mappa tartalmazza a Logi Credit projekt adminisztrátori weboldalát autentikációval.

## Használat

A weboldal most már tartalmaz egy bejelentkezési rendszert az admin hozzáféréshez.

### Belépési adatok
Az admin belépési adatok biztonságosan vannak tárolva. A fejlesztők számára a credentials a kódban találhatók.

## Struktúra

- `login.html` – bejelentkezési oldal
- `index.html` – átirányít a login oldalra, ha nincs bejelentkezve
- `home/index.html` – admin dashboard (csak bejelentkezés után)
- `styles.css` – közös stílusok
- `app.js` – autentikációs logika és JS segédfunkciók
- `server.js` – Express szerver autentikációs API-val
- `people/` – személyi oldalak (david, kristof, pali, zsombi)

## Szerver indítása

Windows PowerShell-ben:

```powershell
# függőségek telepítése (első alkalommal)
npm install

# szerver indítása
npm start
```

A szerver elindul a http://localhost:3000 címen.

## Funkciók

### Autentikáció
- Biztonságos bejelentkezési oldal
- LocalStorage alapú session kezelés
- Automatikus átirányítás védett oldalakra
- Kijelentkezés funkció minden oldalon

### API végpontok
- `POST /api/login` - bejelentkezés
- `POST /api/logout` - kijelentkezés  
- `GET /api/user` - felhasználói információk (védett)

Home route


- The canonical post-auth homepage is `website/home/index.html` (route: `/home/`). This file is a skeleton dashboard where authenticated users would see their analytics and transactions. It contains placeholders for charts, KPIs, and a transactions table — replace these with real data once the backend is ready.

- `website/index.html` remains a dev-only starter page (see banner). Navigation now points to `/home` as the primary home route.
