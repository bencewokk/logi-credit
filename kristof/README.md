# kristof - Tranzakciók (Python)

This folder contains a Python skeleton for transaction processing prototypes.

## Python setup

PowerShell example:

```powershell
cd kristof
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
```

## Workflow

- Branch naming: `kristof/<desc>`
- Keep changes scoped to `kristof/` unless coordinating.

## Overview
Responsible for transaction logic and handling.

## Folder Structure
- Place all transaction-related Python files here.

## Getting Started
1. Implement transaction processing logic.
2. Add helper modules for validation, history, etc.

## Example
- `transactions.py` - Main transaction logic
- `history.py` - Transaction history
