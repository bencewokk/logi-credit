# Google OAuth Bejelentkezés - Gyors Áttekintés

## ✅ Mit csináltam?

Beépítettem a **Google OAuth 2.0 bejelentkezést** a Logi Credit autentikációs rendszerbe (david package).

## 📦 Új Fájlok

### Python (david package):
1. **`david/src/david/google_auth.py`** - Google OAuth implementáció
   - `GoogleAuthProvider` osztály
   - Token exchange és user info lekérés
   - Integráció az `AuthService`-szel
   
2. **`david/tests/test_google_auth.py`** - Unit tesztek
   - Mock implementáció a teszteléshez
   - Új és létező userek tesztelése
   
3. **`david/README.google_oauth.md`** - Részletes dokumentáció
   - Google Cloud Console beállítás
   - Környezeti változók
   - Használati példák

### Node.js (website):
1. **`website/server.js`** - Frissített Google OAuth támogatással
   - `/api/auth/google/url` - Authorization URL generálás
   - `/auth/google/callback` - OAuth callback kezelés
   - Session-based authentication
   
2. **`website/login.html`** - Google bejelentkezés gomb
   - Google branding és ikon
   - Divider az email/jelszó login és Google login között

### Konfiguráció:
1. **`.env.example`** - Környezeti változók sablon
2. **`setup-google-oauth.ps1`** - PowerShell setup szkript
3. **`package.json`** - Frissítve axios függőséggel

## 🚀 Hogyan Indítsd El?

### 1. Google Cloud Console Beállítás

1. Menj a https://console.cloud.google.com/
2. Hozz létre új projektet vagy használj meglévőt
3. **APIs & Services > Credentials**
4. Hozz létre **OAuth 2.0 Client ID**-t
5. Authorized redirect URI: `http://localhost:3000/auth/google/callback`
6. Másold ki a **Client ID** és **Client Secret**-et

### 2. Környezeti Változók Beállítása

**Opció A: Automatikus setup (ajánlott)**
```powershell
.\setup-google-oauth.ps1
```

**Opció B: Manuális**
```powershell
# Másold a template-et
Copy-Item .env.example .env

# Szerkeszd meg a .env fájlt és add meg:
# GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=your-client-secret
```

### 3. Node.js Függőségek Telepítése

```powershell
npm install
```

Ez telepíti:
- `express` - Web szerver
- `axios` - HTTP kliens Google API-hoz

### 4. Szerver Indítása

```powershell
npm start
```

Vagy környezeti változókkal:
```powershell
$env:GOOGLE_CLIENT_ID="your-id"
$env:GOOGLE_CLIENT_SECRET="your-secret"
node website/server.js
```

### 5. Használat

1. Nyisd meg: http://localhost:3000/login.html
2. Kattints a **"Bejelentkezés Google-lal"** gombra
3. Válaszd ki a Google fiókodat
4. Engedélyezd a hozzáférést
5. Automatikus redirect a home oldalra ✅

## 🎯 Funkciók

### Python Oldal (david package):
- ✅ Google OAuth 2.0 flow implementáció
- ✅ Authorization URL generálás
- ✅ Token exchange (code -> access_token)
- ✅ User info lekérés Google-tól
- ✅ Új user automatikus létrehozása
- ✅ Létező user bejelentkeztetése
- ✅ Username collision kezelés
- ✅ Email verification check
- ✅ Metadata tárolás (google_id, picture, stb.)
- ✅ Access token + refresh token generálás

### Node.js Oldal (website):
- ✅ Google OAuth authorization URL endpoint
- ✅ OAuth callback handling
- ✅ Session management (in-memory)
- ✅ Token-based authentication
- ✅ User profile storage (email, name, picture)

### Frontend:
- ✅ Google Sign-In gomb (hivatalos branding)
- ✅ Divider "vagy" szöveg
- ✅ Error handling és üzenetek
- ✅ Redirect kezelés
- ✅ Token tárolás localStorage-ban

## 📚 Fájlok Strukturája

```
logi-credit/
├── david/
│   ├── src/david/
│   │   ├── google_auth.py        ✨ ÚJ - Google OAuth
│   │   ├── auth.py                🔄 Frissítve (User model)
│   │   └── __init__.py            🔄 Google export
│   ├── tests/
│   │   └── test_google_auth.py    ✨ ÚJ - Tesztek
│   ├── README.md                  🔄 Frissítve
│   └── README.google_oauth.md     ✨ ÚJ - Dokumentáció
│
├── website/
│   ├── server.js                  🔄 Google OAuth endpoints
│   ├── login.html                 🔄 Google gomb
│   └── ...
│
├── .env.example                   ✨ ÚJ - Config sablon
├── setup-google-oauth.ps1         ✨ ÚJ - Setup szkript
└── package.json                   🔄 axios hozzáadva
```

## 🔐 Biztonsági Megjegyzések

### Development (OK):
- ✅ `http://localhost:3000` használható
- ✅ In-memory session storage
- ✅ Környezeti változók PowerShell-ben

### Production (TODO):
- ⚠️ **HTTPS kötelező!**
- ⚠️ `.env` fájl ne kerüljön Git-be (már `.gitignore`-ban van)
- ⚠️ Session storage: Redis vagy adatbázis
- ⚠️ State parameter CSRF védelemhez
- ⚠️ Rate limiting
- ⚠️ Token expiration & refresh logic

## 🧪 Tesztelés

### Python tesztek:
```powershell
cd david
pytest tests/test_google_auth.py -v
```

### Manuális teszt:
1. Indítsd el a szervert: `npm start`
2. Nyisd meg: http://localhost:3000/login.html
3. Google bejelentkezés tesztelése

### API teszt:
```powershell
# Authorization URL lekérés
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/google/url" -Method Get
```

## 📖 További Dokumentáció

- **Részletes setup**: `david/README.google_oauth.md`
- **Python API**: `david/src/david/google_auth.py` (docstringek)
- **Node.js server**: `website/server.js` (inline comments)

## 🎓 Python Használat (Példa)

```python
from david import GoogleAuthProvider, AuthService, InMemoryUserRepository
import os

# Setup
repo = InMemoryUserRepository()
auth = AuthService(repo)

google_auth = GoogleAuthProvider(
    auth_service=auth,
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET')
)

# Generate auth URL
auth_url = google_auth.get_authorization_url()
print(f"Redirect user to: {auth_url}")

# After callback:
# result = google_auth.authenticate_with_code(code)
# print(f"User: {result.username}")
# print(f"Token: {result.access_token}")
```

## 🐛 Hibaelhárítás

### "redirect_uri_mismatch"
→ Ellenőrizd a Google Console-ban beállított redirect URI-t

### "invalid_client"
→ Rossz Client ID vagy Secret

### "access_denied"
→ User visszautasította az engedélyt

### npm not found
→ Telepítsd a Node.js-t: https://nodejs.org/

## ✨ Következő Lépések (Optional)

- [ ] State parameter CSRF védelem
- [ ] Refresh token kezelés
- [ ] Profile picture megjelenítés
- [ ] Account linking (több provider)
- [ ] Perzisztens session storage
- [ ] Admin dashboard Google profilképpel

---

**Készült**: 2025-10-14
**Készítette**: David (autentikáció felelős)
**Státusz**: ✅ Ready for Testing
