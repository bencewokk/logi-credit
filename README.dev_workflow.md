Developer workflow

- Each person works inside their own top-level folder (e.g. `zsombi/`, `david/`).
- Use a local virtual environment inside your folder (named `venv/`) to avoid dependency conflicts.
- Branch naming: `person/short-description` (e.g. `zsombi/header-ui`).
- Do not edit other people's folders without coordinating in a PR.

Per-person setup (PowerShell)

```powershell
cd zsombi
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
```
