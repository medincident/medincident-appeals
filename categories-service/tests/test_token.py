import json

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from service.token import ServiceTokenProvider


@pytest.fixture
def key_file(tmp_path):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    path = tmp_path / "key.json"
    path.write_text(json.dumps({
        "type": "application",
        "keyId": "kid-123",
        "key": pem,
        "userId": "service-user-1",
    }))
    return str(path), public_pem


@pytest.mark.asyncio
async def test_builds_verifiable_assertion_and_caches(monkeypatch, key_file):
    key_path, public_pem = key_file
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        body = dict(httpx.QueryParams(request.content.decode()))
        captured.update(body)
        captured["calls"] = captured.get("calls", 0) + 1
        return httpx.Response(200, json={"access_token": "tok-1", "expires_in": 3600})

    _patch_async_client(monkeypatch, handler)

    provider = ServiceTokenProvider(
        issuer="https://issuer.test", machine_key_path=key_path, project_id="proj-1"
    )
    token = await provider.get_token()
    assert token == "tok-1"

    # grant type + assertion проверяемы публичным ключом
    assert captured["grant_type"] == "urn:ietf:params:oauth:grant-type:jwt-bearer"
    decoded = jwt.decode(captured["assertion"], public_pem, algorithms=["RS256"], audience="https://issuer.test")
    assert decoded["iss"] == "service-user-1"
    assert decoded["sub"] == "service-user-1"

    # scope содержит project-audience
    assert "urn:zitadel:iam:org:project:id:proj-1:aud" in captured["scope"]

    # кэш: второй вызов не бьёт endpoint
    await provider.get_token()
    assert captured["calls"] == 1


def _patch_async_client(monkeypatch, handler):
    real_init = httpx.AsyncClient.__init__

    def patched_init(self, *args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        real_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)
