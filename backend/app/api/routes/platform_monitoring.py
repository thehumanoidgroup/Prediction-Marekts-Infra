"""SuperAdmin monitoring for live feed connections and analytics."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.live_event import LiveEventResponse
from app.ws.manager import manager
from services.live_feed_analytics import analytics
from services.live_event_service import get_live_event_service

router = APIRouter(prefix="/platform/live-feed", tags=["platform-monitoring"])


@router.get("")
async def get_live_feed_monitor(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Connection stats, engagement analytics, and active live events.

    Gated to SuperAdmin in production via API gateway / JWT middleware.
    """
    service = get_live_event_service(db)
    events, counts = await service.get_combined_feed(sync=False)

    enriched_top = []
    for item in analytics.top_viewed_events(limit=10):
        match = next((event for event in events if event.id == item["event_id"]), None)
        enriched_top.append(
            {
                **item,
                "question": match.question if match else None,
                "external_id": match.external_id if match else None,
                "category": match.category if match else None,
                "source": match.source.value if match else None,
            }
        )

    return {
        "connections": await manager.connection_stats_async(),
        "analytics": {
            **analytics.snapshot(),
            "top_viewed_events": enriched_top,
        },
        "events": {
            "count": len(events),
            "counts_by_source": counts,
            "active": [LiveEventResponse.model_validate(event) for event in events[:25]],
        },
    }
