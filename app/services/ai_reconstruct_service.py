"""
AI-Powered Academic Document Layout Structuring Service.
Combines PyMuPDF (fast raw text, coordinates, character fidelity)
with Gemini 2.0/3.5 Flash (semantic section, subchapter, and paragraph hierarchy)
and spaCy (linguistic sentence boundaries and actor resolution).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from pathlib import Path
import re
from typing import Any

from app.config import get_gemini_api_key

logger = logging.getLogger(__name__)

# Common academic keywords
ACADEMIC_KEYWORDS = {
    "utilize", "exhibit", "facilitate", "concomitant", "paucity", "proliferation",
    "demonstrate", "investigate", "significant", "preliminary", "empirical", "methodology",
    "comprehensive", "delineate", "synthesize", "furthermore", "subsequently", "paradigm",
    "stochastic", "attenuate", "orthogonal", "heuristic", "discrepancy", "homogeneous",
    "heterogeneous", "convergence", "divergence", "formulation", "salient", "efficacy",
    "residual", "optimization", "intermittent", "distortion", "dimensionality"
}

AI_SYSTEM_PROMPT = """You are an elite academic document layout intelligence engine.
Analyze the provided raw text extracted from an academic paper page.
Reconstruct the true semantic hierarchy into clean, valid JSON.
CRITICAL RULES:
1. Ignore running headers (e.g., journal title, page numbers at top) and running footers (e.g., URLs, DOIs at bottom).
2. Separate sidebars, marginalia, and citation boxes (e.g., 'Citation: ...', 'Received: ...', 'Copyright: ...') into the 'sidebars' array.
3. Identify the main Title, Authors, Affiliations, Abstract, and Keywords if present on this page.
4. Organize body content into Sections (e.g., '1. Introduction') and Subchapters (e.g., '1.1. Fault Arc Detection Method...').
5. Group continuous thoughts into true, coherent Paragraphs. Do NOT break a paragraph just because of an inline equation or formula.
6. Return ONLY valid JSON adhering strictly to the schema below.

