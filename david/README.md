# david - Auth

## Overview
Responsible for authentication logic (login, registration, etc.).

## Python setup

Use a local virtual environment in this folder to avoid conflicts with others.

PowerShell example:

```powershell
cd david
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
```

## Workflow rules

- Work only inside `david/` unless agreed in a PR.
- Branch naming: `david/<short-description>` (e.g. `david/login-form`).

## Running

Run the small example package:

```powershell
python -m david.main
```

## Folder Structure
- Place all authentication-related Python files here.

## Getting Started
1. Implement user login and registration logic.
2. Add any helper modules for password hashing, session management, etc.

## Example
- `auth.py` - Main authentication logic
- `models.py` - User models


# Logicredit Authentication Service

Production-ready authentication module for banking workloads built with **FastAPI**, **SQLAlchemy 2.x**, **Alembic**, **PostgreSQL**, **Redis**, and hardened security defaults. It provides password, TOTP, and WebAuthn/Passkey authentication, strong session management, CSRF protection, and audit logging suitable for PSD2-style step-up flows.

## Features

- Argon2id password hashing with banned password enforcement (10k list).
- Email verification, password reset with revocation of active sessions.
- Sliding session cookies (`HttpOnly`, `Secure`, `SameSite=Strict`) with CSRF double submit tokens in Redis.
- Multi-factor authentication via TOTP and WebAuthn (Passkey) including challenge orchestration.
- Step-up security dependency to require MFA freshness (< 5 minutes) for sensitive operations.
- Role-based access control (`user`, `staff`, `admin`).
- Redis-backed rate limiting (SlowAPI) and brute-force lockout counters per user.
- Audit trail for all authentication events (success, failure, MFA actions, session changes).
- Async SMTP email delivery using `aiosmtplib` (background tasks by default, Celery-compatible).
- Security headers (HSTS recommended at proxy), strict CORS, explicit TLS notes.
- Docker image ready for Gunicorn/Uvicorn deployment + Docker Compose stack (API, PostgreSQL, Redis, Mailhog).
- Comprehensive pytest+httpx async test suite with coverage support.
- Postman collection with ready-made requests.

## Project Structure

```
app/
  api/                # FastAPI routers and dependencies
  core/               # Configuration, security helpers, rate limiting, email client
  db/                 # SQLAlchemy base & session management
  models/             # SQLAlchemy models
  schemas/            # Pydantic request/response models
  services/           # Domain services (sessions, MFA, audit, tokens, WebAuthn)
  utils/              # Utility helpers (request metadata)
  main.py             # FastAPI factory
migrations/           # Alembic environment and initial migration
postman_collection.json
Dockerfile
```

The banned password list lives under `data/banned-passwords.txt` (10,000 entries). Replace with enterprise-grade dataset as needed.

## Requirements

- Python 3.11+
- PostgreSQL 14+ (async via `asyncpg`)
- Redis 6+
- Node optional for client integrations

Install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment Variables

Copy `.env.example` to `.env` and adjust for your environment:

```bash
cp .env.example .env
```

> **Production note:** Secrets (SMTP credentials, encryption keys, database passwords) should be sourced from a secrets manager/KMS rather than committed `.env` files. Rotate keys regularly.

Key settings:

- `DATABASE_URL`: e.g. `postgresql+asyncpg://user:pass@host:5432/db`
- `REDIS_URL`: Redis connection URI (also used for rate limits + CSRF tokens)
- `TOTP_ENCRYPTION_KEY`: >=32 chars, used for at-rest encryption of TOTP secrets & CSRF HMAC
- `FIDO_RP_ID`, `FIDO_RP_NAME`, `ORIGIN_URL`: WebAuthn relying party metadata
- `FRONTEND_ORIGINS`: comma-separated whitelist for CORS

## Database Migrations

Run Alembic migrations locally:

```bash
alembic upgrade head
```

To create a new migration after model changes:

```bash
alembic revision --autogenerate -m "your message"
```

## Development Workflow

1. Activate the virtual environment and install dependencies.
2. Start Redis/Postgres (via Docker or local services).
3. Apply migrations (`alembic upgrade head`).
4. Launch the API with uvicorn:

   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

5. Access interactive docs at `http://localhost:8000/docs`.

### Pre-commit Hooks

Install hooks to enforce code style (Black, isort, Flake8 + Bugbear):

```bash
pre-commit install
pre-commit run --all-files
```

## Docker Deployment

Build the image and run with Docker Compose:

```bash
docker-compose build
docker-compose up
```

Services:

