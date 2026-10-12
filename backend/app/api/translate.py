"""Machine translation proxy for the UI language switcher.

Why this exists on the server rather than in the browser: the BHASHINI key has
to travel in an `Authorization` header, and anything the browser sends is
visible to anyone who opens devtools. `NEXT_PUBLIC_*` values are inlined into
the JS bundle at build time, so a key placed there is published, not configured.
The client posts strings here and never sees a credential.

The contract below was verified against the live service, not copied from docs:

    POST https://dhruva-api.bhashini.gov.in/services/inference/pipeline
    Authorization: <inference key>
    {"pipelineTasks":[{"taskType":"translation",
      "config":{"language":{"sourceLanguage":"en","targetLanguage":"hi"},
                "serviceId":"bhashini/iiith/nmt-all"}}],
     "inputData":{"input":[{"source":"..."}]}}
    -> {"pipelineResponse":[{"output":[{"source":"...","target":"..."}]}]}

Two things that cost a wrong guess and are now pinned by test: the language
field names are `sourceLanguage`/`targetLanguage` (not `source`/`target`), the
codes are 2-letter ISO (`hi`, not `hin` — `hin` returns HTTP 500), and
`serviceId` lives inside `config`, not as a top-level `pipelineId`.

This is a neural machine translation model. It is not a language model
conversing with anyone, and nothing here generates prose the input did not
contain.
"""
from __future__ import annotations

import time
from typing import Literal, get_args

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/translate", tags=["translate"])

# Verified live against bhashini/iiith/nmt-all. Anything outside this list is a
# 400 rather than a round trip to an upstream that would answer 500.
TargetLanguage = Literal[
    "hi", "ta", "bn", "ml", "kn", "te", "mr", "gu", "pa", "or", "as", "ur",
]

MAX_TEXTS = 120
MAX_CHARS_PER_TEXT = 400
CACHE_MAX_ENTRIES = 4000

# (target, source_text) -> translated text. Bounded below by eviction.
_cache: dict[tuple[str, str], str] = {}
# Counters that let the UI say how much came from upstream vs cache.
_stats = {"upstream_calls": 0, "upstream_failures": 0}


class TranslateRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=MAX_TEXTS)
    target: TargetLanguage


class TranslateResponse(BaseModel):
    target: str
    source_language: str
    model: str
    translated: dict[str, str]
    requested: int
    returned: int
    from_cache: int
    took_ms: int


def _configured() -> bool:
    return bool(settings.bhashini_inference_api_key)


def _cached(target: str, text: str) -> str | None:
    return _cache.get((target, text))


def _remember(target: str, text: str, translation: str) -> None:
    if len(_cache) >= CACHE_MAX_ENTRIES:
        # Insertion order is the eviction order: a bounded dict, not an
        # unbounded memory leak on a long-lived container.
        for key in list(_cache.keys())[: CACHE_MAX_ENTRIES // 2]:
            _cache.pop(key, None)
    _cache[(target, text)] = translation


async def _translate_upstream(texts: list[str], target: str) -> dict[str, str]:
    """One batched upstream call. BHASHINI returns outputs in request order."""
    payload = {
        "pipelineTasks": [
            {
                "taskType": "translation",
                "config": {
                    "language": {"sourceLanguage": "en", "targetLanguage": target},
                    "serviceId": settings.bhashini_translation_service_id,
                },
            }
        ],
        "inputData": {"input": [{"source": text} for text in texts]},
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": settings.bhashini_inference_api_key or "",
    }
    # The Udyat key is registered for the platform; the inference endpoint
    # authenticates on Authorization alone, verified by calling it without this
    # header and still getting HTTP 200. Sent when present, never required.
    if settings.bhashini_udyat_key:
        headers["x-api-key"] = settings.bhashini_udyat_key

    _stats["upstream_calls"] += 1
    try:
        async with httpx.AsyncClient(timeout=settings.bhashini_timeout_seconds) as client:
            response = await client.post(
                settings.bhashini_inference_url, json=payload, headers=headers
            )
    except httpx.HTTPError as error:
        _stats["upstream_failures"] += 1
        raise HTTPException(
            status_code=502,
            detail=f"Translation service unreachable: {type(error).__name__}",
        ) from error

    if response.status_code != 200:
        _stats["upstream_failures"] += 1
        # The upstream body can echo request fragments; do not forward it whole.
        raise HTTPException(
            status_code=502,
            detail=f"Translation service returned HTTP {response.status_code}",
        )

    try:
        outputs = response.json()["pipelineResponse"][0]["output"]
    except (ValueError, KeyError, IndexError, TypeError) as error:
        _stats["upstream_failures"] += 1
        raise HTTPException(
            status_code=502, detail="Translation service returned an unexpected shape"
        ) from error

    result: dict[str, str] = {}
    for item in outputs:
        source = item.get("source")
        target_text = item.get("target")
        if isinstance(source, str) and isinstance(target_text, str) and target_text:
            result[source] = target_text
    return result


@router.post("", response_model=TranslateResponse)
async def translate(
    body: TranslateRequest,
    _user=Depends(get_current_user),
):
    """Translate UI strings from English into `target`.

    Requires a session: without one this endpoint would be an anonymously
    callable proxy onto a quota-metered government API.
    """
    if not _configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Translation is not configured on this server. Set "
                "BHASHINI_INFERENCE_API_KEY on the backend service."
            ),
        )

    cleaned: list[str] = []
    for text in body.texts:
        stripped = text.strip()
        if not stripped:
            continue
        if len(stripped) > MAX_CHARS_PER_TEXT:
            raise HTTPException(
                status_code=400,
                detail=f"Text too long: {len(stripped)} chars, limit is {MAX_CHARS_PER_TEXT}",
            )
        if stripped not in cleaned:
            cleaned.append(stripped)

    if not cleaned:
        return TranslateResponse(
            target=body.target,
            source_language="en",
            model=settings.bhashini_translation_service_id,
            translated={},
            requested=len(body.texts),
            returned=0,
            from_cache=0,
            took_ms=0,
        )

    started = time.perf_counter()
    from_cache = 0
    missing: list[str] = []
    translated: dict[str, str] = {}

    for text in cleaned:
        hit = _cached(body.target, text)
        if hit is None:
            missing.append(text)
        else:
            translated[text] = hit
            from_cache += 1

    if missing:
        upstream = await _translate_upstream(missing, body.target)
        for text in missing:
            value = upstream.get(text)
            if value is None:
                # A dropped item is reported by its absence; the UI keeps the
                # English source rather than showing an empty label.
                continue
            _remember(body.target, text, value)
            translated[text] = value

    return TranslateResponse(
        target=body.target,
        source_language="en",
        model=settings.bhashini_translation_service_id,
        translated=translated,
        requested=len(body.texts),
        returned=len(translated),
        from_cache=from_cache,
        took_ms=int((time.perf_counter() - started) * 1000),
    )


@router.get("/languages")
async def languages(_user=Depends(get_current_user)):
    """Which targets this deployment can actually serve right now.

    The switcher renders from this so it cannot offer a language the server
    would then fail to translate.
    """
    return {
        "source_language": "en",
        "configured": _configured(),
        "model": settings.bhashini_translation_service_id,
        "targets": list(get_args(TargetLanguage)),
    }
