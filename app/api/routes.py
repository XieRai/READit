"""
API routes – /api/lens and /api/prebake
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.llm_service import LLMService

router = APIRouter(prefix="/api")

# Singleton service instance
_llm = LLMService()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class LensRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Selected text passage")
    lens_type: str = Field(..., description="One of: intuition, eli5, math")
    context: dict[str, Any] | None = Field(
        default=None,
        description="Optional surrounding context (section title, equation id, etc.)",
    )


class LensResponse(BaseModel):
    success: bool
    lens_type: str
    explanation: str


class PrebakeRequest(BaseModel):
    paper_id: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)


class PrebakeResponse(BaseModel):
    success: bool
    symbols: dict[str, Any] = Field(default_factory=dict)
    anchors: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/lens", response_model=LensResponse)
async def resolve_lens(payload: LensRequest) -> LensResponse:
    """Return an explanation of *text* through the requested lens perspective."""
    result = await _llm.resolve_lens(
        text=payload.text,
        lens_type=payload.lens_type,
        context=payload.context,
    )
    return LensResponse(**result)


@router.post("/prebake", response_model=PrebakeResponse)
async def prebake_paper(payload: PrebakeRequest) -> PrebakeResponse:
    """Pre-compute a symbol table and anchor map for a paper."""
    result = await _llm.prebake_paper(paper_content=payload.content)
    return PrebakeResponse(**result)
