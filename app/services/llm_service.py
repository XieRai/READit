"""
LLM service – talks to Gemini when a key is available, otherwise returns
high-quality deterministic mock responses so the app never 500s.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.config import GEMINI_API_KEY, get_gemini_api_key

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompts per lens type
# ---------------------------------------------------------------------------
SYSTEM_PROMPTS: dict[str, str] = {
    "intuition": (
        "You are an expert machine-learning researcher explaining concepts to a "
        "curious graduate student.  Given the selected passage from a paper, "
        "provide a clear conceptual intuition — what the mechanism does, WHY it "
        "works, and what would go wrong without it.  Use concrete analogies where "
        "helpful but keep the language precise.  Keep the response under 250 words. "
        "Format the reply in clean Markdown with one heading."
    ),
    "eli5": (
        "You are a gifted science communicator explaining a passage from a deep-learning "
        "paper to a smart five-year-old.  Use a vivid, relatable analogy (playground, "
        "kitchen, sports, animals).  Avoid jargon entirely.  Keep the response under "
        "180 words.  Format the reply in clean Markdown with one heading."
    ),
    "math": (
        "You are a rigorous mathematician providing a formal analysis of the selected "
        "passage from a deep-learning paper.  State precise dimensions, derive key "
        "identities, highlight computational complexity, and note numerical stability "
        "considerations.  Use LaTeX inline math ($ … $) and display math ($$ … $$).  "
        "Keep the response under 300 words.  Format the reply in clean Markdown with "
        "one heading."
    ),
}

# ---------------------------------------------------------------------------
# High-quality mock responses (used when GEMINI_API_KEY is absent / invalid)
# ---------------------------------------------------------------------------
MOCK_RESPONSES: dict[str, dict[str, str]] = {
    "intuition": {
        "headline": "Core Intuition",
        "body": (
            "## 💡 Core Intuition\n\n"
            "The selected passage describes a mechanism that lets each token in a "
            "sequence **directly query every other token** for relevant information, "
            "rather than relying on a fixed-size hidden state passed step-by-step.\n\n"
            "Think of it like a conference room where, instead of whispering a "
            "message down a long chain of people (recurrence), every person can "
            "simply raise their hand and ask the exact colleague who has the answer.  "
            "The *scaling factor* `1/√dₖ` keeps the 'volume' of everyone's voice "
            "balanced so that no single person drowns out the rest.\n\n"
            "Without this mechanism, the model would compress an entire 512-token "
            "sentence into one vector — losing nuance the way a lossy JPEG loses "
            "fine detail."
        ),
    },
    "eli5": {
        "headline": "Simple Explanation",
        "body": (
            "## 🧒 Explain Like I'm 5\n\n"
            "Imagine you have a big box of crayons and you want to colour a "
            "picture of a dragon.  Instead of grabbing crayons one at a time with "
            "your eyes closed, you look at **all** the crayons at once and pick "
            "exactly the right colours you need — green for the body, red for the "
            "fire, yellow for the eyes.\n\n"
            "That's what this formula does with words!  It looks at every word in "
            "a sentence all at the same time and figures out which words are "
            "important for understanding each other word.  The little division "
            "sign (`÷ √dₖ`) is like making sure nobody yells too loud so you can "
            "hear everyone clearly. 🎨"
        ),
    },
    "math": {
        "headline": "Formal Analysis",
        "body": (
            "## 📐 Formal Mathematical Analysis\n\n"
            "Given queries $Q \\in \\mathbb{R}^{n \\times d_k}$, keys "
            "$K \\in \\mathbb{R}^{m \\times d_k}$, and values "
            "$V \\in \\mathbb{R}^{m \\times d_v}$, the scaled dot-product "
            "attention is:\n\n"
            "$$\\text{Attention}(Q, K, V) = \\text{softmax}\\!\\left("
            "\\frac{QK^\\top}{\\sqrt{d_k}}\\right) V$$\n\n"
            "**Complexity.** The matrix product $QK^\\top$ is $O(n \\cdot m "
            "\\cdot d_k)$; when $n = m$ (self-attention) this becomes "
            "$O(n^2 d_k)$.\n\n"
            "**Scaling rationale.** For i.i.d. components $q_i, k_i \\sim "
            "\\mathcal{N}(0, 1)$ the dot product has $\\mathbb{E}[q \\cdot k] = 0$ "
            "and $\\text{Var}(q \\cdot k) = d_k$.  Dividing by $\\sqrt{d_k}$ "
            "normalises variance to 1, preventing the softmax from saturating "
            "into a near-one-hot distribution where gradients vanish.\n\n"
            "**Numerical note.** Implementations subtract $\\max_j(QK^\\top_{ij})$ "
            "per row before exponentiating to avoid floating-point overflow."
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
    ) -> dict[str, Any]:
        """Return an explanation dict for *text* under the requested *lens_type*."""
        lens_type = lens_type.lower().strip()
        if lens_type not in SYSTEM_PROMPTS:
            return {
                "success": False,
                "lens_type": lens_type,
                "explanation": f"Unknown lens type '{lens_type}'.  Choose from: intuition, eli5, math.",
            }

        if not self.api_key_present:
            return self._mock_lens(text, lens_type)

        return await self._live_lens(text, lens_type, context)

    async def prebake_paper(
        self,
        paper_content: str,
    ) -> dict[str, Any]:
        """Generate a pre-baked symbol table and anchor dictionary."""
        if not self.api_key_present:
            return {"success": True, **MOCK_PREBAKE}

        return await self._live_prebake(paper_content)

    # ----- private: mock fallbacks ------------------------------------------

    @staticmethod
    def _mock_lens(text: str, lens_type: str) -> dict[str, Any]:
        mock = MOCK_RESPONSES[lens_type]
        return {
            "success": True,
            "lens_type": lens_type,
            "explanation": mock["body"],
        }

    # ----- private: live Gemini calls ---------------------------------------

    async def _live_lens(
        self,
        text: str,
        lens_type: str,
        context: dict[str, Any] | None,
    ) -> dict[str, Any]:
        client = _get_genai_client()
        if client is None:
            return self._mock_lens(text, lens_type)

        system_prompt = SYSTEM_PROMPTS[lens_type]
        user_prompt = f"Selected passage:\n\n\"{text}\""
        if context:
            user_prompt += f"\n\nAdditional context: {context}"

        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.0-flash",
                contents=user_prompt,
                config={
                    "system_instruction": system_prompt,
                    "temperature": 0.7,
                    "max_output_tokens": 1024,
                },
            )
            explanation = response.text or "(No response text returned.)"
            return {
                "success": True,
                "lens_type": lens_type,
                "explanation": explanation,
            }
        except Exception as exc:
            logger.exception("Gemini API call failed for lens '%s'", lens_type)
            fallback = self._mock_lens(text, lens_type)
            fallback["explanation"] += (
                f"\n\n---\n*⚠️ Live API call failed ({exc.__class__.__name__}); "
                "showing cached response.*"
            )
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

        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.0-flash",
                contents=paper_content[:12000],
                config={
                    "system_instruction": system_prompt,
                    "temperature": 0.2,
                    "max_output_tokens": 2048,
                },
            )
            import json
            raw = response.text or "{}"
            # Strip markdown code fences if the model wraps its reply
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            data = json.loads(raw)
            return {"success": True, **data}
        except Exception as exc:
            logger.exception("Gemini prebake call failed")
            return {"success": True, **MOCK_PREBAKE}
