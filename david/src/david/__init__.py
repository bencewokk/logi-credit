"""david package public API.

This package now includes an extended in-memory authentication subsystem in
`auth.py`. The legacy `auth_message` function is retained so existing tests
and examples continue to work. New consumers should prefer the richer
interfaces exposed by `AuthService` and related helpers.
"""

from .auth import (  # nagyobb, részletes auth rendszer
    AuthService,
    InMemoryUserRepository,
    PasswordHasher,
    AuthConfig,
    demo_register_and_login,
    describe_user,
)
from .simple_auth import simple_login, get_config as simple_auth_config

__all__ = [
    "auth_message",
    "AuthService",  # komplex
    "InMemoryUserRepository",
    "PasswordHasher",
    "AuthConfig",
    "demo_register_and_login",
    "describe_user",
    "simple_login",  # egyszerű alap email+jelszó
    "simple_auth_config",
]


def auth_message(user: str) -> str:
    return f"Auth module ready for {user}"