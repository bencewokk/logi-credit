"""Simple default email+password authentication helper.

Kérés szerint: legyen egy *alap* felhasználó (email + jelszó), és lehessen
azzal bejelentkezni. Ez a modul szándékosan minimalista – nincs adatbázis,
csak konstans / környezeti változó. Opcionálisan a jelszó biztonságos
ellenőrzése PBKDF2-vel történik, de ha nagyon egyszerű kell, kikapcsolható.

Használat:
    from david.simple_auth import simple_login
    ok = simple_login("admin@example.com", "changeme")
    if ok:
        print("Login OK")

Környezeti változók (felülírják az alapértékeket):
    DAVID_DEFAULT_EMAIL
    DAVID_DEFAULT_PASSWORD
    DAVID_SIMPLE_HASH ("1" vagy "0")  -> ha "0", akkor plain text összehasonlítás

Megjegyzés: Ez oktatási/gyakorló célra készült. Éles rendszerhez
állapottárolás, rate limiting, audit log stb. szükséges.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass
from typing import Optional

__all__ = ["SimpleAuthConfig", "simple_login", "get_config"]


def _ct_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def _pbkdf2(password: str, salt: str, iterations: int = 120_000) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations)
    return dk.hex()


@dataclass
class SimpleAuthConfig:
    email: str = "admin@example.com"
    password: str = "changeme"  # plain fallback (nem biztonságos élesben!)
    use_hash: bool = True
    salt: str = "david-simple-salt"
    iterations: int = 60_000

    @staticmethod
    def load_from_env() -> "SimpleAuthConfig":
        return SimpleAuthConfig(
            email=os.getenv("DAVID_DEFAULT_EMAIL", "admin@example.com"),
            password=os.getenv("DAVID_DEFAULT_PASSWORD", "changeme"),
            use_hash=os.getenv("DAVID_SIMPLE_HASH", "1") != "0",
            salt=os.getenv("DAVID_SIMPLE_SALT", "david-simple-salt"),
            iterations=int(os.getenv("DAVID_SIMPLE_ITER", "60000")),
        )

    def derived_secret(self) -> str:
        if not self.use_hash:
            return self.password
        return _pbkdf2(self.password, self.salt, self.iterations)


_CONFIG: Optional[SimpleAuthConfig] = None
_DERIVED: Optional[str] = None


def get_config() -> SimpleAuthConfig:
    global _CONFIG, _DERIVED
    if _CONFIG is None:
        _CONFIG = SimpleAuthConfig.load_from_env()
        _DERIVED = _CONFIG.derived_secret()
    return _CONFIG


def simple_login(email: str, password: str) -> bool:
    """Return True ha az email + jelszó egyezik az alap értékkel.

    Ha `use_hash` aktív, a megadott jelszó PBKDF2 hash-e kerül összevetésre.
    """

    cfg = get_config()
    if email.strip().lower() != cfg.email.lower():  # email must match
        return False
    if cfg.use_hash:
        attempted = _pbkdf2(password, cfg.salt, cfg.iterations)
        return _ct_equals(attempted, cfg.derived_secret())
    else:
        return _ct_equals(password, cfg.password)


if __name__ == "__main__":  # pragma: no cover
    e = input("Email: ")
    p = input("Password: ")
    print("Login success" if simple_login(e, p) else "Login failed")
