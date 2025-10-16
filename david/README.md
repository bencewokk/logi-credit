# david - In-Memory Auth Module

Lightweight, dependency-free (stdlib only) authentication & authorization layer used for exercises and prototyping inside the `david` package. Provides:

* User registration (username + email validation)
* Password hashing (PBKDF2-SHA256) + simple password strength policy
* Login with constant-time verification & minimal fixed delay against timing attacks
* HMAC-signed stateless access tokens (compact JSON format)
* Rotating refresh tokens (in-memory tracking)
* Roles & permissions (default roles: `user`, `admin`)
* Rate limiting (token bucket) for login attempts
* Audit log (ring buffer) + basic metrics snapshot
* **Google OAuth 2.0 Integration** - Social login támogatás

The code lives in `src/david/auth.py` (~500 LOC, intentionally verbose & documented) and `src/david/google_auth.py` for Google OAuth. Not production-grade (no persistence, no MFA, no external secrets manager) but structured to be swappable for a real backend later.

---

## Quick Start (PowerShell)

```powershell
cd david
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt  # currently empty (stdlib only)
set PYTHONPATH="..\david\src;..\pali\src;..\kristof\src;..\zsombi\src"
pytest -q
```

## Development Rules

* Work inside `david/` unless cross-package change is necessary.
* Branch naming: `david/<feature>` (e.g. `david/refresh-rotation`).
* Keep public API surface re-exported from `david.__init__` to simplify imports.

## Running Example

```powershell
python -m david.main  # prints example auth_message()
```

Interactive REPL demo:

```python
from david import AuthService, InMemoryUserRepository
repo = InMemoryUserRepository()
auth = AuthService(repo)
auth.register_user("alice", "alice@example.com", "Sup3rStr0ng!PW")
res = auth.login("alice", "Sup3rStr0ng!PW")
print(res.access_token)
claims = auth.verify_access_token(res.access_token)
print(claims.roles, claims.permissions)
```

### Google OAuth Demo

```python
from david import GoogleAuthProvider, AuthService, InMemoryUserRepository
import os

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

# After callback with code:
# result = google_auth.authenticate_with_code(code)
# print(f"Access token: {result.access_token}")
```

📖 **Részletes Google OAuth dokumentáció**: Lásd [README.google_oauth.md](README.google_oauth.md)

## File Overview

```
src/david/
  __init__.py       # Re-exports public API (AuthService, GoogleAuthProvider, helpers)
  main.py           # Simple entry point using auth_message()
  auth.py           # Core in-memory auth implementation
  simple_auth.py    # Simple email+password authentication
  google_auth.py    # Google OAuth 2.0 integration
```

Key classes / functions:
* AuthService – high-level facade
* InMemoryUserRepository – user storage (swap for DB-backed impl later)
* PasswordHasher – PBKDF2 wrapper
* AuthConfig – TTLs & security knobs
* **GoogleAuthProvider** – Google OAuth 2.0 bejelentkezés
* demo_register_and_login / describe_user – convenience helpers

### Login Flow Summary
1. User registers: password policy checked, PBKDF2 hash stored.
2. On login: rate limit check → password verify → access token (15m) + refresh token (7d) issued.
3. Refresh: old refresh optionally rotated; new access + refresh returned.
4. Permission checks: `AuthService.require(token, "perm")` ensures claim present.

### Token Format
Access token: `base64url(header).base64url(payload).base64url(hmac)`
- header: `{ "alg": "HS256", "typ": "david.atk" }`
- payload fields: `sub`, `iat`, `exp`, `roles`, `permissions`, `token_id`

Refresh token: `r.<base64url(json)>.<hmac>` where json contains `rid` + `exp`.

### Extending
Add MFA, persistent storage, or stronger hashing (e.g. Argon2) by introducing new modules and adjusting `AuthService` via composition, not by rewriting.

## Testing

Current tests:
* `tests/test_auth.py` - Basic auth_message() legacy test
* `tests/test_google_auth.py` - Google OAuth flow testing (with mocks)

Recommended additions:
* Register + login happy path
* Weak password rejection
* Rate limit triggers after repeated failures
* Token expiry edge case (simulate with FixedClock)
* Permission denial & success
* Google OAuth error handling

Run tests:
```powershell
cd david
pytest -v
```

## Roadmap Ideas
* Argon2id support via optional dependency
* Pluggable persistence (SQLite/Postgres)
* Web session layer (signed cookies)
* Google OAuth state parameter for CSRF protection
* Refresh token rotation for Google OAuth users
* Account linking (multiple auth providers per user)
* Profile picture display from Google
* MFA (TOTP / WebAuthn) hooks
* Structured logging & Prometheus metrics exporter

---

Legacy production FastAPI description was removed for clarity; this repo's `david` package now focuses strictly on a teachable in-memory auth core. If you need the previous large-scale architecture, restore it from version control history.

---
Happy hacking!  
– The david module
=======
## Getting Started
1. Implement user login and registration logic.
2. Add any helper modules for password hashing, session management, etc.

## Example
- `auth.py` - Main authentication logic
- `models.py` - User models

>>>>>>> cd391466fb21d6ec9991cff37c75564b9ad795e1
