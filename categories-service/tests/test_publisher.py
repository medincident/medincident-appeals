import pytest

from service.publisher import publish_if_changed, serialize


class FakeEntry:
    def __init__(self, value, revision=1):
        self.value = value
        self.revision = revision


class FakeKV:
    """Минимальный KV с put/get как у nats.js KeyValue."""

    def __init__(self, initial=None):
        self._store = dict(initial or {})
        self._revision = len(self._store)
        self.put_calls = 0

    async def get(self, key):
        if key not in self._store:
            raise KeyError(key)  # имитирует KeyNotFoundError
        return FakeEntry(self._store[key], self._revision)

    async def put(self, key, value):
        self._store[key] = value
        self._revision += 1
        self.put_calls += 1
        return self._revision


CATS = [{"id": "c1", "name": "C1", "description": "", "subcategories": [{"id": "t1", "name": "T1", "description": ""}]}]


@pytest.mark.asyncio
async def test_publishes_when_key_absent():
    kv = FakeKV()
    published = await publish_if_changed(kv, "categories", CATS)
    assert published is True
    assert kv.put_calls == 1


@pytest.mark.asyncio
async def test_skips_when_unchanged():
    kv = FakeKV({"categories": serialize(CATS)})
    published = await publish_if_changed(kv, "categories", CATS)
    assert published is False
    assert kv.put_calls == 0


@pytest.mark.asyncio
async def test_publishes_when_changed():
    kv = FakeKV({"categories": serialize(CATS)})
    changed = [{"id": "c1", "name": "CHANGED", "description": "", "subcategories": []}]
    published = await publish_if_changed(kv, "categories", changed)
    assert published is True
    assert kv.put_calls == 1


@pytest.mark.asyncio
async def test_does_not_publish_empty():
    kv = FakeKV({"categories": serialize(CATS)})
    published = await publish_if_changed(kv, "categories", [])
    assert published is False
    assert kv.put_calls == 0
