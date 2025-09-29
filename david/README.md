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

