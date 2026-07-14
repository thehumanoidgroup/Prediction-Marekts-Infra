"""REST endpoints for live prediction events."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.live_event import LiveEvent
from app.schemas.live_event import (
    EventUpdateResponse,
    LiveEventListResponse,
    LiveEventResponse,
    UpdateProbabilityBody,
)
from services.live_event_service import LiveEventService, get_live_event_service
from services.live_feed_analytics import analytics

router = APIRouter(prefix="/live-events", tags=["live-events"])

LiveEventSourceFilter = Literal["all", "internal", "polymarket", "external"]


def _service(db: Annotated[AsyncSession, Depends(get_db)]) -> LiveEventService:
    return get_live_event_service(db)


@router.get("", response_model=LiveEventListResponse)
async def list_live_events(
    service: Annotated[LiveEventService, Depends(_service)],
    category: str = Query("all"),
    source: LiveEventSourceFilter = Query(
        "all",
        description="Filter by liquidity source: internal LMSR, polymarket, or all",
    ),
) -> LiveEventListResponse:
    events, counts = await service.get_combined_feed(category=category, source=source)

    return LiveEventListResponse(
        events=[LiveEventResponse.model_validate(event) for event in events],
        count=len(events),
        counts=counts,
        source=source,
    )


@router.get("/{event_id}", response_model=LiveEventResponse)
async def get_live_event(
    event_id: str,
    service: Annotated[LiveEventService, Depends(_service)],
) -> LiveEventResponse:
    events, _ = await service.get_combined_feed()
    match = next(
        (event for event in events if event.id == event_id or event.external_id == event_id),
        None,
    )
    if match is None:
        raise HTTPException(404, detail="Live event not found")
    return LiveEventResponse.model_validate(match)


@router.post("/{event_id}/view", status_code=status.HTTP_204_NO_CONTENT)
async def record_event_view(event_id: str, service: Annotated[LiveEventService, Depends(_service)]) -> None:
    event = await service._resolve_event(event_id)
    if event is None:
        raise HTTPException(404, detail="Live event not found")
    analytics.record_event_view(event.id)


@router.post("/{event_id}/probability", response_model=LiveEventResponse)
async def update_probability(
    event_id: str,
    body: UpdateProbabilityBody,
    service: Annotated[LiveEventService, Depends(_service)],
) -> LiveEventResponse:
    event = await service.update_event_probability(
        event_id,
        body.probabilities,
        volume_delta=body.volume_delta,
    )
    if event is None:
        raise HTTPException(404, detail="Live event not found")

    return LiveEventResponse.model_validate(event)


@router.get("/{event_id}/updates", response_model=list[EventUpdateResponse])
async def list_event_updates(
    event_id: str,
    service: Annotated[LiveEventService, Depends(_service)],
    limit: int = Query(50, ge=1, le=200),
) -> list[EventUpdateResponse]:
    result = await service.db.execute(
        select(LiveEvent)
        .options(selectinload(LiveEvent.updates))
        .where(
            (LiveEvent.id == event_id) | (LiveEvent.external_id == event_id)
        )
    )
    match = result.scalar_one_or_none()
    if match is None:
        raise HTTPException(404, detail="Live event not found")

    updates = sorted(match.updates, key=lambda u: u.recorded_at, reverse=True)[:limit]
    return [EventUpdateResponse.model_validate(update) for update in updates]
