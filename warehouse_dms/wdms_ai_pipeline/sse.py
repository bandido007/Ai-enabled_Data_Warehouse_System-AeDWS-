"""
Server-Sent Event Publishing and Streaming

The Celery worker publishes JSON events to a Redis channel named
after the upload attempt. The Django view subscribes to that channel
and forwards events to the frontend as SSE messages.

Event format:
    event: progress | error | complete
    data: {"stage": "ocr", "status": "done", "message": "...", "details": {...}}
"""

import json
import logging
from typing import Iterator
import redis
from django.conf import settings
from django.http import StreamingHttpResponse

logger = logging.getLogger("wdms_logger")


def _redis_client():
    return redis.Redis.from_url(
        settings.CELERY_BROKER_URL, decode_responses=True
    )


_EVENTS_TTL = 300  # seconds — keep event history long enough for the client to reconnect


def _store_event(client, attempt_id: int, payload: dict):
    """Persist event to a Redis list so the fast-path can replay it."""
    list_key = f"upload_events:{attempt_id}"
    try:
        client.rpush(list_key, json.dumps(payload))
        client.expire(list_key, _EVENTS_TTL)
    except Exception as e:
        logger.warning(f"Failed to store event for {list_key}: {e}")


def publish_progress(attempt_id: int, stage: str, status: str, message: str, **details):
    """Called by Celery workers to push progress to the SSE stream."""
    channel = f"upload:{attempt_id}"
    payload = {
        "stage": stage,
        "status": status,
        "message": message,
        "details": details,
    }
    try:
        client = _redis_client()
        _store_event(client, attempt_id, payload)
        client.publish(channel, json.dumps(payload))
    except Exception as e:
        logger.error(f"Failed to publish to {channel}: {e}")


def publish_complete(attempt_id: int, outcome: str, warnings: list = None):
    """Called at the end of validation to signal the final outcome."""
    channel = f"upload:{attempt_id}"
    payload = {
        "stage": "final",
        "status": "complete",
        "outcome": outcome,  # "HARD_REJECT" | "SOFT_WARNING" | "PASSED"
        "warnings": warnings or [],
    }
    try:
        client = _redis_client()
        _store_event(client, attempt_id, payload)
        client.publish(channel, json.dumps(payload))
    except Exception as e:
        logger.error(f"Failed to publish_complete to {channel}: {e}")


def stream_upload_progress(attempt_id: int) -> StreamingHttpResponse:
    """
    Django view helper: subscribe to the attempt's Redis channel
    and stream events to the client as SSE.

    Fast-path: if the attempt is already past PENDING (e.g. the Celery task
    finished before the client opened the stream), immediately yield a
    "complete" event so the client doesn't hang waiting for a message that
    was already published and lost.
    """

    def event_stream() -> Iterator[str]:
        # ── Fast-path: attempt already finished ────────────────────────────
        # Replay all stored events from the Redis list so the client sees
        # the full OCR + validation progress even when the worker finished
        # before this stream was opened.
        try:
            from wdms_documents.models import UploadAttempt, UploadAttemptStatus
            attempt = UploadAttempt.objects.get(pk=attempt_id)
            if attempt.validation_status != UploadAttemptStatus.PENDING:
                client = _redis_client()
                list_key = f"upload_events:{attempt_id}"
                stored = client.lrange(list_key, 0, -1) or []
                for raw in stored:
                    try:
                        parsed = json.loads(raw)
                    except Exception:
                        continue
                    evt_name = "complete" if parsed.get("status") == "complete" else "progress"
                    yield f"event: {evt_name}\ndata: {raw}\n\n"
                # If no stored events (old data), fall back to synthesising the complete event
                if not stored:
                    outcome = attempt.validation_status
                    warnings = attempt.validation_warnings or []
                    payload = json.dumps({
                        "stage": "final",
                        "status": "complete",
                        "outcome": outcome,
                        "warnings": warnings,
                    })
                    yield f"event: complete\ndata: {payload}\n\n"
                return
        except Exception:
            pass  # Fall through to live-subscribe

        client = _redis_client()
        pubsub = client.pubsub()
        channel = f"upload:{attempt_id}"
        pubsub.subscribe(channel)

        # Send an initial event so the client knows the stream is open
        yield "event: connected\ndata: {}\n\n"

        try:
            for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                payload = message["data"]
                try:
                    parsed = json.loads(payload)
                except Exception:
                    continue

                event_name = "complete" if parsed.get("status") == "complete" else "progress"
                yield f"event: {event_name}\ndata: {payload}\n\n"

                # Close the stream after the final event
                if parsed.get("status") == "complete":
                    break
        finally:
            pubsub.unsubscribe(channel)
            pubsub.close()

    response = StreamingHttpResponse(
        event_stream(),
        content_type="text/event-stream",
    )
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"  # Disable nginx buffering
    return response
