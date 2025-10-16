"""Authentication and authorization utilities for the 'david' package.

This module is intentionally verbose (~500 lines) to serve as a didactic
example covering a miniature but reasonably featureful in‑memory auth system
without external dependencies. It focuses on clarity, safety‑oriented
defaults, and extensibility. All storage is in‑memory; integrate a database
by swapping the repository classes while preserving their public contracts.

Core features provided:
  * User registration with normalized usernames & email validation hints
  * Password hashing using PBKDF2-HMAC (SHA256) with per‑user salt
  * Password policy & strength estimation heuristics
  * Login with timing‑safe comparison and constant minimum delay
  * Stateless signed access tokens (HMAC) with embedded claims
  * Refresh token management (rotating) stored server‑side (in memory)
  * Role & permission model (role → permissions; direct user grants)
  * Simple audit log ring buffer
  * Rate limiting primitives (token bucket) for login attempts
  * Pluggable clock & entropy sources for testability
  * Minimal metrics counters
  * Structured exceptions hierarchy

Security notes (important in real systems):
  - Secrets & signing keys must come from a secure source (e.g. env var,
    secret manager). Here we generate a deterministic fallback for
    reproducibility in tests.
  - In production, enforce HTTPS, secure cookie flags, CSRF defenses, etc.
  - Token revocation & blacklisting beyond refresh rotation is not included.
  - No multi-factor auth (MFA) implemented; left as an exercise hook.
  - Memory store is NOT durable; restarting the process loses data.

Integration sketch:
  from david.auth import AuthService, InMemoryUserRepository
  repo = InMemoryUserRepository()
  auth = AuthService(repo)
  auth.register_user("alice", "alice@example.com", "S3cur3P@ssw0rd!")
  token = auth.login("alice", "S3cur3P@ssw0rd!").access_token

UNIT TESTING HOOKS
------------------
You can inject a FixedClock or DeterministicEntropy for predictable outputs.

The code is structured so that heavy dependencies (JWT libs, ORMs) can be
introduced later without changing public method signatures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
import re
import secrets
import string
import threading
import time
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence, Tuple, Union, Callable, Set

__all__ = [
    "AuthError",
    "UserAlreadyExists",
    "InvalidCredentials",
    "PasswordPolicyError",
    "PermissionDenied",
    "TokenError",
    "User",
    "AuthConfig",
    "AuthService",
    "InMemoryUserRepository",
    "PasswordHasher",
    "AccessTokenClaims",
    "LoginResult",
]


# ============================
# Exceptions & error hierarchy
# ============================

class AuthError(Exception):
    """Base class for auth related issues."""


class UserAlreadyExists(AuthError):
    pass


class InvalidCredentials(AuthError):
    pass


class PasswordPolicyError(AuthError):
    pass


class PermissionDenied(AuthError):
    pass


class TokenError(AuthError):
    pass


# ============================
# Utility / infrastructure
# ============================

class Clock:
    """Clock abstraction to enable deterministic tests."""

    def now(self) -> datetime:
        return datetime.now(timezone.utc)


class FixedClock(Clock):
    def __init__(self, fixed: datetime):
        self._fixed = fixed

    def now(self) -> datetime:  # type: ignore[override]
        return self._fixed


EntropySource = Callable[[int], bytes]


def default_entropy(n: int) -> bytes:
    return secrets.token_bytes(n)


def base64url(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def constant_time_compare(a: bytes, b: bytes) -> bool:
    return hmac.compare_digest(a, b)


def _norm_username(name: str) -> str:
    return re.sub(r"\s+", "", name.strip().lower())


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def validate_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email))


# ============================
# Password hashing / policy
# ============================

@dataclass(slots=True)
class PasswordHash:
    algorithm: str
    salt: str
    iterations: int
    hash: str

    def serialize(self) -> str:
        return f"{self.algorithm}${self.iterations}${self.salt}${self.hash}"

    @staticmethod
    def deserialize(raw: str) -> "PasswordHash":
        algorithm, iterations, salt, h = raw.split("$")
        return PasswordHash(algorithm, salt, int(iterations), h)


class PasswordHasher:
    """PBKDF2-based password hasher with adjustable iterations."""

    def __init__(self, iterations: int = 120_000, entropy: EntropySource = default_entropy):
        self.iterations = iterations
        self.entropy = entropy

    def hash(self, password: str) -> PasswordHash:
        salt = base64url(self.entropy(16))
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("utf-8"), self.iterations
        )
        return PasswordHash("pbkdf2_sha256", salt, self.iterations, base64url(dk))

    def verify(self, password: str, stored: PasswordHash) -> bool:
        # Check if this is a Google OAuth user (no password login allowed)
        if stored.algorithm == "google_oauth":
            return False
        
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), stored.salt.encode("utf-8"), stored.iterations
        )
        return constant_time_compare(base64url(dk).encode(), stored.hash.encode())


def estimate_password_strength(pw: str) -> float:
    """Returns a naive strength score in [0,1]."""

    length_score = min(len(pw) / 16, 1.0)
    variety = sum(1 for rgx in [r"[a-z]", r"[A-Z]", r"[0-9]", r"[^A-Za-z0-9]"] if re.search(rgx, pw))
    variety_score = variety / 4
    common_patterns_penalty = 0.25 if re.search(r"password|1234|qwer|abcd", pw.lower()) else 0.0
    return max(0.0, min(1.0, (0.6 * length_score + 0.4 * variety_score) - common_patterns_penalty))


def enforce_password_policy(pw: str) -> None:
    if len(pw) < 10:
        raise PasswordPolicyError("Password too short (min 10).")
    if estimate_password_strength(pw) < 0.55:
        raise PasswordPolicyError("Password too weak; include length & variety.")


# ============================
# Permission / role model
# ============================

@dataclass(slots=True)
class Role:
    name: str
    permissions: Set[str]


DEFAULT_ROLES: Dict[str, Role] = {
    "user": Role("user", {"read:self"}),
    "admin": Role("admin", {"read:self", "read:any", "user:create", "user:delete"}),
}


# ============================
# Domain models
# ============================

@dataclass(slots=True)
class User:
    id: int
    username: str
    email: str
    password_hash: PasswordHash
    roles: Set[str] = field(default_factory=lambda: {"user"})
    permissions: Set[str] = field(default_factory=set)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    refresh_tokens: Dict[str, datetime] = field(default_factory=dict)  # token_id -> expiry

    def all_permissions(self) -> Set[str]:
        perms = set(self.permissions)
        for r in self.roles:
            role = DEFAULT_ROLES.get(r)
            if role:
                perms.update(role.permissions)
        return perms


@dataclass(slots=True)
class AccessTokenClaims:
    sub: str
    iat: int
    exp: int
    roles: List[str]
    permissions: List[str]
    token_id: str
    user_id: Optional[int] = None
    username: Optional[str] = None

    def to_json(self) -> str:
        data = {
            'sub': self.sub,
            'iat': self.iat,
            'exp': self.exp,
            'roles': self.roles,
            'permissions': self.permissions,
            'token_id': self.token_id,
            'user_id': self.user_id,
            'username': self.username
        }
        return json.dumps(data, separators=(",", ":"), sort_keys=True, default=str)

    @staticmethod
    def from_json(data: str) -> "AccessTokenClaims":
        obj = json.loads(data)
        return AccessTokenClaims(
            sub=obj["sub"],
            iat=obj["iat"],
            exp=obj["exp"],
            roles=list(obj.get("roles", [])),
            permissions=list(obj.get("permissions", [])),
            token_id=obj["token_id"],
            user_id=obj.get("user_id"),
            username=obj.get("username")
        )


@dataclass(slots=True)
class LoginResult:
    access_token: str
    refresh_token: str
    user_id: int
    username: str
    roles: Set[str]
    expires_at: Optional[datetime] = None


# ============================
# Repository interface
# ============================

class UserRepository:
    """Abstract repository (minimal)."""

    def get(self, username: str) -> Optional[User]:  # pragma: no cover - interface
        raise NotImplementedError

    def add(self, user: User) -> None:  # pragma: no cover - interface
        raise NotImplementedError

    def update(self, user: User) -> None:  # pragma: no cover - interface
        raise NotImplementedError


class InMemoryUserRepository(UserRepository):
    def __init__(self):
        self._lock = threading.RLock()
        self._users: Dict[str, User] = {}
        self._users_by_id: Dict[int, User] = {}
        self._users_by_email: Dict[str, User] = {}
        self._next_user_id = 1

    def _next_id(self) -> int:
        """Generate next user ID."""
        with self._lock:
            user_id = self._next_user_id
            self._next_user_id += 1
            return user_id

    def get(self, username: str) -> Optional[User]:  # type: ignore[override]
        with self._lock:
            return self._users.get(_norm_username(username))
    
    def find_by_username(self, username: str) -> Optional[User]:
        """Find user by username."""
        return self.get(username)
    
    def find_by_email(self, email: str) -> Optional[User]:
        """Find user by email address."""
        with self._lock:
            return self._users_by_email.get(email.lower())
    
    def find_by_id(self, user_id: int) -> Optional[User]:
        """Find user by ID."""
        with self._lock:
            return self._users_by_id.get(user_id)

    def add(self, user: User) -> None:  # type: ignore[override]
        with self._lock:
            key = _norm_username(user.username)
            if key in self._users:
                raise UserAlreadyExists(user.username)
            self._users[key] = user
            self._users_by_id[user.id] = user
            self._users_by_email[user.email.lower()] = user
    
    def save(self, user: User) -> None:
        """Save or update user."""
        with self._lock:
            key = _norm_username(user.username)
            self._users[key] = user
            self._users_by_id[user.id] = user
            self._users_by_email[user.email.lower()] = user

    def update(self, user: User) -> None:  # type: ignore[override]
        with self._lock:
            key = _norm_username(user.username)
            if key not in self._users:
                raise AuthError("Cannot update missing user")
            self._users[key] = user
            self._users_by_id[user.id] = user
            self._users_by_email[user.email.lower()] = user


# ============================
# Rate limiting (simple token bucket per username/IP key)
# ============================

@dataclass
class TokenBucket:
    capacity: int
    refill_rate_per_sec: float
    tokens: float = field(default_factory=float)
    last_refill: float = field(default_factory=time.time)

    def allow(self, cost: float = 1.0) -> bool:
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate_per_sec)
        self.last_refill = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False


class RateLimiter:
    def __init__(self, capacity: int = 5, refill_rate_per_sec: float = 0.2):
        self.capacity = capacity
        self.refill = refill_rate_per_sec
        self._buckets: Dict[str, TokenBucket] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> bool:
        with self._lock:
            bucket = self._buckets.get(key)
            if not bucket:
                bucket = TokenBucket(self.capacity, self.refill, self.capacity, time.time())
                self._buckets[key] = bucket
            return bucket.allow(1.0)


# ============================
# Audit log (ring buffer)
# ============================

@dataclass(slots=True)
class AuditEvent:
    at: datetime
    action: str
    username: Optional[str]
    detail: str


class AuditLog:
    def __init__(self, capacity: int = 500):
        self.capacity = capacity
        self._events: List[AuditEvent] = []
        self._lock = threading.Lock()

    def record(self, event: AuditEvent) -> None:
        with self._lock:
            self._events.append(event)
            if len(self._events) > self.capacity:
                self._events.pop(0)

    def list(self) -> List[AuditEvent]:
        with self._lock:
            return list(self._events)


# ============================
# Auth configuration
# ============================

@dataclass
class AuthConfig:
    access_token_ttl: timedelta = timedelta(minutes=15)
    refresh_token_ttl: timedelta = timedelta(days=7)
    min_login_delay_ms: int = 120  # Always wait at least this long before responding
    signing_key_env: str = "DAVID_AUTH_SIGNING_KEY"
    required_scopes_for_admin: Set[str] = field(default_factory=lambda: {"user:delete", "user:create"})
    rotate_refresh_on_use: bool = True

    def get_signing_key(self) -> bytes:
        raw = os.getenv(self.signing_key_env)
        if raw:
            return raw.encode("utf-8")
        # Deterministic fallback for tests; DO NOT use in production.
        return hashlib.sha256(b"david-auth-dev-fallback-key").digest()


# ============================
# Metrics (minimal counters)
# ============================

@dataclass
class Metrics:
    registrations: int = 0
    logins: int = 0
    failed_logins: int = 0
    token_issues: int = 0
    refreshes: int = 0


# ============================
# Token management (HMAC signed compact JSON)
# ============================

class TokenCodec:
    HEADER = {"alg": "HS256", "typ": "david.atk"}

    def __init__(self, signing_key: bytes):
        self.key = signing_key

    def encode(self, claims: AccessTokenClaims) -> str:
        import json as _json
        header_b = base64url(_json.dumps(self.HEADER, separators=(",", ":")).encode())
        payload_b = base64url(claims.to_json().encode())
        signing_input = f"{header_b}.{payload_b}".encode()
        sig = base64url(hmac.new(self.key, signing_input, hashlib.sha256).digest())
        return f"{header_b}.{payload_b}.{sig}"

    def decode(self, token: str) -> AccessTokenClaims:
        try:
            header_b, payload_b, sig_b = token.split(".")
        except ValueError as e:  # pragma: no cover - defensive
            raise TokenError("Malformed token") from e
        signing_input = f"{header_b}.{payload_b}".encode()
        expected = base64url(hmac.new(self.key, signing_input, hashlib.sha256).digest())
        if not constant_time_compare(expected.encode(), sig_b.encode()):
            raise TokenError("Invalid signature")
        import base64, json as _json
        padded = payload_b + "=" * (-len(payload_b) % 4)
        data = base64.urlsafe_b64decode(padded.encode())
        claims = AccessTokenClaims.from_json(data.decode())
        return claims


# ============================
# Auth service (main facade)
# ============================

class AuthService:
    """Facade orchestrating hashing, token issuance, and repositories."""

    def __init__(
        self,
        repo: UserRepository,
        hasher: Optional[PasswordHasher] = None,
        config: Optional[AuthConfig] = None,
        clock: Optional[Clock] = None,
        rate_limiter: Optional[RateLimiter] = None,
        audit: Optional[AuditLog] = None,
    ):
        self.repo = repo
        self.hasher = hasher or PasswordHasher()
        self.config = config or AuthConfig()
        self.clock = clock or Clock()
        self.codec = TokenCodec(self.config.get_signing_key())
        self.rate_limiter = rate_limiter or RateLimiter()
        self.audit = audit or AuditLog()
        self.metrics = Metrics()

    # ---- Registration ----
    def register_user(self, username: str, email: str, password: str, roles: Optional[Iterable[str]] = None) -> User:
        start = time.time()
        uname = _norm_username(username)
        if not uname:
            raise AuthError("Username cannot be empty")
        if not validate_email(email):
            raise AuthError("Invalid email format")
        enforce_password_policy(password)
        pwd_hash = self.hasher.hash(password)
        
        user = User(
            id=self.repo._next_id(),
            username=uname,
            email=email.strip().lower(),
            password_hash=pwd_hash,
            roles=set(roles) if roles else {"user"},
            created_at=self.clock.now()
        )
        
        self.repo.add(user)
        self.metrics.registrations += 1
        self.audit.record(AuditEvent(self.clock.now(), "register", uname, "user created"))
        self._ensure_min_delay(start)
        return user
    
    def _emit_event(self, event_type: str, username: str, detail: str = ""):
        """Emit an audit event."""
        self.audit.record(AuditEvent(self.clock.now(), event_type, username, detail))

    # ---- Login ----
    def login(self, username: str, password: str, ip: str = "0.0.0.0") -> LoginResult:
        start = time.time()
        key = f"login:{_norm_username(username)}:{ip}"
        if not self.rate_limiter.check(key):
            self.audit.record(AuditEvent(self.clock.now(), "login.rate_limited", username, ip))
            raise InvalidCredentials("Invalid credentials")  # hide rate limit detail
        user = self.repo.get(username)
        if not user:
            self.metrics.failed_logins += 1
            self.audit.record(AuditEvent(self.clock.now(), "login.fail", username, "user missing"))
            self._ensure_min_delay(start)
            raise InvalidCredentials("Invalid credentials")
        if not self.hasher.verify(password, user.password_hash):
            self.metrics.failed_logins += 1
            self.audit.record(AuditEvent(self.clock.now(), "login.fail", username, "bad password"))
            self._ensure_min_delay(start)
            raise InvalidCredentials("Invalid credentials")
        
        # Update last login
        user.last_login = self.clock.now()
        
        jwt = self._issue_access_token(user)
        refresh_token, refresh_id = self._issue_refresh_token(user)
        user.refresh_tokens[refresh_id] = self.clock.now() + self.config.refresh_token_ttl
        self.repo.update(user)
        self.metrics.logins += 1
        self.audit.record(AuditEvent(self.clock.now(), "login.success", user.username, ""))
        self._ensure_min_delay(start)
        
        return LoginResult(
            access_token=jwt,
            refresh_token=refresh_token,
            user_id=user.id,
            username=user.username,
            roles=user.roles
        )

    # ---- Token issuance ----
    def _issue_access_token(self, user: User) -> str:
        now = self.clock.now()
        iat = int(now.timestamp())
        exp = int((now + self.config.access_token_ttl).timestamp())
        token_id = base64url(default_entropy(12))
        claims = AccessTokenClaims(
            sub=user.username,
            iat=iat,
            exp=exp,
            roles=sorted(user.roles),
            permissions=sorted(user.all_permissions()),
            token_id=token_id,
            user_id=user.id,
            username=user.username
        )
        token = self.codec.encode(claims)
        self.metrics.token_issues += 1
        return token

    def _issue_refresh_token(self, user: User) -> Tuple[str, str]:
        token_id = base64url(default_entropy(18))
        expiry = self.clock.now() + self.config.refresh_token_ttl
        # server side map holds expiry, but for demonstration we embed minimal info
        payload = json.dumps({"rid": token_id, "exp": int(expiry.timestamp())}, separators=(",", ":"))
        sig = base64url(hmac.new(self.config.get_signing_key(), payload.encode(), hashlib.sha256).digest())
        return f"r.{base64url(payload.encode())}.{sig}", token_id

    # ---- Refresh flow ----
    def refresh(self, refresh_token: str) -> LoginResult:
        start = time.time()
        try:
            prefix, payload_b64, sig = refresh_token.split(".")
            if prefix != "r":
                raise TokenError("Not a refresh token")
            import base64
            payload_raw = base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4))
            expected = base64url(
                hmac.new(self.config.get_signing_key(), payload_raw, hashlib.sha256).digest()
            )
            if not constant_time_compare(expected.encode(), sig.encode()):
                raise TokenError("Bad refresh signature")
            data = json.loads(payload_raw)
            rid = data["rid"]
            exp_ts = data["exp"]
        except Exception as e:  # pragma: no cover - defensive
            raise TokenError("Malformed refresh token") from e
        if int(time.time()) > exp_ts:
            raise TokenError("Refresh expired")
        # naive linear search (fine for in-memory toy example)
        user = None
        for candidate_name in [u for u in getattr(self.repo, "_users", {})]:  # type: ignore[attr-defined]
            candidate = self.repo.get(candidate_name)
            if candidate and rid in candidate.refresh_tokens:
                user = candidate
                break
        if not user:
            raise TokenError("Unknown refresh token")
        if self.config.rotate_refresh_on_use:
            # Revoke old
            user.refresh_tokens.pop(rid, None)
        jwt, claims = self._issue_access_token(user)
        new_refresh, new_rid = self._issue_refresh_token(user)
        user.refresh_tokens[new_rid] = 0
        self.repo.update(user)
        self.metrics.refreshes += 1
        self.audit.record(AuditEvent(self.clock.now(), "refresh", user.username, "rotated"))
        self._ensure_min_delay(start)
        return LoginResult(jwt, new_refresh, user.username, datetime.fromtimestamp(claims.exp, tz=timezone.utc))

    # ---- Verification ----
    def verify_access_token(self, token: str) -> AccessTokenClaims:
        claims = self.codec.decode(token)
        now_ts = int(self.clock.now().timestamp())
        if claims.exp < now_ts:
            raise TokenError("Expired access token")
        return claims

    # ---- Permission check ----
    def require(self, token: str, permission: str) -> AccessTokenClaims:
        claims = self.verify_access_token(token)
        if permission not in claims.permissions:
            raise PermissionDenied(permission)
        return claims

    def assign_role(self, username: str, role: str) -> None:
        user = self.repo.get(username)
        if not user:
            raise AuthError("User not found")
        user.roles.add(role)
        self.repo.update(user)
        self.audit.record(AuditEvent(self.clock.now(), "assign_role", username, role))

    def grant_permission(self, username: str, permission: str) -> None:
        user = self.repo.get(username)
        if not user:
            raise AuthError("User not found")
        user.permissions.add(permission)
        self.repo.update(user)
        self.audit.record(AuditEvent(self.clock.now(), "grant_permission", username, permission))

    # ---- Metrics / audit introspection ----
    def snapshot_metrics(self) -> Dict[str, int]:
        return self.metrics.__dict__.copy()

    def recent_audit(self) -> List[AuditEvent]:
        return self.audit.list()

    # ---- Helpers ----
    def _ensure_min_delay(self, start: float) -> None:
        elapsed_ms = (time.time() - start) * 1000
        remain = self.config.min_login_delay_ms - elapsed_ms
        if remain > 1:
            time.sleep(remain / 1000)


# ============================
# Demonstration helper (public facade wrapper)
# ============================

_GLOBAL_REPO = InMemoryUserRepository()
_GLOBAL_AUTH = AuthService(_GLOBAL_REPO)


def demo_register_and_login(username: str, email: str, password: str) -> LoginResult:
    """Utility for quick experimentation in REPL / examples."""
    if not _GLOBAL_REPO.get(username):
        _GLOBAL_AUTH.register_user(username, email, password)
    return _GLOBAL_AUTH.login(username, password)


def describe_user(username: str) -> Dict[str, Any]:
    u = _GLOBAL_REPO.get(username)
    if not u:
        raise AuthError("User not found")
    return {
        "username": u.username,
        "email": u.email,
        "roles": sorted(u.roles),
        "permissions": sorted(u.all_permissions()),
        "created_at": u.created_at.isoformat(),
    }


# ============================
# Self-test (manual) section - executed only if run directly
# ============================

if __name__ == "__main__":  # pragma: no cover
    auth = AuthService(InMemoryUserRepository())
    print("[demo] registering user ...")
    auth.register_user("demo", "demo@example.com", "Sup3rStr0ng!PW")
    print("[demo] logging in ...")
    res = auth.login("demo", "Sup3rStr0ng!PW")
    print("Access token:", res.access_token)
    claims = auth.verify_access_token(res.access_token)
    print("Claims:", claims)
    print("Metrics:", auth.snapshot_metrics())