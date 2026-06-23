"""Redis caching + rate-limiting helpers (fail-open if Redis is unavailable)."""

from __future__ import annotations

import functools
import hashlib
import json
import os

import redis

_client = None


def client():
    global _client
    if _client is None:
        _client = redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True
        )
    return _client


def cached(ttl: int = 3600, prefix: str = "mfp"):
    """Cache a function's JSON-serialisable return value in Redis for `ttl` seconds."""
    def deco(fn):
        @functools.wraps(fn)
        def wrap(*args, **kwargs):
            key = f"{prefix}:{fn.__name__}:" + hashlib.md5(
                json.dumps([args, kwargs], default=str, sort_keys=True).encode()
            ).hexdigest()
            r = None
            try:
                r = client()
                hit = r.get(key)
                if hit is not None:
                    return json.loads(hit)
            except Exception:
                r = None
            result = fn(*args, **kwargs)
            try:
                if r is not None:
                    r.setex(key, ttl, json.dumps(result, default=str))
            except Exception:
                pass
            return result
        return wrap
    return deco


def flush(prefix: str = "mfp") -> int:
    try:
        r = client()
        keys = r.keys(f"{prefix}:*")
        if keys:
            r.delete(*keys)
        return len(keys)
    except Exception:
        return 0


def allow(identity: str, limit: int = 60, window: int = 60) -> bool:
    """Fixed-window rate limit. Returns True if the request is allowed."""
    try:
        r = client()
        bucket = f"mfp:rl:{identity}"
        n = r.incr(bucket)
        if n == 1:
            r.expire(bucket, window)
        return n <= limit
    except Exception:
        return True  # fail open — never block traffic because Redis is down
