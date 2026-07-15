"""Backend service layer (outside FastAPI app package)."""

from services.live_event_service import LiveEventService, get_live_event_service

__all__ = ["LiveEventService", "get_live_event_service"]
