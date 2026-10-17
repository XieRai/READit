"""
LLM service – talks to Gemini when a key is available, otherwise returns
high-quality deterministic mock responses so the app never 500s.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from app.config import GEMINI_API_KEY, get_gemini_api_key

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supported Gemini models (cascade with automatic fallback on 503/429/errors)
# ---------------------------------------------------------------------------
GEMINI_MODELS: list[str] = [
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
]

def _clean_str(val: Any, default: str = "") -> str:
    if val is None:
        return default
    if isinstance(val, list):
        return ", ".join(str(v).strip() for v in val if v)
    return str(val).strip()

# ---------------------------------------------------------------------------
# System prompts per lens type
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Dynamic system prompts per lens type & language
# ---------------------------------------------------------------------------

def get_system_prompt(lens_type: str, language: str = "en") -> str:
    lang_is_id = (language or "").lower().strip() == "id"

    if lens_type in ("intuition", "translating_idea", "translating-idea"):
        if lang_is_id:
            return (
                "You are a precision academic translation engine built for extreme reading efficiency and zero hallucination. "
                "Your mission is to deconstruct dense academic prose into immediate, high-signal clarity using the provided Paper Context.\n\n"
                "TARGET LANGUAGE: BAHASA INDONESIA (NATURAL, IDIOMATIC & HIGH-SIGNAL)\n"
                "STRICT RULES FOR BAHASA INDONESIA:\n"
                "1. JANGAN TERJEMAHKAN HARFIAH/KAKU: Gunakan Bahasa Indonesia yang luwes, alami, dan enak dibaca seperti penjelasan dosen atau peneliti yang ahli di bidangnya. Hindari terjemahan mesin kaku.\n"
                "2. PERTAHANKAN ISTILAH TEKNIS BAKU: Pertahankan istilah teknis yang sudah lazim digunakan di komunitas ilmiah (misal: tetap gunakan 'deep residual network', 'autoencoder', 'sampling rate', 'time-frequency domain', 'feature extraction', 'arc fault', 'dataset'). Jangan memaksakan terjemahan kata-per-kata yang janggal.\n"
                "3. PERTAHANKAN SELURUH BATASAN & ANGKA: Jangan pernah memotong, menghilangkan, atau menyederhanakan angka, kondisi, ambang batas (threshold), parameter fisis, atau batas statistik (misal: 'di bawah 2,5 detik', 'arus antara 5A dan 30A', 'akurasi 99,7%'). Seluruh batasan wajib dicantumkan.\n"
                "4. STRUKTUR KALIMAT AKTIF: Ubah struktur pasif menjadi kalimat aktif langsung (Subjek -> Tindakan -> Objek/Hasil).\n"
                "5. ANCHOR KE PAPER CONTEXT: Gunakan konteks paper untuk memastikan makna istilah dan akronim.\n\n"
                "STRUCTURE: Output valid JSON with exactly four keys:\n"
                "   - 'core_action': Aksi utama langsung dalam Bahasa Indonesia (Subjek -> Tindakan -> Objek/Hasil). 1 baris.\n"
                "   - 'plain_meaning': Terjemahan & penjelasan makna dalam Bahasa Indonesia yang lugas dan mudah dipahami, dengan SELURUH angka dan batasan kondisi tetap utuh.\n"
                "   - 'takeaway': 1 poin singkat mengapa hal ini penting bagi inti penelitian.\n"
                "   - 'context_link': 1 kalimat utuh yang menjelaskan bagaimana bagian ini terhubung dengan arsitektur, metode, atau tujuan utama paper."
            )
        else:
            return (
                "You are a precision academic translation engine built for extreme reading efficiency and zero hallucination. "
                "Your mission is to deconstruct dense academic prose into immediate, high-signal clarity using the provided Paper Context.\n\n"
                "TARGET LANGUAGE: ENGLISH\n"
                "STRICT SIMPLIFICATION RULES:\n"
                "1. DECREASE LEXICAL COMPLEXITY: Replace pretentious or high-register academic vocabulary with the most common, widely-understood everyday words that mean the exact same thing (e.g. use 'weakens' instead of 'attenuates', 'stops working' instead of 'rendered ineffective', 'happens at the same time' instead of 'concomitantly manifests').\n"
                "2. SIMPLE DOES NOT MEAN SHORT: Do not over-compress or turn this into a vague 5-word summary. Explain the full meaning clearly using accessible everyday vocabulary.\n"
                "3. PRESERVE EVERY CONSTRAINT: NEVER cut, drop, or gloss over constraints, conditions, thresholds, numbers, physical boundaries, or statistical limits (e.g., voltages, currents, temperatures, p-values). Every condition stated in the original sentence must be explicitly retained.\n"
                "4. ZERO FLUFF: Never use conversational openings ('This sentence describes...', 'In this passage...', 'Here is the intuition:').\n"
                "5. ACTIVE VOICE: Reframe passive academic writing into direct Subject -> Action -> Outcome.\n"
                "6. ANCHOR TO PAPER CONTEXT: Use the provided Paper Context to accurately define pronouns, specific model names, or variables. Never guess or hallucinate.\n\n"
                "STRUCTURE: Output valid JSON with exactly four keys:\n"
                "   - 'core_action': A direct punchline (Subject -> Action -> Consequence/Object). 1 line.\n"
                "   - 'plain_meaning': Plain English translation in accessible everyday terms explaining the full meaning, with ALL constraints and numbers preserved.\n"
                "   - 'takeaway': 1 bullet point explaining why this matters to the paper's thesis or finding.\n"
                "   - 'context_link': 1 clear, complete sentence explaining specifically how this passage anchors into the paper's overall pipeline, architecture, or core thesis (e.g. explain which component or stage of the author's method this represents and how it connects to the main problem). Do not return a bare keyword or short fragment."
            )

    elif lens_type in ("quick_reference", "quick-reference", "quickref"):
        if lang_is_id:
            return (
                "You are an academic syntax and reference resolver. Dense academic papers often hide responsibility behind passive voice and ambiguous pronouns (e.g., 'three challenges were identified', 'this parameter was chosen'). Your job is to decode WHO did what and WHAT ambiguous terms refer to, grounded in the Paper Context.\n\n"
                "TARGET LANGUAGE: BAHASA INDONESIA (NATURAL, IDIOMATIC & HIGH-SIGNAL)\n"
                "STRICT RULES:\n"
                "1. Terjemahkan dan jelaskan dalam Bahasa Indonesia yang alami dan lugas.\n"
                "2. Identifikasi kata kerja pasif dan tentukan siapa pelaku aslinya (peneliti, penulis paper, sistem uji, atau literatur terdahulu).\n"
                "3. Tulis ulang kalimat menjadi kalimat aktif yang tegas.\n"
                "4. Uraikan kata rujukan ambigu (seperti 'tantangan ini', 'metode tersebut', 'gangguan ini').\n\n"
                "STRUCTURE: Output valid JSON with:\n"
                "   - 'passive_phrases': List of string phrases containing passive voice in the passage (e.g. ['telah diidentifikasi', 'diterapkan']).\n"
                "   - 'real_subject': Siapa pelaku atau agen sebenarnya yang melakukan tindakan tersebut.\n"
                "   - 'active_rewrite': Penulisan ulang kalimat dalam bentuk aktif langsung dengan subjek asli di depan.\n"
                "   - 'antecedents': Penjelasan ringkas apa yang sebenarnya dirujuk oleh istilah atau kata ganti ambigu dalam kalimat ini berdasarkan konteks paper."
            )
        else:
            return (
                "You are an academic syntax and reference resolver. Dense academic papers often hide responsibility behind passive voice and ambiguous pronouns (e.g., 'three challenges were identified', 'this parameter was chosen'). Your job is to decode WHO did what and WHAT ambiguous terms refer to, grounded in the Paper Context.\n\n"
                "TARGET LANGUAGE: ENGLISH\n"
                "STRICT RULES:\n"
                "1. Identify passive voice verb phrases where the actor is omitted or obscured.\n"
                "2. Determine the real, explicit agent/subject performing the action using the Paper Context (e.g. the authors, prior literature, or experimental apparatus).\n"
                "3. Rewrite the sentence in direct, clear active voice where the real subject leads.\n"
                "4. Resolve all ambiguous referents, pronouns, and demonstratives (e.g., 'these challenges', 'the method', 'such faults').\n\n"
                "STRUCTURE: Output valid JSON with:\n"
                "   - 'passive_phrases': List of specific passive verb phrases in the passage (e.g. ['were also identified']).\n"
                "   - 'real_subject': The explicit agent/actor who actually performed the action.\n"
                "   - 'active_rewrite': A direct, active-voice rewrite where the real subject leads the action.\n"
                "   - 'antecedents': 1-2 concise sentences explaining what ambiguous referents in the passage specifically point back to in the paper."
            )

    elif lens_type in ("easy_citation", "easy-citation", "citation"):
        if lang_is_id:
            return (
                "You are an inline academic citation decoder. When academic papers cite external literature (e.g., '[1]', '[2-4]', '(Lu et al., 2018)'), readers lose flow having to scroll to the bibliography. Your job is to unpack why this reference is cited and what specific claim it supports.\n\n"
                "TARGET LANGUAGE: BAHASA INDONESIA (NATURAL, IDIOMATIC & HIGH-SIGNAL)\n"
                "STRICT RULES:\n"
                "1. Jelaskan dalam Bahasa Indonesia yang alami, luwes, dan lugas.\n"
                "2. Identifikasi penanda sitasi dalam kalimat.\n"
                "3. Jelaskan MENGAPA penulis mengutip referensi ini di titik kalimat ini.\n"
                "4. Sebutkan klaim faktual apa yang didukung oleh sitasi ini.\n\n"
                "STRUCTURE: Output valid JSON with:\n"
                "   - 'citation_label': Label sitasi yang ditemukan (misal: '[1]' atau '(Wang dkk., 2024)').\n"
                "   - 'reference_title': Judul atau topik penelitian yang dirujuk berdasarkan konteks paper.\n"
                "   - 'why_cited': 1-2 kalimat lugas menjelaskan ALASAN penulis mengutip karya ini di bagian ini.\n"
                "   - 'supporting_claim': Pernyataan atau klaim spesifik dalam kalimat yang divalidasi oleh sitasi ini."
            )
        else:
            return (
                "You are an inline academic citation decoder. When academic papers cite external literature (e.g., '[1]', '[2-4]', '(Lu et al., 2018)'), readers lose flow having to scroll to the bibliography. Your job is to unpack why this reference is cited and what specific claim it supports.\n\n"
                "TARGET LANGUAGE: ENGLISH\n"
                "STRICT RULES:\n"
                "1. Extract and identify the citation marker in the text.\n"
                "2. Deduce or extract the reference topic, author, or title from the paper context.\n"
                "3. Explain specifically WHY the author is citing this reference at this exact moment in the argument.\n"
                "4. State the precise factual assertion or claim backed by this citation.\n\n"
                "STRUCTURE: Output valid JSON with:\n"
                "   - 'citation_label': The exact citation tag (e.g. '[1]' or '(Lu et al., 2018)').\n"
                "   - 'reference_title': Inferred title/subject/authors of the cited work based on paper context.\n"
                "   - 'why_cited': 1-2 clear sentences explaining WHY the authors cite this reference here.\n"
                "   - 'supporting_claim': The specific assertion or premise in the selected sentence backed by this citation."
            )

    return SYSTEM_PROMPTS.get(lens_type, SYSTEM_PROMPTS["intuition"])


SYSTEM_PROMPTS: dict[str, str] = {
    "intuition": get_system_prompt("intuition", "en"),
    "translating_idea": get_system_prompt("intuition", "en"),
    "quick_reference": get_system_prompt("quick_reference", "en"),
    "easy_citation": get_system_prompt("easy_citation", "en"),
    "eli5": (
        "You are a gifted science communicator explaining a passage from an academic "
        "paper to an intelligent beginner. Use a vivid, relatable analogy. "
        "Avoid jargon entirely. Keep the response under 150 words. Format the reply "
        "in clean Markdown with one heading."
    ),
    "math": (
        "You are a rigorous mathematical analyst examining the selected passage. "
        "State precise dimensions, derive key identities, highlight computational complexity, "
        "and note numerical stability. Use LaTeX inline math ($ … $) and display math ($$ … $$). "
        "Keep the response under 250 words. Format the reply in clean Markdown with one heading."
    ),
}

# ---------------------------------------------------------------------------
# Baseline mock fallbacks
# ---------------------------------------------------------------------------
MOCK_RESPONSES: dict[str, dict[str, str]] = {
    "intuition": {
        "headline": "Core Action",
        "core_action": "Selected mechanism directly governs target system behavior.",
        "plain_meaning": "The author outlines the operational principles controlling the observed phenomenon.",
        "takeaway": "Establishes the fundamental operating constraint for this section of the paper.",
        "body": (
            "**⚡ CORE ACTION**\nSelected mechanism directly governs target system behavior.\n\n"
            "**📖 PLAIN ENGLISH**\nThe author outlines the operational principles controlling the observed phenomenon.\n\n"
            "**🎯 WHY IT MATTERS**\n• Establishes the fundamental operating constraint for this section."
        ),
    },
    "quick_reference": {
        "headline": "Quick Reference",
        "real_subject": "The authors (based on paper context)",
        "active_rewrite": "The authors identified three key operational parameters.",
        "antecedents": "Refers back to the primary methodology described in the preceding section.",
        "body": (
            "**👤 REAL SUBJECT / WHO DID WHAT**\nThe authors (based on paper context)\n\n"
            "**🔄 ACTIVE REWRITE**\nThe authors identified three key operational parameters.\n\n"
            "**🔗 ANTECEDENTS & REFERENTS**\nRefers back to the primary methodology described in the preceding section."
        ),
    },
    "easy_citation": {
        "headline": "Easy Citation",
        "citation_label": "[1]",
        "reference_title": "Foundational study on system architecture & bounds",
        "why_cited": "Cited to validate the empirical baseline and operational limits.",
        "supporting_claim": "The initial operating constraints and threshold boundaries.",
        "body": (
            "**🏷️ CITATION**: [1]\n\n"
            "**📖 REFERENCE CONTEXT**\nFoundational study on system architecture & bounds\n\n"
            "**🎯 WHY IT IS CITED**\nCited to validate the empirical baseline and operational limits.\n\n"
            "**⚖️ CLAIM BACKED**\nThe initial operating constraints and threshold boundaries."
        ),
    },
    "eli5": {
        "headline": "Simple Explanation",
        "body": (
            "## 🧒 Plain-English Overview\n\n"
            "This section introduces how parts of the system interact directly with each other, "
            "focusing on the strongest signals while filtering out background interference."
        ),
    },
    "math": {
        "headline": "Formal Analysis",
        "body": (
            "## 📐 Mathematical Formulation\n\n"
            "$$\\mathcal{L}_{\\text{total}} = \\sum_{i=1}^n \\omega_i \\cdot f(x_i)$$\n\n"
            "Normalized over sequence dimensions with bounded gradient bounds to ensure stable convergence."
        ),
    },
}

MOCK_PREBAKE: dict[str, Any] = {
    "symbols": {
        "Q": {"name": "Query matrix", "shape": "ℝ^{n×d_k}", "role": "Lookup keys for each token position"},
        "K": {"name": "Key matrix", "shape": "ℝ^{m×d_k}", "role": "Indexed representations matched against queries"},
        "V": {"name": "Value matrix", "shape": "ℝ^{m×d_v}", "role": "Content vectors aggregated by attention weights"},
        "d_k": {"name": "Key dimension", "shape": "scalar", "role": "Dimensionality of query/key projections (typically 64)"},
        "d_v": {"name": "Value dimension", "shape": "scalar", "role": "Dimensionality of value projections (typically 64)"},
        "n": {"name": "Query length", "shape": "scalar", "role": "Number of query positions (sequence length)"},
        "m": {"name": "Key/Value length", "shape": "scalar", "role": "Number of key-value positions"},
        "h": {"name": "Number of heads", "shape": "scalar", "role": "Parallel attention heads (typically 8)"},
        "softmax": {"name": "Softmax function", "shape": "ℝ^n → Δ^n", "role": "Row-wise normalisation to probability simplex"},
    },
    "anchors": {
        "scaled-dot-product": {
            "label": "Scaled Dot-Product Attention",
            "equation_id": "eq-1",
            "section": "3.2.1",
        },
        "multi-head": {
            "label": "Multi-Head Attention",
            "equation_id": "eq-2",
            "section": "3.2.2",
        },
        "positional-encoding": {
            "label": "Positional Encoding",
            "equation_id": "eq-3",
            "section": "3.5",
        },
    },
}


# ---------------------------------------------------------------------------
# Gemini SDK helper (lazy import so the app starts even without the package)
# ---------------------------------------------------------------------------

def _get_genai_client():
    """Return a configured google.genai client, or None on failure."""
    try:
        from google import genai
        api_key = get_gemini_api_key()
        if not api_key or api_key == "your_gemini_api_key_here":
            return None
        client = genai.Client(api_key=api_key)
        return client
    except Exception:
        logger.warning("Could not initialise Gemini client – falling back to mocks.")
        return None


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------

class LLMService:
    """Facade that resolves lens explanations via Gemini or deterministic mocks."""

    @property
    def api_key_present(self) -> bool:
        key = get_gemini_api_key()
        return bool(key and key != "your_gemini_api_key_here")

    # ----- public API -------------------------------------------------------

    async def resolve_lens(
        self,
        text: str,
        lens_type: str,
        context: dict[str, Any] | None = None,
        language: str = "en",
    ) -> dict[str, Any]:
        """Return an explanation dict for *text* under the requested *lens_type* and *language*."""
        lens_type = lens_type.lower().strip()
        if lens_type in ("intuition", "translating_idea", "translating-idea"):
            normalized_lens = "intuition"
        elif lens_type in ("quick_reference", "quick-reference", "quickref"):
            normalized_lens = "quick_reference"
        elif lens_type in ("easy_citation", "easy-citation", "citation"):
            normalized_lens = "easy_citation"
        else:
            normalized_lens = lens_type

        language = (language or "en").lower().strip()
        if language not in ("en", "id"):
            language = "en"

        valid_lenses = ("intuition", "quick_reference", "easy_citation", "eli5", "math")
        if normalized_lens not in valid_lenses:
            return {
                "success": False,
                "lens_type": normalized_lens,
                "language": language,
                "explanation": f"Unknown lens type '{normalized_lens}'. Choose from: translating_idea, quick_reference, easy_citation, eli5, math.",
            }

        if not self.api_key_present:
            return self._mock_lens(text, normalized_lens, context, language)

        return await self._live_lens(text, normalized_lens, context, language)

    async def prebake_paper(
        self,
        paper_content: str,
    ) -> dict[str, Any]:
        """Generate a pre-baked symbol table and anchor dictionary."""
        if not self.api_key_present:
            return {"success": True, **MOCK_PREBAKE}

        return await self._live_prebake(paper_content)

    async def prebake_context(
        self,
        paper_content: str,
        title: str = "",
    ) -> dict[str, Any]:
        """Pre-compute a global paper context (domain, core problem, method, key terms, constraints) to eliminate hallucination."""
        if not self.api_key_present:
            return self._mock_context(paper_content, title)

        return await self._live_context(paper_content, title)

    # ----- private: mock fallbacks ------------------------------------------

    @staticmethod
    def _mock_context(paper_content: str, title: str = "") -> dict[str, Any]:
        """Local offline extractor for paper context."""
        cleaned = re.sub(r"\s+", " ", paper_content[:2000]).strip()
        guessed_title = title or "Academic Research Paper"
        return {
            "success": True,
            "title": guessed_title,
            "domain": "Applied Science / Engineering Research",
            "core_problem": "Addressing critical detection limits and performance degradation in baseline system architectures.",
            "core_method": "A domain-specific modeling and optimization framework tailored to high-dimensional empirical signals.",
            "key_terms": {
                "Target Mechanism": "Primary operational principle analyzed across the experimental findings.",
                "Baseline Model": "Standard protection or classification baseline compared against proposed method.",
                "Empirical Bounds": "Observed boundary conditions and physical operating limits."
            },
            "constraints_and_bounds": [
                "Tested under standard experimental operating constraints.",
                "Parameters calibrated specifically to reported dataset thresholds."
            ]
        }

    @staticmethod
    def _mock_lens(
        text: str,
        lens_type: str,
        context: dict[str, Any] | None = None,
        language: str = "en",
    ) -> dict[str, Any]:
        """Return a dynamically grounded contextual fallback or baseline mock."""
        cleaned = re.sub(r"\s+", " ", text).strip()
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
        first_sent = sentences[0] if sentences else cleaned

        if lens_type == "intuition":
            parts = re.split(
                r",\s*(?:which|rendering|allowing|thereby|wherein|whereas|because|while|due to)\b",
                first_sent,
                flags=re.IGNORECASE,
            )
            core_subject = parts[0].strip().rstrip(".")
            consequence = (
                parts[1].strip().rstrip(".")
                if len(parts) > 1
                else ("secara langsung memengaruhi perilaku sistem yang diteliti" if language == "id" else "directly affects the observed system behavior")
            )

            if language == "id":
                core_action = f"{core_subject} -> {consequence}."
                plain_meaning = f"Secara lugas, {first_sent.rstrip('.')}."
                takeaway = "Menetapkan batasan atau mekanisme penting yang menjadi dasar kesimpulan paper."
                context_link = "Terhubung langsung dengan metodologi eksperimen dan perumusan masalah utama paper."
                body = (
                    f"**⚡ AKSI UTAMA**\n{core_action}\n\n"
                    f"**📖 PENJELASAN LUGAS (BATASAN TERJAGA)**\n{plain_meaning}\n\n"
                    f"**🎯 KENAPA PENTING**\n• {takeaway}\n\n"
                    f"**🔒 KAITAN KONTEKS PAPER**\n{context_link}"
                )
            else:
                core_action = f"{core_subject} -> {consequence}."
                plain_meaning = f"In plain terms, {first_sent.rstrip('.')}."
                takeaway = "Establishes a critical constraint or mechanism central to this section's conclusions."
                context_link = "Anchors directly to the paper's experimental findings and core problem definition."
                body = (
                    f"**⚡ CORE ACTION**\n{core_action}\n\n"
                    f"**📖 PLAIN ENGLISH (CONSTRAINTS PRESERVED)**\n{plain_meaning}\n\n"
                    f"**🎯 WHY IT MATTERS**\n• {takeaway}\n\n"
                    f"**🔒 CONTEXT ANCHOR**\n{context_link}"
                )
            return {
                "success": True,
                "lens_type": lens_type,
                "language": language,
                "core_action": core_action,
                "plain_meaning": plain_meaning,
                "takeaway": takeaway,
                "context_link": context_link,
                "explanation": body,
            }

        elif lens_type == "quick_reference":
            if language == "id":
                passive_phrases = ["dianalisis", "diidentifikasi"]
                real_subject = "Penulis / Tim Peneliti (berdasarkan konteks paper)"
                active_rewrite = f"Peneliti secara langsung menguji dan menemukan parameter: {first_sent[:120]}..."
                antecedents = "Merujuk pada metodologi dan batasan uji eksperimental yang telah didefinisikan sebelumnya."
                body = (
                    f"**👤 SUBJEK ASLI / PELAKU**\n{real_subject}\n\n"
                    f"**🔄 REKONSTRUKSI KALIMAT AKTIF**\n{active_rewrite}\n\n"
                    f"**🔗 RUJUKAN AMBIGU / ANTESEDEN**\n{antecedents}"
                )
            else:
                passive_phrases = ["were analyzed", "were identified"]
                real_subject = "The authors / Research team (grounded in paper context)"
                active_rewrite = f"The authors directly investigated and established: {first_sent[:120]}..."
                antecedents = "Refers back to the experimental methodology and bounds defined in the preceding section."
                body = (
                    f"**👤 REAL SUBJECT / WHO DID WHAT**\n{real_subject}\n\n"
                    f"**🔄 ACTIVE REWRITE**\n{active_rewrite}\n\n"
                    f"**🔗 ANTECEDENTS & REFERENTS**\n{antecedents}"
                )
            return {
                "success": True,
                "lens_type": lens_type,
                "language": language,
                "passive_phrases": passive_phrases,
                "real_subject": real_subject,
                "active_rewrite": active_rewrite,
                "antecedents": antecedents,
                "explanation": body,
            }

        elif lens_type == "easy_citation":
            # Extract bracketed citation if present
            cit_match = re.search(r"\[\s*\d+(?:[\s,\-–—]+\d+)*\s*\]|\([A-Za-z\s\.\-&]+,?\s*\d{4}\)", text)
            citation_label = cit_match.group(0) if cit_match else "[1]"
            if language == "id":
                reference_title = "Studi Acuan Literatur Utama tentang Karakteristik Sistem & Batasan Uji"
                why_cited = "Dikutip sebagai rujukan literatur untuk memvalidasi landasan empiris dan batas operasional sistem."
                supporting_claim = f"Klaim pengujian spesifik yang dinyatakan dalam kalimat: '{first_sent[:100]}...'"
                body = (
                    f"**🏷️ LABEL SITASI**: {citation_label}\n\n"
                    f"**📖 KONTEKS REFERENSI**\n{reference_title}\n\n"
                    f"**🎯 MENGAPA DIKUTIP**\n{why_cited}\n\n"
                    f"**⚖️ KLAIM YANG DIDUKUNG**\n{supporting_claim}"
                )
            else:
                reference_title = "Foundational Literature Study on System Architecture & Operating Limits"
                why_cited = "Cited as direct empirical grounding to validate the author's primary baseline and parameters."
                supporting_claim = f"The specific factual assertion stated in the sentence: '{first_sent[:100]}...'"
                body = (
                    f"**🏷️ CITATION**: {citation_label}\n\n"
                    f"**📖 REFERENCE CONTEXT**\n{reference_title}\n\n"
                    f"**🎯 WHY IT IS CITED**\n{why_cited}\n\n"
                    f"**⚖️ CLAIM BACKED**\n{supporting_claim}"
                )
            return {
                "success": True,
                "lens_type": lens_type,
                "language": language,
                "citation_label": citation_label,
                "reference_title": reference_title,
                "why_cited": why_cited,
                "supporting_claim": supporting_claim,
                "explanation": body,
            }

        mock = MOCK_RESPONSES.get(lens_type, MOCK_RESPONSES["intuition"])
        return {
            "success": True,
            "lens_type": lens_type,
            "language": language,
            "explanation": mock["body"],
        }

    # ----- private: live Gemini calls ---------------------------------------

    async def _live_context(self, paper_content: str, title: str = "") -> dict[str, Any]:
        client = _get_genai_client()
        if client is None:
            return self._mock_context(paper_content, title)

        system_prompt = (
            "You are a scholarly paper indexing engine. Analyze this research paper and extract its global context to anchor downstream sentence explanations.\n\n"
            "Return a JSON object with:\n"
            "- 'title': Paper title (use provided title if accurate, or extract from text)\n"
            "- 'domain': Specific scientific / engineering domain\n"
            "- 'core_problem': What specific problem the paper solves (1 sentence)\n"
            "- 'core_method': What method or architecture the authors propose (1 sentence)\n"
            "- 'key_terms': A dictionary mapping 4-8 specialized terms / variables / algorithms defined in the paper to their concise definitions in this paper\n"
            "- 'constraints_and_bounds': A list of 2-4 critical operating conditions, thresholds, or physical limits noted in the paper (e.g. voltage ranges, current levels, sampling rates)"
        )

        user_content = f"Title hint: {title}\n\nPaper Content:\n{paper_content[:10000]}"

        for model_name in GEMINI_MODELS:
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model_name,
                    contents=user_content,
                    config={
                        "system_instruction": system_prompt,
                        "temperature": 0.1,
                        "response_mime_type": "application/json",
                        "max_output_tokens": 1500,
                    },
                )
                raw = (response.text or "").strip()
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                data = json.loads(raw)
                return {"success": True, **data}
            except Exception as exc:
                logger.warning("Gemini model '%s' failed for prebake_context: %s", model_name, exc)
                continue

        return self._mock_context(paper_content, title)

    async def _live_lens(
        self,
        text: str,
        lens_type: str,
        context: dict[str, Any] | None,
        language: str = "en",
    ) -> dict[str, Any]:
        client = _get_genai_client()
        if client is None:
            return self._mock_lens(text, lens_type, context, language)

        system_prompt = get_system_prompt(lens_type, language)
        lang_is_id = language == "id"
        
        user_prompt = ""
        if context:
            paper_ctx = context.get("paper_context") or context
            if isinstance(paper_ctx, dict) and any(k in paper_ctx for k in ("domain", "core_problem", "key_terms")):
                user_prompt += (
                    f"GLOBAL PAPER CONTEXT (Use this to resolve all pronouns, acronyms, variables, and technical terms to avoid out-of-context hallucinations):\n"
                    f"Title: {paper_ctx.get('title', 'Unknown')}\n"
                    f"Domain: {paper_ctx.get('domain', 'Unknown')}\n"
                    f"Core Problem: {paper_ctx.get('core_problem', 'Unknown')}\n"
                    f"Core Method: {paper_ctx.get('core_method', 'Unknown')}\n"
                    f"Key Terms: {json.dumps(paper_ctx.get('key_terms', {}))}\n"
                    f"Operating Constraints: {json.dumps(paper_ctx.get('constraints_and_bounds', []))}\n\n"
                )
        user_prompt += f"TARGET LANGUAGE: {'BAHASA INDONESIA' if lang_is_id else 'ENGLISH'}\n"
        user_prompt += f"SELECTED PASSAGE:\n\"{text}\""

        last_exc: Exception | None = None
        is_json_lens = lens_type in ("intuition", "quick_reference", "easy_citation")

        for model_name in GEMINI_MODELS:
            try:
                config_params: dict[str, Any] = {
                    "system_instruction": system_prompt,
                    "temperature": 0.1 if is_json_lens else 0.5,
                    "max_output_tokens": 1024,
                }
                if is_json_lens:
                    config_params["response_mime_type"] = "application/json"

                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model_name,
                    contents=user_prompt,
                    config=config_params,
                )
                raw = (response.text or "").strip()

                if is_json_lens:
                    if raw.startswith("```"):
                        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                    try:
                        data = json.loads(raw)
                        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                            data = data[0]
                    except Exception:
                        data = {}

                    if lens_type == "intuition":
                        core_action = _clean_str(data.get("core_action"))
                        plain_meaning = _clean_str(data.get("plain_meaning"), raw)
                        takeaway = _clean_str(data.get("takeaway"))
                        context_link = _clean_str(data.get("context_link"))

                        if core_action and plain_meaning:
                            explanation = (
                                f"**⚡ {'AKSI UTAMA' if lang_is_id else 'CORE ACTION'}**\n{core_action}\n\n"
                                f"**📖 {'PENJELASAN LUGAS (BATASAN TERJAGA)' if lang_is_id else 'PLAIN ENGLISH (CONSTRAINTS PRESERVED)'}**\n{plain_meaning}\n\n"
                                f"**🎯 {'KENAPA PENTING' if lang_is_id else 'WHY IT MATTERS'}**\n• {takeaway}"
                            )
                            if context_link:
                                explanation += f"\n\n**🔒 {'KAITAN KONTEKS PAPER' if lang_is_id else 'CONTEXT ANCHOR'}**\n{context_link}"
                        else:
                            explanation = raw

                        return {
                            "success": True,
                            "lens_type": lens_type,
                            "language": language,
                            "core_action": core_action,
                            "plain_meaning": plain_meaning,
                            "takeaway": takeaway,
                            "context_link": context_link,
                            "explanation": explanation,
                        }

                    elif lens_type == "quick_reference":
                        raw_passive = data.get("passive_phrases", [])
                        if isinstance(raw_passive, str):
                            passive_phrases = [raw_passive]
                        elif isinstance(raw_passive, list):
                            passive_phrases = [str(p).strip() for p in raw_passive if p]
                        else:
                            passive_phrases = [str(raw_passive)]

                        real_subject = _clean_str(data.get("real_subject"), "The authors / experimenters")
                        active_rewrite = _clean_str(data.get("active_rewrite"), raw)
                        antecedents = _clean_str(data.get("antecedents"))

                        explanation = (
                            f"**👤 {'SUBJEK ASLI / PELAKU' if lang_is_id else 'REAL SUBJECT / WHO DID WHAT'}**\n{real_subject}\n\n"
                            f"**🔄 {'REKONSTRUKSI KALIMAT AKTIF' if lang_is_id else 'ACTIVE REWRITE'}**\n{active_rewrite}\n\n"
                            f"**🔗 {'RUJUKAN AMBIGU / ANTESEDEN' if lang_is_id else 'ANTECEDENTS & REFERENTS'}**\n{antecedents}"
                        )
                        return {
                            "success": True,
                            "lens_type": lens_type,
                            "language": language,
                            "passive_phrases": passive_phrases,
                            "real_subject": real_subject,
                            "active_rewrite": active_rewrite,
                            "antecedents": antecedents,
                            "explanation": explanation,
                        }

                    elif lens_type == "easy_citation":
                        citation_label = _clean_str(data.get("citation_label"), "[Citation]")
                        reference_title = _clean_str(data.get("reference_title"), "Referenced study")
                        why_cited = _clean_str(data.get("why_cited"), "Provides empirical foundation")
                        supporting_claim = _clean_str(data.get("supporting_claim"))

                        explanation = (
                            f"**🏷️ {'LABEL SITASI' if lang_is_id else 'CITATION'}**: {citation_label}\n\n"
                            f"**📖 {'KONTEKS REFERENSI' if lang_is_id else 'REFERENCE CONTEXT'}**\n{reference_title}\n\n"
                            f"**🎯 {'MENGAPA DIKUTIP' if lang_is_id else 'WHY IT IS CITED'}**\n{why_cited}\n\n"
                            f"**⚖️ {'KLAIM YANG DIDUKUNG' if lang_is_id else 'CLAIM BACKED'}**\n{supporting_claim}"
                        )
                        return {
                            "success": True,
                            "lens_type": lens_type,
                            "language": language,
                            "citation_label": citation_label,
                            "reference_title": reference_title,
                            "why_cited": why_cited,
                            "supporting_claim": supporting_claim,
                            "explanation": explanation,
                        }

                # Non-intuition lenses (eli5, math)
                return {
                    "success": True,
                    "lens_type": lens_type,
                    "language": language,
                    "explanation": raw,
                }
            except Exception as exc:
                last_exc = exc
                logger.warning(
                    "Gemini model '%s' failed for lens '%s' (lang=%s): %s. Trying next candidate...",
                    model_name,
                    lens_type,
                    language,
                    exc,
                )
                continue

        logger.exception("All Gemini models failed for lens '%s': %s", lens_type, last_exc)
        fallback = self._mock_lens(text, lens_type, context, language)
        return fallback

    async def _live_prebake(self, paper_content: str) -> dict[str, Any]:
        client = _get_genai_client()
        if client is None:
            return {"success": True, **MOCK_PREBAKE}

        system_prompt = (
            "You are a scholarly indexing assistant.  Given the full text of an "
            "academic paper, extract:\n"
            "1. A **symbols** dict mapping each mathematical symbol to its name, "
            "   tensor shape, and role.\n"
            "2. An **anchors** dict mapping semantic IDs to their label, equation "
            "   number, and section.\n"
            "Return valid JSON with keys 'symbols' and 'anchors'."
        )

        for model_name in GEMINI_MODELS:
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model_name,
                    contents=paper_content[:12000],
                    config={
                        "system_instruction": system_prompt,
                        "temperature": 0.2,
                        "max_output_tokens": 2048,
                    },
                )
                raw = response.text or "{}"
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
                data = json.loads(raw)
                return {"success": True, **data}
            except Exception as exc:
                logger.warning("Gemini model '%s' prebake failed: %s", model_name, exc)
                continue

        return {"success": True, **MOCK_PREBAKE}
