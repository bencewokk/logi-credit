# Google OAuth 2.0 Authentication Setup

Ez a dokumentáció segít beállítani a Google OAuth 2.0 autentikációt a Logi Credit projektben.

## Előfeltételek

1. Google Cloud Console hozzáférés
2. Érvényes Google fiók

## Beállítási lépések

### 1. Google Cloud Console konfiguráció

1. Menj a [Google Cloud Console](https://console.cloud.google.com/) oldalra
2. Hozz létre új projektet vagy válassz egy meglévőt
3. Navigálj az **APIs & Services > Credentials** menüpontra
4. Kattints a **+ CREATE CREDENTIALS** gombra
5. Válaszd az **OAuth client ID** opciót
6. Válaszd az **Web application** típust

### 2. Authorized redirect URIs beállítása

Add hozzá a következő URI-kat a **Authorized redirect URIs** listához:

**Fejlesztési környezet:**
```
http://localhost:3000/auth/google/callback
```

**Production környezet:**
```
https://yourdomain.com/auth/google/callback
```

⚠️ **FONTOS:** Production környezetben KÖTELEZŐ HTTPS használata!

### 3. Credentials letöltése

1. A létrehozott OAuth 2.0 Client ID-nál kattints a letöltés ikonra
2. Mentsd el a JSON fájlt biztonságos helyre
3. A JSON-ből szükséges adatok:
   - `client_id`
   - `client_secret`

### 4. Környezeti változók beállítása

Másold le a `.env.example` fájlt `.env` névre:

```bash
cp .env.example .env
```

Töltsd ki a következő értékekkel:

```env
GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-actual-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 5. Python kód példa

```python
import os
from dotenv import load_dotenv
from david.google_auth import create_google_auth_from_env
from david.auth import AuthService, InMemoryUserRepository

# Környezeti változók betöltése
load_dotenv()

# Auth service inicializálása
repo = InMemoryUserRepository()
auth_service = AuthService(repo)

# Google OAuth provider létrehozása
google_auth = create_google_auth_from_env(auth_service)

# Authorization URL generálása
import secrets
state = secrets.token_urlsafe(32)  # CSRF védelem
auth_url = google_auth.get_authorization_url(state=state)

print(f"Redirect user to: {auth_url}")

# Miután a user visszatér a callback URL-re a code paraméterrel:
# code = request.args.get('code')  # Flask példa
# result = google_auth.authenticate_with_code(code)
# access_token = result.access_token
```

## Biztonsági megjegyzések

### ✅ DO (Csináld):
- Használj HTTPS-t production környezetben
- Tárold a credentials-t környezeti változókban vagy secret manager-ben
- Használj state paramétert CSRF védelem miatt
- Ellenőrizd, hogy a user email címe verified
- Add hozzá a `.env` fájlt a `.gitignore`-hoz

### ❌ DON'T (Ne csináld):
- ❌ Ne használj HTTP-t production-ben (csak localhost fejlesztéshez)
- ❌ Ne commit-old a credentials-t a kódba
- ❌ Ne hardcode-old a redirect URI-t
- ❌ Ne hagyd ki a state paraméter ellenőrzését

## Hibakezelés

### "redirect_uri must use HTTPS in production"

Ez a hiba akkor jelenik meg, ha HTTP-t próbálsz használni nem-localhost címen.

**Megoldás:**
- Fejlesztéshez használd: `http://localhost:3000/...` vagy `http://127.0.0.1:3000/...`
- Production-höz használd: `https://yourdomain.com/...`

### "redirect_uri must be provided or set GOOGLE_REDIRECT_URI environment variable"

A `GOOGLE_REDIRECT_URI` környezeti változó nincs beállítva.

**Megoldás:**
```bash
export GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

Vagy add hozzá a `.env` fájlhoz.

### "GOOGLE_CLIENT_ID environment variable is required"

A kötelező környezeti változók hiányoznak.

**Megoldás:**
Állítsd be az összes szükséges környezeti változót a `.env` fájlban.

## OAuth Flow áttekintés

```
1. User → "Login with Google" button
2. App → Redirect to Google authorization URL
3. User → Bejelentkezik Google-nél és engedélyezi az app-ot
4. Google → Redirect vissza az app callback URL-jére (code paraméterrel)
5. App → Kicseréli a code-ot access token-re
6. App → Lekéri a user adatokat a Google API-tól
7. App → Létrehozza vagy bejelentkezteti a user-t a saját rendszerében
8. App → Visszaad egy saját access token-t
```

## Tesztelés

```bash
# Környezeti változók ellenőrzése
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('Client ID:', os.getenv('GOOGLE_CLIENT_ID')[:20] + '...' if os.getenv('GOOGLE_CLIENT_ID') else 'MISSING')"

# Google auth tesztelése
cd david
python -m pytest tests/ -k google_auth -v
```

## További források

- [Google OAuth 2.0 dokumentáció](https://developers.google.com/identity/protocols/oauth2)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- [Google Cloud Console](https://console.cloud.google.com/)
