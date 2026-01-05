from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4


class LedgerError(ValueError):
    pass


class InsufficientFundsError(LedgerError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True, slots=True)
class Transaction:
    id: str
    to_user: str
    amount: int
    from_user: Optional[str] = None
    note: str = ""
    created_at: datetime = field(default_factory=_utc_now)


class Ledger:
    """In-memory ledger that tracks balances via posted transactions.

    This is intentionally small and dependency-free.

    Rules:
    - amount is an integer > 0 (treat as smallest currency unit, e.g., HUF)
    - deposits ("get money") have from_user=None
    - transfers require sufficient funds for from_user
    """

    def __init__(self) -> None:
        self._balances: Dict[str, int] = {}
        self._transactions: List[Transaction] = []

    def balance(self, user: str) -> int:
        if not user or not isinstance(user, str):
            raise LedgerError("user must be a non-empty string")
        return int(self._balances.get(user, 0))

    def transactions(self) -> List[Transaction]:
        return list(self._transactions)

    def deposit(self, *, to_user: str, amount: int, note: str = "") -> Transaction:
        """Credit money to a user (receiving money increases balance)."""
        self._validate_user(to_user, field_name="to_user")
        self._validate_amount(amount)

        tx = Transaction(id=str(uuid4()), from_user=None, to_user=to_user, amount=int(amount), note=note)
        self._apply(tx)
        return tx

    def transfer(self, *, from_user: str, to_user: str, amount: int, note: str = "") -> Transaction:
        self._validate_user(from_user, field_name="from_user")
        self._validate_user(to_user, field_name="to_user")
        self._validate_amount(amount)

        if from_user == to_user:
            raise LedgerError("from_user and to_user must be different")

        if self.balance(from_user) < int(amount):
            raise InsufficientFundsError("insufficient funds")

        tx = Transaction(id=str(uuid4()), from_user=from_user, to_user=to_user, amount=int(amount), note=note)
        self._apply(tx)
        return tx

    def _apply(self, tx: Transaction) -> None:
        if tx.from_user is not None:
            self._balances[tx.from_user] = self.balance(tx.from_user) - tx.amount
        self._balances[tx.to_user] = self.balance(tx.to_user) + tx.amount
        self._transactions.append(tx)

    @staticmethod
    def _validate_user(user: str, *, field_name: str) -> None:
        if not user or not isinstance(user, str):
            raise LedgerError(f"{field_name} must be a non-empty string")

    @staticmethod
    def _validate_amount(amount: int) -> None:
        try:
            numeric = int(amount)
        except (TypeError, ValueError) as exc:
            raise LedgerError("amount must be an integer") from exc

        if numeric <= 0:
            raise LedgerError("amount must be > 0")