- `api`: FastAPI with Gunicorn/Uvicorn workers (port 8000)
- `db`: PostgreSQL 15 (data volume `postgres-data`)
- `redis`: Redis 7 for sessions/rate limits/CSRF
- `mailhog`: SMTP sink + web UI at `http://localhost:8025`

The API container runs migrations automatically before starting the server (`alembic upgrade head`).

## Testing & Coverage

Execute the async test suite with coverage:

```bash
pytest --asyncio-mode=auto --maxfail=1 --disable-warnings
coverage run -m pytest && coverage report -m
```

Tests cover:

- Registration → email verification → session login/logout
- TOTP enrollment & challenge verification
- WebAuthn registration/login (mocked credentials)
- Password reset with session revocation
- CSRF protection & rate limiting
- Role enforcement for admin-only endpoints

## Security Architecture

- **Password Hashing**: Argon2id (argon2-cffi) with high memory/time cost, combined with a 10k banned password list.
- **Sessions**: Sliding expiration (15 minutes idle), cookies flagged as `HttpOnly`, `Secure`, `SameSite=Strict`. Session metadata tracks IP/UA + `mfa_last_verified_at` for step-up checks.
- **CSRF**: Double-submit tokens stored in Redis. Clients must send `X-CSRF-Token` header for state-changing routes.
- **Rate Limiting**: SlowAPI + Redis storage (default 50 requests / 10 minutes per IP) and exponential backoff lockouts for repeated login failures.
- **Audit Logging**: All auth events persisted with timestamp, IP, user agent, optional metadata.
- **MFA**:
  - TOTP secrets encrypted at rest (Fernet/AES via `cryptography`).
  - WebAuthn/Passkey credentials stored per user (multiple allowed), sign counter validated.
- **Step-up (PSD2/SCA)**: `require_recent_mfa` dependency ensures sensitive routes only succeed if MFA validated within the last 5 minutes, otherwise returns an MFA challenge response.
- **Headers & CORS**: Security headers set (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, HSTS). CORS restricted to configured frontend origins.
- **Email Delivery**: Async SMTP via `aiosmtplib` (default background task). For production-scale throughput, swap to Celery/Redis or a provider SDK.

> **TLS Reminder:** Terminate TLS at a reverse proxy/load balancer with HSTS enabled. Never serve auth endpoints over plain HTTP in production.

## Using the API

All responses return machine-readable JSON codes. Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user, triggers email verification |
| POST | `/auth/verify-email` | Confirm email using 32-char token |
| POST | `/auth/login` | Password login. Returns MFA challenge if required |
| POST | `/auth/mfa/totp/setup` | Generate provisioning URI (requires session + CSRF) |
| POST | `/auth/mfa/totp/verify` | Verify TOTP for setup or login |
| POST | `/auth/webauthn/register/start` | Begin WebAuthn registration |
| POST | `/auth/webauthn/register/finish` | Persist WebAuthn credential |
| POST | `/auth/webauthn/login/start` | Issue WebAuthn challenge |
| POST | `/auth/webauthn/login/finish` | Verify WebAuthn assertion |
| POST | `/auth/password/reset/request` | Send reset token email |
| POST | `/auth/password/reset/confirm` | Reset password & revoke sessions |
| GET | `/auth/sessions` | List active sessions |
| POST | `/auth/logout` | Terminate current session |
| POST | `/auth/sessions/revoke-others` | Kill all other sessions |
| POST | `/auth/step-up/confirm` | Example sensitive action (requires fresh MFA) |
| GET | `/auth/admin/ping` | Admin-only health check |

Refer to `postman_collection.json` for ready-made Postman/Thunder client requests. Add environment variable `BASE_URL` and (optionally) `EMAIL_TOKEN`, `RESET_TOKEN`, `CSRF_TOKEN` when executing flows manually.

## Background Email Worker (Optional)

Out-of-the-box the service relies on FastAPI `BackgroundTasks` for async email sending. For high-volume production systems integrate a task queue (e.g. Celery + Redis or AWS SQS) by swapping `EmailService.send_email` with your worker enqueue function.

## Additional Notes

- TOTP/WebAuthn secrets are encrypted at rest; rotate the `TOTP_ENCRYPTION_KEY` after performing a secret rotation plan.
- Audit log volume can be routed to SIEM/ELK by consuming the `audit_logs` table.
- Replace the sample banned password list with a vetted data set aligned with corporate policy.
- Configure observability (Prometheus, logging, tracing) via FastAPI middlewares as needed.

Happy shipping! Secure-by-default authentication ready for integration with your core banking platform.

# Logicredi
