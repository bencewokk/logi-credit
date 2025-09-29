# kristof package
__all__ = ["format_txn"]

def format_txn(txn: dict) -> str:
    return f"{txn.get('id')} - {txn.get('amount')}"