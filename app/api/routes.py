"""
API routes – /api/lens and /api/prebake
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.llm_service import LLMService
from app.services.pdf_parser import PdfParserService
from app.services.reconstruct_service import ReconstructService
from app.services.ai_reconstruct_service import AiReconstructService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# Singleton service instances
_llm = LLMService()
_pdf_parser = PdfParserService()
_reconstruct = ReconstructService()
_ai_reconstruct = AiReconstructService()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class LensRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Selected text passage")
    lens_type: str = Field(..., description="One of: intuition, translating_idea, quick_reference, easy_citation, eli5, math")
    language: str = Field(default="en", description="Output language: 'en' (Simple English) or 'id' (Bahasa Indonesia)")
    context: dict[str, Any] | None = Field(
        default=None,
        description="Optional surrounding context (section title, paper_context, etc.)",
    )


class LensResponse(BaseModel):
    success: bool
    lens_type: str
    language: str = "en"
    explanation: str
    core_action: str | None = None
    plain_meaning: str | None = None
    takeaway: str | None = None
    context_link: str | None = None
    # Quick Reference specific fields
    passive_phrases: list[str] | None = None
    real_subject: str | None = None
    active_rewrite: str | None = None
    antecedents: str | None = None
    # Easy Citation specific fields
    citation_label: str | None = None
    reference_title: str | None = None
    why_cited: str | None = None
    supporting_claim: str | None = None


class PaperContextRequest(BaseModel):
    title: str = ""
    content: str = Field(..., min_length=1, description="Paper text content")


class PaperContextResponse(BaseModel):
    success: bool
    title: str = ""
    domain: str = ""
    core_problem: str = ""
    core_method: str = ""
    key_terms: dict[str, str] = Field(default_factory=dict)
    constraints_and_bounds: list[str] = Field(default_factory=list)


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
        language=payload.language,
    )
    return LensResponse(**result)


@router.post("/context/prebake", response_model=PaperContextResponse)
async def prebake_context(payload: PaperContextRequest) -> PaperContextResponse:
    """Pre-compute a global paper context to anchor downstream sentence explanations and prevent hallucination."""
    result = await _llm.prebake_context(paper_content=payload.content, title=payload.title)
    return PaperContextResponse(**result)


@router.post("/prebake", response_model=PrebakeResponse)
async def prebake_paper(payload: PrebakeRequest) -> PrebakeResponse:
    """Pre-compute a symbol table and anchor map for a paper."""
    result = await _llm.prebake_paper(paper_content=payload.content)
    return PrebakeResponse(**result)


@router.post("/documents/parse")
async def parse_document(file: UploadFile = File(...)) -> dict[str, Any]:
    """
    Parse an uploaded research PDF using PyMuPDF and spaCy.
    Extracts two-column academic reading order, removes hyphens, and segments sentences.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File exceeds maximum 25MB limit.")

        parsed_data = _pdf_parser.parse_pdf_bytes(content)
        parsed_data["filename"] = file.filename
        return parsed_data
    except Exception as e:
        logger.exception("Failed to parse PDF: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to parse document: {str(e)}")


@router.post("/reconstruct/parse")
async def reconstruct_document(file: UploadFile = File(...)) -> dict[str, Any]:
    """
    Parse an uploaded research PDF with coordinate-aware block, paragraph,
    and heading detection for the reconstruction test sandbox.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(content) > 30 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File exceeds 30MB limit.")

        data = _reconstruct.parse_pdf(content)
        data["filename"] = file.filename
        return data
    except Exception as e:
        logger.exception("Failed to parse PDF for reconstruction: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to parse document: {str(e)}")


@router.get("/reconstruct/sample")
async def reconstruct_sample(sample_type: str = "mdpi") -> dict[str, Any]:
    """
    Return parsed coordinate-aware structure for a built-in sample paper.
    sample_type: 'mdpi' (Energies 2024 MDPI Arc Fault) or 'academic' (Cognitive Load).
    """
    from pathlib import Path
    if sample_type == "academic":
        sample_path = Path("assets/docs/sample_academic_paper.pdf")
    else:
        sample_path = Path("assets/docs/mdpi_arc_fault_sample.pdf")

    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Sample PDF not found on server.")

    try:
        with open(sample_path, "rb") as f:
            pdf_bytes = f.read()
        data = _reconstruct.parse_pdf(pdf_bytes)
        data["filename"] = sample_path.name
        return data
    except Exception as e:
        logger.exception("Failed to parse sample PDF: %s", e)
        raise HTTPException(status_code=500, detail=f"Error parsing sample PDF: {str(e)}")


@router.post("/reconstruct/ai-parse")
async def reconstruct_document_ai(file: UploadFile = File(...)) -> dict[str, Any]:
    """
    Parse an uploaded research PDF using the 3-stage PyMuPDF + Gemini Flash + spaCy
    AI semantic layout structuring engine.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        if len(content) > 30 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File exceeds 30MB limit.")

        data = _ai_reconstruct.parse_pdf_ai(content)
        data["filename"] = file.filename
        return data
    except Exception as e:
        logger.exception("Failed to parse PDF with AI engine: %s", e)
        raise HTTPException(status_code=500, detail=f"AI parsing error: {str(e)}")


@router.get("/reconstruct/ai-sample")
async def reconstruct_sample_ai(sample_type: str = "mdpi") -> dict[str, Any]:
    """
    Return parsed AI semantic hierarchy for built-in sample paper.
    sample_type: 'mdpi' (Energies 2024 Arc Fault) or 'academic' (Cognitive Load).
    """
    from pathlib import Path
    if sample_type == "academic":
        sample_path = Path("assets/docs/sample_academic_paper.pdf")
    else:
        sample_path = Path("assets/docs/mdpi_arc_fault_sample.pdf")

    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Sample PDF not found on server.")

    try:
        with open(sample_path, "rb") as f:
            pdf_bytes = f.read()
        data = _ai_reconstruct.parse_pdf_ai(pdf_bytes)
        data["filename"] = sample_path.name
        return data
    except Exception as e:
        logger.exception("Failed to parse sample PDF with AI engine: %s", e)
        raise HTTPException(status_code=500, detail=f"AI sample parsing error: {str(e)}")


