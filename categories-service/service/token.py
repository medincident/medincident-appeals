from __future__ import annotations

import asyncio
import json
import logging
import time

import httpx
import jwt

logger = logging.getLogger(__name__)

ASSERTION_LIFETIME = 60  # сек
SKEW = 60  # сек запаса до истечения access-токена


class ServiceTokenProvider:
    """JWT-Bearer profile grant к Zitadel (как custom-ui access-token.ts).

    Читает machine key.json (key/userId/keyId), подписывает RS256-assertion,
    меняет на access_token. Токен service-юзера проходит introspection
    medincident-backend (sub=userId) → authz.Authenticated. Кэширует до истечения.
    """

    def __init__(
        self,
        issuer: str,
        machine_key_path: str,
        project_id: str,
        request_timeout: float = 10.0,
    ) -> None:
        self.issuer = issuer.rstrip("/")
        self.machine_key_path = machine_key_path
        self.project_id = project_id
        self.request_timeout = request_timeout
        self._key: dict | None = None
        self._token: str | None = None
        self._expires_at: float = 0.0
        self._lock = asyncio.Lock()

    async def get_token(self) -> str:
        if self._token and time.time() < self._expires_at:
            return self._token
        async with self._lock:
            if self._token and time.time() < self._expires_at:
                return self._token
            token, expires_in = await self._request()
            self._token = token
            self._expires_at = time.time() + max(0, expires_in - SKEW)
            return token

    def _load_key(self) -> dict:
        if self._key is None:
            with open(self.machine_key_path, encoding="utf-8") as f:
                key = json.load(f)
            if not key.get("key") or not key.get("userId") or not key.get("keyId"):
                raise RuntimeError(f"Invalid Zitadel machine key file: {self.machine_key_path}")
            self._key = key
        return self._key

    def _sign_assertion(self) -> str:
        key = self._load_key()
        now = int(time.time())
        return jwt.encode(
            {
                "iss": key["userId"],
                "sub": key["userId"],
                "aud": self.issuer,
                "iat": now,
                "exp": now + ASSERTION_LIFETIME,
            },
            key["key"],
            algorithm="RS256",
            headers={"kid": key["keyId"]},
        )

    async def _request(self) -> tuple[str, int]:
        scope = " ".join(
            [
                "openid",
                "urn:zitadel:iam:org:project:id:zitadel:aud",
                f"urn:zitadel:iam:org:project:id:{self.project_id}:aud",
            ]
        )
        data = {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": self._sign_assertion(),
            "scope": scope,
        }
        async with httpx.AsyncClient(timeout=self.request_timeout) as client:
            resp = await client.post(f"{self.issuer}/oauth/v2/token", data=data)
            resp.raise_for_status()
            body = resp.json()
        token = body.get("access_token")
        if not token:
            raise RuntimeError("Zitadel token endpoint returned no access_token")
        return token, int(body.get("expires_in", 3600))
