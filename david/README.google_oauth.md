# Google OAuth Bejelentkezés Beállítása

Ez a dokumentáció leírja, hogyan kell beállítani a Google OAuth 2.0 bejelentkezést a Logi Credit rendszerhez.

## 1. Google Cloud Console Beállítások

### 1.1 Projekt létrehozása
1. Menj a [Google Cloud Console](https://console.cloud.google.com/)-ra
2. Hozz létre egy új projektet vagy válassz ki egy meglévőt
3. Név: "Logi Credit" vagy tetszőleges név

### 1.2 OAuth Consent Screen beállítása
1. Menj a **APIs & Services > OAuth consent screen** menüponthoz
2. Válaszd ki a **External** felhasználói típust (később publikálhatod)
3. Töltsd ki az alapinformációkat:
   - **App name**: Logi Credit
   - **User support email**: A te email címed
   - **Developer contact**: A te email címed
4. **Scopes**: Add hozzá az alábbi scope-okat:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
5. Mentsd el

### 1.3 OAuth Credentials létrehozása
1. Menj a **APIs & Services > Credentials** menüponthoz
2. Kattints a **+ CREATE CREDENTIALS** gombra
3. Válaszd ki az **OAuth 2.0 Client ID** opciót
4. Application type: **Web application**
5. Name: "Logi Credit Web Client"
6. **Authorized redirect URIs**:
   - Development: `http://localhost:3000/auth/google/callback`
   - Production: `https://your-domain.com/auth/google/callback`
7. Kattints a **CREATE** gombra
8. **FONTOS**: Másold ki a **Client ID**-t és a **Client Secret**-et!

## 2. Környezeti Változók Beállítása

### 2.1 Node.js szerver (website/server.js)

Hozz létre egy `.env` fájlt a projekt gyökerében:

```bash
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
PORT=3000
```

**Vagy** Windows PowerShell-ben:
```powershell
$env:GOOGLE_CLIENT_ID="your-client-id-here.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET="your-client-secret-here"
$env:GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"
```

### 2.2 Python használat (opcionális)

Ha Python-ból is használni szeretnéd:

```python
from david import GoogleAuthProvider, AuthService, InMemoryUserRepository

# Környezeti változók
import os
client_id = os.getenv('GOOGLE_CLIENT_ID', 'your-client-id')
client_secret = os.getenv('GOOGLE_CLIENT_SECRET', 'your-client-secret')

# AuthService inicializálás
repo = InMemoryUserRepository()
auth_service = AuthService(repo)

# Google Auth Provider
google_auth = GoogleAuthProvider(
    auth_service=auth_service,
    client_id=client_id,
    client_secret=client_secret,
    redirect_uri='http://localhost:3000/auth/google/callback'
)

# Authorization URL generálás
auth_url = google_auth.get_authorization_url()
print(f"Redirect user to: {auth_url}")

# Callback után - code exchange
# (Ezt a web szerver hívja meg)
try:
    login_result = google_auth.authenticate_with_code(auth_code)
    print(f"User logged in: {login_result.username}")
    print(f"Access token: {login_result.access_token}")
except Exception as e:
    print(f"Auth error: {e}")
```

## 3. Függőségek Telepítése

### 3.1 Node.js
```powershell
npm install
```

Ez telepíti:
- `express` - Web szerver
- `axios` - HTTP kliens a Google API hívásokhoz

### 3.2 Python (opcionális)
```powershell
cd david
pip install -r requirements.txt
```

A Google OAuth Python modul csak beépített `urllib` könyvtárat használ, nincs extra függőség.

## 4. Szerver Indítása

### 4.1 Környezeti változók beállítása
```powershell
$env:GOOGLE_CLIENT_ID="your-actual-client-id"
$env:GOOGLE_CLIENT_SECRET="your-actual-client-secret"
```

### 4.2 Szerver indítás
```powershell
npm start
```

Vagy:
```powershell
node website/server.js
```

## 5. Használat

1. Nyisd meg a böngészőben: `http://localhost:3000/login.html`
2. Kattints a **"Bejelentkezés Google-lal"** gombra
3. Átirányít a Google bejelentkezéshez
4. Válaszd ki a Google fiókodat
5. Engedélyezd a hozzáférést
6. Automatikus visszairányítás a home oldalra

## 6. Biztonsági Megjegyzések

### Development környezet:
- ✅ `http://localhost:3000` használható tesztelésre
- ✅ Ideiglenes credentials használata OK

### Production környezet:
- ⚠️ **MINDIG HTTPS-t használj!**
- ⚠️ Secrets ne kerüljenek Git-be (`.env` fájl a `.gitignore`-ban)
- ⚠️ Használj környezeti változókat vagy secret managert
- ⚠️ State parameter CSRF védelem (jelenleg nincs implementálva, TODO)
- ⚠️ Session storage legyen Redis vagy adatbázis (jelenleg in-memory)
- ⚠️ Token expiration és refresh logic

## 7. Hibaelhárítás

### "redirect_uri_mismatch" error
- Ellenőrizd, hogy a redirect URI pontosan egyezik a Google Console-ban beállítottal
- A trailing slash számít! (`/callback` ≠ `/callback/`)
- HTTP vs HTTPS számít!

### "access_denied" error
- A felhasználó visszautasította az engedélyt
- Vagy a scope-ok nem megfelelők

### "invalid_client" error
- Rossz Client ID vagy Client Secret
- Ellenőrizd a környezeti változókat

### Token nem működik
- Ellenőrizd, hogy a szerver session storage-ben van-e a token
- Nézd meg a böngésző localStorage-ban van-e `authToken`

## 8. Tesztelés

### Manual teszt:
1. Indítsd el a szervert
2. Nyisd meg: `http://localhost:3000/login.html`
3. Próbálj bejelentkezni Google-lal
4. Ellenőrizd a redirect-et és a tokent

### API teszt:
```powershell
# Authorization URL lekérés
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/google/url" -Method Get
```

## 9. További Fejlesztési Lehetőségek

- [ ] State parameter CSRF védelem implementálása
- [ ] Refresh token kezelés
- [ ] Token revocation/logout
- [ ] Perzisztens session storage (Redis)
- [ ] Rate limiting a login endpointokon
- [ ] Multi-factor authentication (MFA)
- [ ] Account linking (több auth provider ugyanazon userhez)
- [ ] Admin dashboard Google profilképpel

## 10. Kapcsolódó Dokumentumok

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Sign-In Best Practices](https://developers.google.com/identity/sign-in/web/best-practices)
- Python `auth.py` dokumentáció
- Node.js `server.js` implementáció
