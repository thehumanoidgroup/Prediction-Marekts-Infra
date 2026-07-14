"""Tests for live feed update batching."""

import pytest

from realtime.update_batcher import UpdateBatcher


@pytest.mark.asyncio
async def test_batcher_coalesces_duplicate_event_updates():
    batcher = UpdateBatcher()
    message_a = {
        "type": "price_update",
        "event_id": "evt-1",
        "data": {"probabilities": {"yes": 0.55}},
        "_rooms": ["all"],
    }
    message_b = {
        "type": "price_update",
        "event_id": "evt-1",
        "data": {"probabilities": {"yes": 0.57}},
        "_rooms": ["all"],
    }

    await batcher.enqueue("app", message_a)
    await batcher.enqueue("app", message_b)

    async with batcher._lock:
        pending = batcher._pending["app"]

    assert len(pending) == 1
    assert pending["evt-1"]["data"]["probabilities"]["yes"] == 0.57


@pytest.mark.asyncio
async def test_batcher_skips_tiny_price_changes():
    batcher = UpdateBatcher()
    batcher._last_sent_price["evt-2"] = 0.55

    await batcher.enqueue(
        "app",
        {
            "type": "price_update",
            "event_id": "evt-2",
            "data": {"probabilities": {"yes": 0.552}},
            "_rooms": ["all"],
        },
    )

    async with batcher._lock:
        assert "app" not in batcher._pending or len(batcher._pending.get("app", {})) == 0


@pytest.mark.asyncio
async def test_batcher_flush_emits_batch_update(monkeypatch):
    batcher = UpdateBatcher()
    sent: list[tuple[str, dict]] = []

    async def fake_broadcast(tenant_slug: str, message: dict, *, rooms=None) -> None:
        sent.append((tenant_slug, message))

    monkeypatch.setattr("realtime.update_batcher.manager.broadcast", fake_broadcast)

    await batcher.enqueue(
        "app",
        {"type": "price_update", "event_id": "evt-1", "data": {"probabilities": {"yes": 0.5}}, "_rooms": ["all"]},
    )
    await batcher.enqueue(
        "app",
        {"type": "status_change", "event_id": "evt-2", "data": {"status": "open"}, "_rooms": ["all"]},
    )
    await batcher.flush()

    assert len(sent) == 1
    tenant, payload = sent[0]
    assert tenant == "app"
    assert payload["type"] == "batch_update"
    assert len(payload["updates"]) == 2
