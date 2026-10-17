"""
PDF Parsing & NLP Service using PyMuPDF (fitz) and spaCy.
Engineered specifically for multi-column academic literature.
Features:
- Two-column layout flow ordering with split_y detection
- In-situ de-hyphenation across line endings
- Linguistic passive-voice detection & agent resolution via spaCy dependency grammar
- Academic lexical indexing and intuitive bilingual guidance
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Common academic keywords for quick recognition
ACADEMIC_KEYWORDS = {
    "utilize", "exhibit", "facilitate", "concomitant", "paucity", "proliferation",
    "demonstrate", "investigate", "significant", "preliminary", "empirical", "methodology",
    "comprehensive", "delineate", "synthesize", "furthermore", "subsequently", "paradigm",
    "stochastic", "attenuate", "orthogonal", "heuristic", "discrepancy", "homogeneous",
    "heterogeneous", "convergence", "divergence", "formulation", "salient", "efficacy",
    "scaffolding", "bottleneck", "relegate", "saturation", "erratic", "saccadic"
}

# Scientific abbreviations that must not trigger sentence splits
SCIENTIFIC_ABBREVS = {
    "et al.", "i.e.", "e.g.", "fig.", "figs.", "eq.", "eqs.", "ref.", "refs.",
    "vol.", "no.", "dr.", "prof.", "dept.", "approx.", "sec.", "secs.", "al."
}


class PdfParserService:
    def __init__(self) -> None:
        self._nlp = None

    def _get_nlp(self):
        """Lazy loader for spaCy NLP pipeline with scientific sentence boundary rules."""
        if self._nlp is not None:
            return self._nlp

        try:
            import spacy
            try:
                # Load full English model with dependency parser for deep grammar analysis
                self._nlp = spacy.load("en_core_web_sm")
            except Exception:
                # Lightweight instant fallback with sentencizer
                self._nlp = spacy.blank("en")
                if "sentencizer" not in self._nlp.pipe_names:
                    self._nlp.add_pipe("sentencizer")
        except Exception as e:
            logger.warning("spaCy initialization fallback: %s", e)
            self._nlp = None

        return self._nlp

    def parse_pdf_bytes(self, pdf_bytes: bytes, max_pages: int = 20) -> dict[str, Any]:
        """
        Parse raw PDF bytes into a structured academic reading model.
        Extracts two-column flows, cleans line breaks, and extracts sentences via spaCy.
        """
        try:
            import pymupdf as fitz
        except ImportError:
            import fitz

        file_hash = hashlib.sha256(pdf_bytes).hexdigest()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)
        meta = doc.metadata or {}

        doc_title = (meta.get("title") or "").strip()
        doc_author = (meta.get("author") or "").strip()

        pages_to_process = min(page_count, max_pages)
        ordered_blocks_all_pages: list[str] = []

        for page_idx in range(pages_to_process):
            page = doc[page_idx]
            page_blocks = self._extract_page_ordered_blocks(page)
            for blk in page_blocks:
                cleaned_blk = self._clean_block_text(blk)
                if cleaned_blk:
                    ordered_blocks_all_pages.append(cleaned_blk)

        doc.close()

        # Heuristic metadata extraction from first page blocks if metadata is empty
        if ordered_blocks_all_pages:
            first_blk = ordered_blocks_all_pages[0]
            if not doc_title:
                # First short block is typically the title
                lines = first_blk.split("\n")
                if len(lines[0]) < 120:
                    doc_title = lines[0].strip()

            # Check if second block is author
            if len(ordered_blocks_all_pages) > 1 and not doc_author:
                second_blk = ordered_blocks_all_pages[1]
                if re.match(r'^(authors?|by)\s*:', second_blk, re.IGNORECASE):
                    doc_author = re.sub(r'^(authors?|by)\s*:\s*', '', second_blk, flags=re.IGNORECASE).strip()

        # Extract sentences via spaCy block-by-block
        sentences = self._extract_sentences_from_blocks(ordered_blocks_all_pages, doc_title, doc_author)

        if not doc_title and sentences:
            doc_title = sentences[0]["orig"].replace('"', '')[:80]

        return {
            "success": True,
            "file_hash": file_hash,
            "title": doc_title or "Untitled Research Paper",
            "author": doc_author,
            "page_count": page_count,
            "pages_parsed": pages_to_process,
            "sentence_count": len(sentences),
            "sentences": sentences,
        }

    def _extract_page_ordered_blocks(self, page) -> list[str]:
        """
        Extract text blocks and order them respecting academic two-column layouts.
        Detects header zone vs multi-column body using vertical coordinate overlap.
        """
        blocks = page.get_text("blocks")
        if not blocks:
            return []

        # Filter to text blocks only (block_type == 0)
        text_blocks = [b for b in blocks if b[6] == 0 and b[4].strip()]
        if not text_blocks:
            return []

        page_width = page.rect.width
        midpoint = page_width / 2.0

        col1_candidates = [b for b in text_blocks if b[2] <= midpoint * 1.08]
        col2_candidates = [b for b in text_blocks if b[0] >= midpoint * 0.92]

        # Detect the vertical Y where multi-column overlap begins
        overlap_ys = []
        for b1 in col1_candidates:
            for b2 in col2_candidates:
                if max(b1[1], b2[1]) < min(b1[3], b2[3]):
                    overlap_ys.extend([b1[1], b2[1]])

        if overlap_ys:
            split_y = min(overlap_ys) - 2.0
            # Header blocks strictly above the two-column split
            header_blocks = [b for b in text_blocks if b[3] <= split_y + 4]
            header_blocks.sort(key=lambda b: b[1])

            # Left column body blocks
            body_col1 = [b for b in text_blocks if b[3] > split_y + 4 and b[2] <= midpoint * 1.08]
            body_col1.sort(key=lambda b: b[1])

            # Right column body blocks
            body_col2 = [b for b in text_blocks if b[3] > split_y + 4 and b[0] >= midpoint * 0.92]
            body_col2.sort(key=lambda b: b[1])

            # Any spanning footer blocks across bottom
            footer_blocks = [
                b for b in text_blocks
                if b[3] > split_y + 4 and b not in body_col1 and b not in body_col2
            ]
            footer_blocks.sort(key=lambda b: b[1])

            ordered = header_blocks + body_col1 + body_col2 + footer_blocks
        else:
            # Single-column document: natural top-to-bottom order
            ordered = sorted(text_blocks, key=lambda b: (b[1], b[0]))

        return [b[4].strip() for b in ordered]

    def _clean_block_text(self, text: str) -> str:
        """Clean dehyphenated line wraps, repeated whitespace, and header artifacts."""
        # 1. Dehyphenate words broken at line endings: e.g. "trans-\nformer" -> "transformer"
        text = re.sub(r'([A-Za-z]+)-\s*\n\s*([A-Za-z]+)', r'\1\2', text)

        # 2. Join lines inside the block with single spaces
        text = re.sub(r'\n+', ' ', text)

        # 3. Collapse multiple spaces
        text = re.sub(r'[ \t]+', ' ', text)

        return text.strip()

    def _extract_sentences_from_blocks(
        self,
        blocks: list[str],
        doc_title: str = "",
        doc_author: str = "",
        max_sentences: int = 60
    ) -> list[dict[str, Any]]:
        """Segment ordered blocks into individual sentences using spaCy linguistic analysis."""
        nlp = self._get_nlp()
        raw_sentences: list[str] = []

        normalized_title = doc_title.lower().strip()
        normalized_author = doc_author.lower().strip()

        for blk in blocks:
            # Skip block if it is identical to doc title or author
            blk_lower = blk.lower().strip()
            if normalized_title and (blk_lower == normalized_title or blk_lower.startswith(normalized_title)):
                continue
            if normalized_author and blk_lower.startswith(normalized_author):
                continue
            if re.match(r'^(authors?|by)\s*:', blk, re.IGNORECASE):
                continue

            # Skip standalone section headings e.g. "1. Introduction", "2. Methodology", "References"
            if self._is_heading(blk):
                continue

            if nlp:
                doc = nlp(blk)
                for sent in doc.sents:
                    s_text = sent.text.strip()
                    if self._is_valid_sentence(s_text):
                        raw_sentences.append(s_text)
                        if len(raw_sentences) >= max_sentences:
                            break
            else:
                # Regex fallback
                candidate_splits = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9])', blk)
                for cand in candidate_splits:
                    s_text = cand.strip()
                    if self._is_valid_sentence(s_text):
                        raw_sentences.append(s_text)
                        if len(raw_sentences) >= max_sentences:
                            break

            if len(raw_sentences) >= max_sentences:
                break

        # Generate structured sentence breakdown for the frontend
        formatted_sentences = []
        for idx, sent_text in enumerate(raw_sentences, start=1):
            formatted_sentences.append(self._format_sentence_item(sent_text, idx))

        return formatted_sentences

    def _is_heading(self, text: str) -> bool:
        """Filter out section headers like '1. Introduction' or standalone 'Abstract' labels."""
        clean = text.strip()
        if len(clean) < 65:
            # Numbered section heading: "1. Introduction", "2.1 Background"
            if re.match(r'^\d+(\.\d+)*\s+[A-Za-z]', clean):
                return True
            # Standard single-word headers
            if clean.lower() in {"abstract", "keywords", "references", "conclusion", "introduction", "methodology"}:
                return True
            # All-caps short header
            if clean.isupper() and len(clean.split()) <= 4:
                return True
        return False

    def _is_valid_sentence(self, text: str) -> bool:
        """Filter out fragments, citation lists, figure captions, or formula remnants."""
        if len(text) < 22 or len(text) > 600:
            return False
        # Must contain at least 4 words
        words = text.split()
        if len(words) < 4:
            return False
        # Skip pure numeric or symbol lines
        if re.match(r'^[0-9\s.,;:\-_/()\[\]{}]+$', text):
            return False
        return True

    def _format_sentence_item(self, sentence: str, number: int) -> dict[str, Any]:
        """
        Format sentence into the card structure expected by the READit reader.
        Uses dependency parsing to detect passive voice and extract the actor.
        """
        num_str = f"{number:02d}"
        nlp = self._get_nlp()

        has_passive = False
        actor = ""

        if nlp and hasattr(nlp, "pipe_names") and "parser" in nlp.pipe_names:
            doc = nlp(sentence)
            # Detect passive voice tokens via spaCy dependency tags
            passives = [tok for tok in doc if tok.dep_ in ("nsubjpass", "auxpass")]
            has_passive = bool(passives)

            # Look for explicit agent ('by <actor>')
            agents = [tok for tok in doc if tok.dep_ == "agent"]
            if agents:
                actor = " ".join([t.text for t in agents[0].subtree if t.dep_ != "agent"]).strip()
        else:
            # Regex fallback for passive voice: (was/were/is/are/been/being + past participle)
            has_passive = bool(re.search(
                r'\b(was|were|is|are|been|being|be)\s+([a-z]+ed|[a-z]+en|found|shown|seen|made|taken|known|given)\b',
                sentence,
                re.IGNORECASE
            ))

        # Detect academic keywords
        words_in_sent = set(re.findall(r'\b[a-z]{4,}\b', sentence.lower()))
        matched_keywords = sorted(list(words_in_sent.intersection(ACADEMIC_KEYWORDS)))

        badge = f"SENTENCE {num_str} • " + ("RESOLVED PASSIVE" if has_passive else "CORE DERIVATION")

        # English Intuitive Breakdown
        if has_passive:
            if actor:
                simplified_en = (
                    f'Actor clarification: "{actor}" carries out the action. '
                    f'Original passive structure: "{sentence[:100]}..."'
                )
            else:
                simplified_en = (
                    f'Implicit actor detected: The original passive voice obscures who performed the action. '
                    f'Primary claim: "{sentence[:110]}..."'
                )
        else:
            simplified_en = f'Direct active statement: "{sentence[:120]}..."'

        # Indonesian Intuitive Translation / Summary
        if has_passive:
            if actor:
                simplified_id = (
                    f'Struktur pasif teridentifikasi. Pelaku aksi adalah: "{actor}". '
                    f'Kalimat ini menekankan hasil tindakan daripada aktor pelaksananya.'
                )
            else:
                simplified_id = (
                    f'Struktur pasif dengan pelaku tersembunyi (implicit agent). '
                    f'Gunakan AI Intuition untuk mengungkap makna dan konteks utamanya.'
                )
        else:
            simplified_id = (
                f'Pernyataan aktif ilmiah. '
                f'Gagasan utama: "{sentence[:90]}...". Klik untuk analisis konseptual mendalam.'
            )

        # Extra UI badge HTML
        badge_extra = (
            f'<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">PyMuPDF + spaCy</span>'
        )
        if has_passive:
            if actor:
                badge_extra += f' <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px]">Actor: {actor[:25]}</span>'
            else:
                badge_extra += f' <span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px]">Implicit Agent</span>'
        if matched_keywords:
            badge_extra += f' <span class="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px]">{len(matched_keywords)} Academic Terms</span>'

        return {
            "id": simplified_id,            # Dual-compatible: used by hub.js for Bahasa Indonesia
            "sentence_id": f"s-{number}",
            "number": number,
            "badge": badge,
            "orig": f'"{sentence}"',
            "en": simplified_en,
            "id_summary": simplified_id,
            "has_passive": has_passive,
            "actor": actor,
            "keywords": matched_keywords,
            "extra": badge_extra,
        }
