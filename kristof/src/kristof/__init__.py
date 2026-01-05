# kristof package

from .ledger import InsufficientFundsError, Ledger, LedgerError, Transaction

__all__ = [
    "format_txn",
    "Ledger",
    "Transaction",
    "LedgerError",
    "InsufficientFundsError",
]


def format_txn(txn: dict) -> str:
    return f"{txn.get('id')} - {txn.get('amount')}"