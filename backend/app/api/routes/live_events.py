"""REST endpoints for live prediction events."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
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

router = APIRouter(prefix="/live-events", tags=["live-events"])


def _service(db: Annotated[AsyncSession, Depends(get_db)]) -> LiveEventService:
    return get_live_event_service(db)


@router.get("", response_model=LiveEventListResponse)
async def list_live_events(
    service: Annotated[LiveEventService, Depends(_service)],
    category: str = Query("all"),
) -> LiveEventListResponse:
    if category == "all":
        events = await service.get_all_live_events()
    else:
        events = await service.get_events_by_category(category)

    return LiveEventListResponse(
        events=[LiveEventResponse.model_validate(event) for event in events],
        count=len(events),
    )


@router.get("/{event_id}", response_model=LiveEventResponse)
async def get_live_event(
    event_id: str,
    service: Annotated[LiveEventService, Depends(_service)],
) -> LiveEventResponse:
    events = await service.get_all_live_events()
    match = next(
        (event for event in events if event.id == event_id or event.external_id == event_id),
        None,
    )
    if match is None:
        raise HTTPException(404, detail="Live event not found")
    return LiveEventResponse.model_validate(match)


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

    await service.broadcast_event_update(
        event.id,
        {
            "probabilities": event.probabilities,
            "volume": event.volume,
            "volume_24h": event.volume_24h,
            "change_24h": event.change_24h,
        },
    )
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
