"""
Reconstruction & Layout Parsing Service for Academic Papers.
Coordinate-aware text block detection, vertical line pitch analysis,
role classification, and sentence extraction.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any

ACADEMIC_KEYWORDS = {
    "utilize", "exhibit", "facilitate", "concomitant", "paucity", "proliferation",
    "demonstrate", "investigate", "significant", "preliminary", "empirical", "methodology",
    "comprehensive", "delineate", "synthesize", "furthermore", "subsequently", "paradigm",
    "stochastic", "attenuate", "orthogonal", "heuristic", "discrepancy", "homogeneous",
    "heterogeneous", "convergence", "divergence", "formulation", "salient", "efficacy",
    "residual", "optimization", "intermittent", "distortion", "dimensionality"
}


class ReconstructService:
    def __init__(self) -> None:
        self._nlp = None

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
            logger.warning("spaCy fallback: %s", e)
            self._nlp = None
        return self._nlp

    def parse_pdf(self, pdf_bytes: bytes, max_pages: int = 15) -> dict[str, Any]:
        """Parse PDF into coordinate-aware structured pages, blocks, paragraphs, and sentences."""
        try:
            import pymupdf as fitz
        except ImportError:
            import fitz

        file_hash = hashlib.sha256(pdf_bytes).hexdigest()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)
        pages_to_process = min(total_pages, max_pages)

        meta = doc.metadata or {}
        doc_title = (meta.get("title") or "").strip()
        doc_author = (meta.get("author") or "").strip()

        parsed_pages = []
        total_paragraphs = 0
        total_sentences = 0
        headings_count = 0

        for page_idx in range(pages_to_process):
            page = doc[page_idx]
            page_data = self._parse_page(page, page_idx + 1)
            parsed_pages.append(page_data)

            total_paragraphs += len(page_data["paragraphs"])
            for p in page_data["paragraphs"]:
                total_sentences += len(p["sentences"])
                if p["role"].startswith("heading"):
                    headings_count += 1

        doc.close()

        # Infer title from first page if missing in metadata
        if not doc_title and parsed_pages and parsed_pages[0]["paragraphs"]:
            for p in parsed_pages[0]["paragraphs"]:
                if p["role"] == "title":
                    doc_title = p["text"]
                    break
            if not doc_title:
                doc_title = parsed_pages[0]["paragraphs"][0]["text"][:80]

        return {
            "success": True,
            "file_hash": file_hash,
            "title": doc_title or "Academic Paper",
            "author": doc_author,
            "page_count": total_pages,
            "pages_parsed": pages_to_process,
            "stats": {
                "total_pages": total_pages,
                "pages_parsed": pages_to_process,
                "total_paragraphs": total_paragraphs,
                "total_sentences": total_sentences,
                "headings_count": headings_count,
            },
            "pages": parsed_pages,
        }

    def _parse_page(self, page, page_num: int) -> dict[str, Any]:
        """Extract coordinate-aware blocks and true paragraphs from a single page."""
        page_dict = page.get_text("dict")
        page_width = page.rect.width
        page_height = page.rect.height
        midpoint = page_width / 2.0

        raw_blocks = [b for b in page_dict.get("blocks", []) if b.get("type") == 0]
        if not raw_blocks:
            return {
                "page_num": page_num,
                "width": round(page_width, 1),
                "height": round(page_height, 1),
                "is_multicolumn": False,
                "paragraphs": [],
            }

        # 1. Identify running headers and footers
        header_blocks = []
        footer_blocks = []
        body_candidates = []

        for b in raw_blocks:
            bbox = b["bbox"]
            y0, y1 = bbox[1], bbox[3]
            text = self._extract_block_text_fast(b)

            if y1 <= 42:
                header_blocks.append((b, "running_header"))
            elif y0 >= page_height - 45:
                footer_blocks.append((b, "running_footer"))
            else:
                body_candidates.append(b)

        # 2. Check for Left Sidebar / Marginalia (e.g. MDPI Page 1 citation bar)
        sidebar_blocks = []
        main_body_blocks = []

        if page_num == 1:
            for b in body_candidates:
                bbox = b["bbox"]
                b_text = self._extract_block_text_fast(b).lower()
                is_sidebar_content = any(k in b_text for k in ["citation:", "academic editor:", "received:", "revised:", "accepted:", "copyright:"])
                if bbox[2] <= page_width * 0.32 and (is_sidebar_content or (bbox[3] - bbox[1] > 180)):
                    sidebar_blocks.append((b, "sidebar"))
                else:
                    main_body_blocks.append(b)
        else:
            main_body_blocks = body_candidates

        # 3. Detect Columnar Layout for Main Body Blocks
        col1_candidates = [b for b in main_body_blocks if b["bbox"][2] <= midpoint * 1.08]
        col2_candidates = [b for b in main_body_blocks if b["bbox"][0] >= midpoint * 0.92]

        overlap_ys = []
        for b1 in col1_candidates:
            for b2 in col2_candidates:
                if max(b1["bbox"][1], b2["bbox"][1]) < min(b1["bbox"][3], b2["bbox"][3]):
                    overlap_ys.extend([b1["bbox"][1], b2["bbox"][1]])

        is_multicolumn = len(overlap_ys) >= 2
        ordered_body_blocks = []

        if is_multicolumn:
            split_y = min(overlap_ys) - 2.0
            # Header zone above split
            top_spanning = [b for b in main_body_blocks if b["bbox"][3] <= split_y + 4]
            top_spanning.sort(key=lambda b: b["bbox"][1])

            # Left column
            body_col1 = [b for b in main_body_blocks if b["bbox"][3] > split_y + 4 and b["bbox"][2] <= midpoint * 1.08]
            body_col1.sort(key=lambda b: b["bbox"][1])

            # Right column
            body_col2 = [b for b in main_body_blocks if b["bbox"][3] > split_y + 4 and b["bbox"][0] >= midpoint * 0.92]
            body_col2.sort(key=lambda b: b["bbox"][1])

            # Bottom spanning footers
            bottom_spanning = [
                b for b in main_body_blocks
                if b["bbox"][3] > split_y + 4 and b not in body_col1 and b not in body_col2
            ]
            bottom_spanning.sort(key=lambda b: b["bbox"][1])

            ordered_body_blocks = top_spanning + body_col1 + body_col2 + bottom_spanning
        else:
            # Single-column: sort natural top-to-bottom
            ordered_body_blocks = sorted(main_body_blocks, key=lambda b: (b["bbox"][1], b["bbox"][0]))

        # Assemble final blocks sequence: Header -> Sidebars -> Body -> Footer
        all_ordered = [(b, None) for b in ordered_body_blocks]
        if sidebar_blocks:
            all_ordered = [(b, "sidebar") for b, _ in sidebar_blocks] + all_ordered

        # 4. Deconstruct Blocks into True Line-Pitch-Aware Paragraphs
        paragraphs = []
        para_counter = 1

        for b, forced_role in all_ordered:
            paras_in_block = self._extract_paragraphs_from_block(b, page_num, para_counter, forced_role)
            for p in paras_in_block:
                paragraphs.append(p)
                para_counter += 1

        return {
            "page_num": page_num,
            "width": round(page_width, 1),
            "height": round(page_height, 1),
            "is_multicolumn": is_multicolumn,
            "paragraphs": paragraphs,
        }

    def _extract_block_text_fast(self, block: dict[str, Any]) -> str:
        """Helper to quickly get block text for classification."""
        return " ".join(
            span.get("text", "")
            for line in block.get("lines", [])
            for span in line.get("spans", [])
        ).strip()

    def _extract_paragraphs_from_block(
        self,
        block: dict[str, Any],
        page_num: int,
        start_counter: int,
        forced_role: str | None = None
    ) -> list[dict[str, Any]]:
        """
        Inspect line vertical coordinates and pitch within a block.
        Splits when line delta-y exceeds standard line-spacing or upon distinct heading lines.
        """
        lines = block.get("lines", [])
        if not lines:
            return []

        block_bbox = block["bbox"]
        line_items = []

        for line in lines:
            spans = line.get("spans", [])
            if not spans:
                continue
            line_text = "".join(s.get("text", "") for s in spans).strip()
            if not line_text:
                continue

            max_size = max(s.get("size", 10.0) for s in spans)
            is_bold = any((s.get("flags", 0) & 2 != 0) or ("bold" in s.get("font", "").lower()) for s in spans)
            is_italic = any((s.get("flags", 0) & 1 != 0) or ("italic" in s.get("font", "").lower()) for s in spans)
            primary_font = spans[0].get("font", "Unknown")

            line_items.append({
                "bbox": line.get("bbox", block_bbox),
                "text": line_text,
                "size": round(max_size, 1),
                "is_bold": is_bold,
                "is_italic": is_italic,
                "font": primary_font,
            })

        if not line_items:
            return []

        # Group lines into paragraphs based on vertical spacing and heading markers
        paragraph_groups: list[list[dict[str, Any]]] = []
        current_group: list[dict[str, Any]] = [line_items[0]]

        for i in range(1, len(line_items)):
            prev = line_items[i - 1]
            curr = line_items[i]

            prev_y1 = prev["bbox"][3]
            curr_y0 = curr["bbox"][1]
            curr_size = curr["size"]
            delta_y = curr_y0 - prev_y1

            # Check if current line is a section heading
            is_curr_heading = self._is_heading_text(curr["text"]) or (curr["size"] > prev["size"] + 1.5)
            # Check if previous line looked like a short title/heading
            is_prev_heading = self._is_heading_text(prev["text"]) or (len(prev["text"]) < 60 and prev["is_bold"])

            # Paragraph break conditions:
            # 1. Vertical gap between lines exceeds 1.45 * line height
            # 2. Transition to or from a heading
            # 3. Indented start of line after terminal punctuation
            if (delta_y > curr_size * 0.45) or is_curr_heading or is_prev_heading:
                paragraph_groups.append(current_group)
                current_group = [curr]
            else:
                current_group.append(curr)

        if current_group:
            paragraph_groups.append(current_group)

        # Build paragraph objects
        results = []
        counter = start_counter

        for group in paragraph_groups:
            # Combine lines and clean dehyphenation
            raw_text = "\n".join(l["text"] for l in group)
            cleaned_text = self._clean_and_dehyphenate(raw_text)
            if not cleaned_text:
                continue

            # Determine dominant font and geometry
            dom_size = max(l["size"] for l in group)
            has_bold = any(l["is_bold"] for l in group)
            has_italic = any(l["is_italic"] for l in group)
            group_font = group[0]["font"]

            gx0 = min(l["bbox"][0] for l in group)
            gy0 = min(l["bbox"][1] for l in group)
            gx1 = max(l["bbox"][2] for l in group)
            gy1 = max(l["bbox"][3] for l in group)

            # Determine role
            role = forced_role or self._classify_paragraph_role(
                text=cleaned_text,
                font_size=dom_size,
                is_bold=has_bold,
                is_italic=has_italic,
                page_num=page_num,
                counter=counter,
                bbox=(gx0, gy0, gx1, gy1)
            )

            # Extract clean sentences
            sentences = self._split_into_sentences(cleaned_text)

            results.append({
                "paragraph_id": f"p{page_num}-para-{counter}",
                "page_num": page_num,
                "index": counter,
                "role": role,
                "text": cleaned_text,
                "font_size": dom_size,
                "font_name": group_font,
                "is_bold": has_bold,
                "is_italic": has_italic,
                "bbox": [round(gx0, 1), round(gy0, 1), round(gx1, 1), round(gy1, 1)],
                "line_count": len(group),
                "word_count": len(cleaned_text.split()),
                "sentences": sentences,
            })
            counter += 1

        return results

    def _clean_and_dehyphenate(self, text: str) -> str:
        """Dehyphenate across lines and normalize whitespace."""
        # Fix hyphenated words at line end: e.g. "opto-\nelectronic" -> "optoelectronic"
        text = re.sub(r'([A-Za-z]+)-\s*\n\s*([A-Za-z]+)', r'\1\2', text)
        # Convert remaining linebreaks into spaces
        text = re.sub(r'\s*\n\s*', ' ', text)
        # Collapse multiple spaces
        text = re.sub(r'[ \t]+', ' ', text)
        return text.strip()

    def _is_heading_text(self, text: str) -> bool:
        """Regex check for numbered academic section headings."""
        t = text.strip()
        if len(t) > 90:
            return False
        # Matches: "1. Introduction", "1.1. Method", "2.3. Optimization Algorithm"
        if re.match(r'^\d+(\.\d+)*\.?\s+[A-Z]', t):
            return True
        if t.lower() in ["abstract", "keywords", "references", "conclusion", "acknowledgment", "appendix"]:
            return True
        return False

    def _classify_paragraph_role(
        self,
        text: str,
        font_size: float,
        is_bold: bool,
        is_italic: bool,
        page_num: int,
        counter: int,
        bbox: tuple[float, float, float, float]
    ) -> str:
        """Assign precise semantic role to each paragraph with coordinate awareness."""
        lower = text.lower().strip()
        y0, y1 = bbox[1], bbox[3]

        # 1. Running headers & footers based on coordinates
        if y1 <= 50 or y0 <= 35:
            return "running_header"
        if y0 >= 795:
            return "running_footer"

        # 2. Page 1 Header heuristics (Title, Authors, Affiliations, Badges)
        if page_num == 1:
            if lower in ["article", "review", "communication", "perspective"] and len(text) < 25:
                return "article_badge"
            # Title: largest font in upper region of page 1
            if font_size >= 12.0 and y0 < 160 and not lower.startswith("citation:"):
                return "title"
            if "correspondence:" in lower or any(k in lower for k in ["university", "department of", "school of", "institute", "faculty of", "laboratory"]):
                return "affiliations"
            if (y0 < 190 and font_size >= 9.0 and ("*" in text or " and " in lower or re.match(r'^(authors?|by)\s*:', lower))):
                return "authors"
            if lower.startswith("abstract:") or lower.startswith("abstract—") or (is_italic and "abstract" in lower[:30]):
                return "abstract"
            if lower.startswith("keywords:") or lower.startswith("keywords—") or lower.startswith("index terms:"):
                return "keywords"

        # 3. Captions
        if re.match(r'^(figure|fig\.)\s+\d+[\.:]', lower):
            return "figure_caption"
        if re.match(r'^table\s+\d+[\.:]', lower):
            return "table_caption"

        # 4. Section Headings
        if re.match(r'^\d+\.\s+[A-Za-z]', text):
            return "heading_1"
        if re.match(r'^\d+\.\d+\.?\s+[A-Za-z]', text):
            return "heading_2"
        if re.match(r'^\d+\.\d+\.\d+\.?\s+[A-Za-z]', text):
            return "heading_3"

        if is_bold and len(text) < 70 and not text.endswith("."):
            return "heading_2"

        # 5. Math Equations
        if re.match(r'^\(?[A-Za-z0-9_=\+\-\*/\s\(\)\[\]\.,]+\)?\s*\(\d+\)$', text):
            return "equation"

        return "paragraph"

    def _split_into_sentences(self, text: str) -> list[dict[str, Any]]:
        """Linguistically segment paragraph into sentences with passive voice & actor detection."""
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
            has_passive = False
            actor = ""

            if nlp and hasattr(nlp, "pipe_names") and "parser" in nlp.pipe_names:
                s_doc = nlp(s_text)
                passives = [tok for tok in s_doc if tok.dep_ in ("nsubjpass", "auxpass")]
                has_passive = bool(passives)

                agents = [tok for tok in s_doc if tok.dep_ == "agent"]
                if agents:
                    actor = " ".join([t.text for t in agents[0].subtree if t.dep_ != "agent"]).strip()
            else:
                has_passive = bool(re.search(
                    r'\b(was|were|is|are|been|being|be)\s+([a-z]+ed|[a-z]+en|found|shown|seen|made|taken|known|given)\b',
                    s_text,
                    re.IGNORECASE
                ))

            words = set(re.findall(r'\b[a-z]{4,}\b', s_text.lower()))
            matched_keywords = sorted(list(words.intersection(ACADEMIC_KEYWORDS)))

            results.append({
                "sentence_id": f"s-{idx}",
                "number": idx,
                "text": s_text,
                "has_passive": has_passive,
                "actor": actor or None,
                "keywords": matched_keywords,
            })

        return results