JSON Schema:
{
  "title": "string or null",
  "authors": "string or null",
  "affiliations": "string or null",
  "abstract": "string or null",
  "keywords": "string or null",
  "sidebars": ["string"],
  "sections": [
    {
      "section_number": "string",
      "heading": "string",
      "subsections": [
        {
          "subsection_number": "string or null",
          "heading": "string or null",
          "paragraphs": ["string"]
        }
      ]
    }
  ],
  "captions": ["string"]
}
"""

from app.services.reconstruct_service import ReconstructService

logger = logging.getLogger(__name__)


class AiReconstructService:
    def __init__(self) -> None:
        self._nlp = None
        self._client = None
        self._fallback_service = ReconstructService()
        self._models = [
            "gemini-3.5-flash-lite",
            "gemini-3.5-flash",
            "gemini-3.6-flash",
            "gemini-flash-lite-latest",
        ]
        self._cache: dict[str, dict[str, Any]] = {}
        self._disk_cache_file = Path("assets/docs/.reconstruct_cache.json")
        self._load_disk_cache()

    def _load_disk_cache(self) -> None:
        """Load persistent cache from disk if available."""
        try:
            if self._disk_cache_file.exists():
                with open(self._disk_cache_file, "r", encoding="utf-8") as f:
                    self._cache = json.load(f)
        except Exception as e:
            logger.warning("Could not read disk cache: %s", e)

    def _save_disk_cache(self) -> None:
        """Persist cache to disk."""
        try:
            self._disk_cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self._disk_cache_file, "w", encoding="utf-8") as f:
                json.dump(self._cache, f, ensure_ascii=False)
        except Exception as e:
            logger.warning("Could not save disk cache: %s", e)

    def _get_nlp(self):
        """Lazy loader for spaCy."""
        if self._nlp is not None:
            return self._nlp
        try:
            import spacy
            try:
                self._nlp = spacy.load("en_core_web_sm")
            except Exception:
                self._nlp = spacy.blank("en")
                if "sentencizer" not in self._nlp.pipe_names:
                    self._nlp.add_pipe("sentencizer")
        except Exception as e:
            logger.warning("spaCy initialization error: %s", e)
            self._nlp = None
        return self._nlp

    def _get_gemini_client(self):
        """Get or initialize google.genai client."""
        if self._client is not None:
            return self._client
        try:
            from google import genai
            api_key = get_gemini_api_key()
            if not api_key or api_key == "your_gemini_api_key_here":
                return None
            self._client = genai.Client(api_key=api_key)
            return self._client
        except Exception as e:
            logger.warning("Gemini client initialization failed: %s", e)
            return None

    def parse_pdf_ai(self, pdf_bytes: bytes, max_pages: int = 10) -> dict[str, Any]:
        """
        Run the 3-stage pipeline:
        Stage 1: PyMuPDF extracts raw text & coordinate bounding boxes.
        Stage 2: Gemini 2.0/3.5 Flash structures sections, subchapters, and clean paragraphs.
        Stage 3: spaCy parses sentences, resolves actors, and links spatial coordinates.
        """
        try:
            import pymupdf as fitz
        except ImportError:
            import fitz

        file_hash = hashlib.sha256(pdf_bytes).hexdigest()
        if file_hash in self._cache:
            logger.info("Serving parsed PDF directly from cache (hash: %s)", file_hash[:10])
            return self._cache[file_hash]

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages)

        meta = doc.metadata or {}
        doc_title = (meta.get("title") or "").strip()
        doc_author = (meta.get("author") or "").strip()

        parsed_pages = []
        total_paragraphs = 0
        total_sentences = 0
        total_headings = 0
        total_subchapters = 0

        for page_idx in range(pages_to_process):
            page = doc[page_idx]
            page_num = page_idx + 1

            # Stage 1: PyMuPDF extract blocks and raw text
            page_blocks = page.get_text("blocks")
            raw_text = page.get_text("text")

            # Stage 2: Gemini AI Structuring
            ai_tree = self._call_gemini_structuring(raw_text, page_num)

            # Stage 3: spaCy linguistic parsing & coordinate binding
            processed_page = self._process_ai_page_tree(
                ai_tree=ai_tree,
                page_blocks=page_blocks,
                page_num=page_num,
                page_width=page.rect.width,
                page_height=page.rect.height
            )

            # If AI tree produced 0 paragraphs (e.g. temporary API 503 spike), fall back to PyMuPDF heuristics
            if not processed_page.get("paragraphs"):
                logger.info("AI yielded 0 paragraphs for page %d; activating heuristic fallback", page_num)
                fallback_page = self._fallback_service._parse_page(page, page_num)
                if fallback_page.get("paragraphs"):
                    processed_page = fallback_page

            parsed_pages.append(processed_page)

            # Update stats
            total_paragraphs += len(processed_page["paragraphs"])
            for p in processed_page["paragraphs"]:
                total_sentences += len(p["sentences"])
                if p["role"] == "heading_1":
                    total_headings += 1
                elif p["role"] == "heading_2":
                    total_subchapters += 1

            if not doc_title and processed_page.get("title"):
                doc_title = processed_page["title"]
            if not doc_author and processed_page.get("authors"):
                doc_author = processed_page["authors"]

        doc.close()

        result = {
            "success": True,
            "ai_powered": True,
            "engine": "PyMuPDF + Gemini Flash + spaCy",
            "file_hash": file_hash,
            "title": doc_title or "Academic Research Paper",
            "author": doc_author,
            "page_count": total_pages,
            "pages_parsed": pages_to_process,
            "stats": {
                "total_pages": total_pages,
                "pages_parsed": pages_to_process,
                "total_paragraphs": total_paragraphs,
                "total_sentences": total_sentences,
                "headings_count": total_headings,
                "subchapters_count": total_subchapters,
            },
            "pages": parsed_pages,
        }
        self._cache[file_hash] = result
        self._save_disk_cache()
        return result

    def _call_gemini_structuring(self, raw_text: str, page_num: int) -> dict[str, Any]:
        """Call Gemini Flash with model failover and JSON response schema."""
        client = self._get_gemini_client()
        if not client:
            logger.warning("Gemini API key missing, returning empty AI tree")
            return self._build_empty_ai_tree()

        user_prompt = f"Raw text extracted from Page {page_num} of academic paper:\n\n{raw_text[:20000]}"

        for model_name in self._models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=user_prompt,
                    config={
                        "system_instruction": AI_SYSTEM_PROMPT,
                        "temperature": 0.1,
                        "response_mime_type": "application/json",
                    }
                )
                if response and response.text:
                    data = json.loads(response.text)
                    return data
            except Exception as e:
                logger.warning("Model %s failed: %s, attempting failover...", model_name, e)

        logger.error("All Gemini models failed, falling back to empty AI tree")
        return self._build_empty_ai_tree()

    def _build_empty_ai_tree(self) -> dict[str, Any]:
        return {
            "title": None,
            "authors": None,
            "affiliations": None,
            "abstract": None,
            "keywords": None,
            "sidebars": [],
            "sections": [],
            "captions": []
        }

    def _process_ai_page_tree(
        self,
        ai_tree: dict[str, Any],
        page_blocks: list[Any],
        page_num: int,
        page_width: float,
        page_height: float
    ) -> dict[str, Any]:
        """
        Merge AI-detected hierarchy with PyMuPDF spatial coordinates,
        and segment every paragraph with spaCy.
        """
        paragraphs = []
        para_counter = 1

        # 1. Title
        title_text = (ai_tree.get("title") or "").strip()
        if title_text:
            bbox = self._find_best_bbox(title_text, page_blocks)
            paragraphs.append(self._build_paragraph_item(
                text=title_text,
                role="title",
                page_num=page_num,
                counter=para_counter,
                bbox=bbox,
                section_title=None,
                subchapter_title=None
            ))
            para_counter += 1

        # 2. Authors
        authors_text = (ai_tree.get("authors") or "").strip()
        if authors_text:
            bbox = self._find_best_bbox(authors_text, page_blocks)
            paragraphs.append(self._build_paragraph_item(
                text=authors_text,
                role="authors",
                page_num=page_num,
                counter=para_counter,
                bbox=bbox,
                section_title=None,
                subchapter_title=None
            ))
            para_counter += 1

        # 3. Affiliations
        affil_text = (ai_tree.get("affiliations") or "").strip()
        if affil_text:
            bbox = self._find_best_bbox(affil_text, page_blocks)
            paragraphs.append(self._build_paragraph_item(
                text=affil_text,
                role="affiliations",
                page_num=page_num,
                counter=para_counter,
                bbox=bbox,
                section_title=None,
                subchapter_title=None
            ))
            para_counter += 1

        # 4. Sidebars / Marginalia (Citation metadata, license)
        for s_text in ai_tree.get("sidebars", []):
            s_clean = s_text.strip()
            if s_clean:
                bbox = self._find_best_bbox(s_clean, page_blocks)
                paragraphs.append(self._build_paragraph_item(
                    text=s_clean,
                    role="sidebar",
                    page_num=page_num,
                    counter=para_counter,
                    bbox=bbox,
                    section_title="Sidebar Metadata",
                    subchapter_title=None
                ))
                para_counter += 1

        # 5. Abstract
        abstract_text = (ai_tree.get("abstract") or "").strip()
        if abstract_text:
            bbox = self._find_best_bbox(abstract_text, page_blocks)
            paragraphs.append(self._build_paragraph_item(
                text=abstract_text,
                role="abstract",
                page_num=page_num,
                counter=para_counter,
                bbox=bbox,
                section_title=None,
                subchapter_title=None
            ))
            para_counter += 1

        # 6. Keywords
        keywords_text = (ai_tree.get("keywords") or "").strip()
        if keywords_text:
            bbox = self._find_best_bbox(keywords_text, page_blocks)
            paragraphs.append(self._build_paragraph_item(
                text=keywords_text,
                role="keywords",
                page_num=page_num,
                counter=para_counter,
                bbox=bbox,
                section_title=None,
                subchapter_title=None
            ))
            para_counter += 1

        # 7. Sections & Subchapters
        for sec in ai_tree.get("sections", []):
            sec_heading = (sec.get("heading") or "").strip()
            if sec_heading:
                bbox = self._find_best_bbox(sec_heading, page_blocks)
                paragraphs.append(self._build_paragraph_item(
                    text=sec_heading,
                    role="heading_1",
                    page_num=page_num,
                    counter=para_counter,
                    bbox=bbox,
                    section_title=sec_heading,
                    subchapter_title=None
                ))
                para_counter += 1

            # Process direct paragraphs under section before any subchapters
            for p_text in sec.get("paragraphs", []):
                clean_p = p_text.strip()
                if clean_p:
                    bbox = self._find_best_bbox(clean_p, page_blocks)
                    paragraphs.append(self._build_paragraph_item(
                        text=clean_p,
                        role="paragraph",
                        page_num=page_num,
                        counter=para_counter,
                        bbox=bbox,
                        section_title=sec_heading,
                        subchapter_title=None
                    ))
                    para_counter += 1

            for sub in sec.get("subsections", []):
                sub_heading = (sub.get("heading") or "").strip()
                if sub_heading:
                    bbox = self._find_best_bbox(sub_heading, page_blocks)
                    paragraphs.append(self._build_paragraph_item(
                        text=sub_heading,
                        role="heading_2",
                        page_num=page_num,
                        counter=para_counter,
                        bbox=bbox,
                        section_title=sec_heading,
                        subchapter_title=sub_heading
                    ))
                    para_counter += 1

                for p_text in sub.get("paragraphs", []):
                    clean_p = p_text.strip()
                    if clean_p:
                        bbox = self._find_best_bbox(clean_p, page_blocks)
                        paragraphs.append(self._build_paragraph_item(
                            text=clean_p,
                            role="paragraph",
                            page_num=page_num,
                            counter=para_counter,
                            bbox=bbox,
                            section_title=sec_heading,
                            subchapter_title=sub_heading
                        ))
                        para_counter += 1

        # 8. Captions
        for cap in ai_tree.get("captions", []):
            clean_c = cap.strip()
            if clean_c:
                bbox = self._find_best_bbox(clean_c, page_blocks)
                role = "table_caption" if clean_c.lower().startswith("table") else "figure_caption"
                paragraphs.append(self._build_paragraph_item(
                    text=clean_c,
                    role=role,
                    page_num=page_num,
                    counter=para_counter,
                    bbox=bbox,
                    section_title=None,
                    subchapter_title=None
                ))
                para_counter += 1

        return {
            "page_num": page_num,
            "width": round(page_width, 1),
            "height": round(page_height, 1),
            "title": title_text or None,
            "authors": authors_text or None,
            "abstract": abstract_text or None,
            "keywords": keywords_text or None,
            "is_multicolumn": any(p["bbox"][0] > page_width * 0.45 for p in paragraphs if p["role"] == "paragraph"),
            "paragraphs": paragraphs,
        }

    def _build_paragraph_item(
        self,
        text: str,
        role: str,
        page_num: int,
        counter: int,
        bbox: list[float],
        section_title: str | None,
        subchapter_title: str | None
    ) -> dict[str, Any]:
        """Construct structured paragraph item with spaCy sentences and passive detection."""
        sentences = self._split_into_linguistic_sentences(text)

        return {
            "paragraph_id": f"p{page_num}-ai-{counter}",
            "page_num": page_num,
            "index": counter,
            "role": role,
            "section_title": section_title,
            "subchapter_title": subchapter_title,
            "text": text,
            "bbox": bbox,
            "word_count": len(text.split()),
            "sentence_count": len(sentences),
            "sentences": sentences,
        }

    def _split_into_linguistic_sentences(self, text: str) -> list[dict[str, Any]]:
        """Linguistically segment paragraph into sentences with passive voice & actor resolution."""
        nlp = self._get_nlp()
        raw_sents: list[str] = []

        if nlp:
            doc = nlp(text)
            for s in doc.sents:
                clean_s = s.text.strip()
                if len(clean_s) > 3:
                    raw_sents.append(clean_s)
        else:
            splits = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9])', text)
            raw_sents = [s.strip() for s in splits if s.strip()]

        if not raw_sents:
            raw_sents = [text]

        results = []
        for idx, s_text in enumerate(raw_sents, start=1):
            results.append(self._format_sentence_detail(s_text, idx))

        return results

    def _format_sentence_detail(self, sentence: str, number: int) -> dict[str, Any]:
        """Analyze sentence grammar, passive voice, and academic keywords."""
        nlp = self._get_nlp()
        has_passive = False
        actor = ""

        if nlp and hasattr(nlp, "pipe_names") and "parser" in nlp.pipe_names:
            doc = nlp(sentence)
            passives = [tok for tok in doc if tok.dep_ in ("nsubjpass", "auxpass")]
            has_passive = bool(passives)

            agents = [tok for tok in doc if tok.dep_ == "agent"]
            if agents:
                actor = " ".join([t.text for t in agents[0].subtree if t.dep_ != "agent"]).strip()
        else:
            has_passive = bool(re.search(
                r'\b(was|were|is|are|been|being|be)\s+([a-z]+ed|[a-z]+en|found|shown|seen|made|taken|known|given)\b',
                sentence,
                re.IGNORECASE
            ))

        words = set(re.findall(r'\b[a-z]{4,}\b', sentence.lower()))
        matched_keywords = sorted(list(words.intersection(ACADEMIC_KEYWORDS)))

        return {
            "sentence_id": f"s-{number}",
            "number": number,
            "text": sentence,
            "has_passive": has_passive,
            "actor": actor or None,
            "keywords": matched_keywords,
        }

    def _find_best_bbox(self, text_snippet: str, page_blocks: list[Any]) -> list[float]:
        """Match text snippet to the closest PyMuPDF block bounding box."""
        if not page_blocks:
            return [50.0, 50.0, 500.0, 100.0]

        # Use first 30 chars for matching
        prefix = re.sub(r'[^a-zA-Z0-9]', '', text_snippet.lower()[:35])
        if not prefix:
            return [50.0, 50.0, 500.0, 100.0]

        for b in page_blocks:
            if b[6] == 0:  # text block
                b_clean = re.sub(r'[^a-zA-Z0-9]', '', b[4].lower())
                if prefix in b_clean or b_clean in prefix:
                    return [round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1)]

        # Fallback to the first text block
        for b in page_blocks:
            if b[6] == 0:
                return [round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1)]

        return [50.0, 50.0, 500.0, 100.0]
