/**
 * ScholarLens – client-side interaction controller
 *
 * Handles:
 *  1.  Text selection  → floating palette positioning
 *  2.  Lens buttons    → POST /api/lens and render response
 *  3.  Equation toggle → smooth .stretch-drawer accordion
 */

(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // DOM references
  // -----------------------------------------------------------------------
  const paperBody       = document.getElementById("paper-body") || document.getElementById("paper-viewport");
  const palette         = document.getElementById("floating-palette");
  const paletteArrow    = document.getElementById("palette-arrow");
  const explanationPane = document.getElementById("explanation-pane");
  const explanationText = document.getElementById("explanation-text");
  const lensButtons     = document.querySelectorAll(".lens-btn");
  const equationBlocks  = document.querySelectorAll(".equation-block");
  const progressBar     = document.getElementById("reading-progress");

  // -----------------------------------------------------------------------
  // 1. TEXT SELECTION  →  FLOATING PALETTE
  // -----------------------------------------------------------------------

  /**
   * Show #floating-palette above (or below) the user's text selection.
   */
  function positionPalette(rect) {
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hidePalette();
      return;
    }

    // Reset explanation pane on new selection
    closeExplanation();

    palette.classList.add("visible");

    const paletteRect = palette.getBoundingClientRect();
    const pad = 10;

    // Horizontal: centre on selection, clamp to viewport
    let left = rect.left + rect.width / 2 - paletteRect.width / 2 + window.scrollX;
    left = Math.max(pad, Math.min(left, document.documentElement.clientWidth - paletteRect.width - pad + window.scrollX));

    // Vertical: prefer above selection
    let top = rect.top + window.scrollY - paletteRect.height - pad;
    let arrowFlip = false;

    if (top - window.scrollY < pad) {
      // Not enough room above → place below
      top = rect.bottom + window.scrollY + pad;
      arrowFlip = true;
    }

    palette.style.left = `${left}px`;
    palette.style.top  = `${top}px`;

    if (arrowFlip) {
      paletteArrow.classList.add("arrow-flip");
    } else {
      paletteArrow.classList.remove("arrow-flip");
    }
  }

  function hidePalette() {
    palette.classList.remove("visible");
    closeExplanation();
  }

  function closeExplanation() {
    explanationPane.classList.remove("open");
    explanationText.textContent = "";
  }

  // Listen for selection changes inside the paper container
  if (paperBody) {
    paperBody.addEventListener("mouseup", () => {
      // Small delay so the browser finalises the selection
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { hidePalette(); return; }

        const text = sel.toString().trim();
        if (text.length < 3) { hidePalette(); return; }

        currentSelection = text;
        const range = sel.getRangeAt(0);
        positionPalette(range.getBoundingClientRect());
      });
    });
  }

  // Hide palette when clicking outside it (and outside the paper)
  document.addEventListener("mousedown", (e) => {
    if (palette && palette.contains(e.target)) return;
    // Let the mouseup handler on paperBody decide visibility
    if (paperBody && paperBody.contains(e.target)) return;
    hidePalette();
  });

  // Keep palette positioned on scroll
  window.addEventListener("scroll", () => {
    updateReadingProgress();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && palette.classList.contains("visible")) {
      positionPalette(sel.getRangeAt(0).getBoundingClientRect());
    }
  }, { passive: true });

  // -----------------------------------------------------------------------
  // 2. LENS BUTTONS  →  /api/lens
  // -----------------------------------------------------------------------

  lensButtons.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const lensType = btn.dataset.lens;
      if (!currentSelection || !lensType) return;

      // Prevent double-click while loading
      if (activeBtn) return;
      activeBtn = btn;

      // Show spinner inside the button
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `<span class="lens-spinner"></span>`;
      btn.disabled = true;

      try {
        const res = await fetch("/api/lens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: currentSelection,
            lens_type: lensType,
            context: null,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        // Render explanation (supports basic Markdown → HTML)
        explanationText.innerHTML = renderMarkdown(data.explanation || "No explanation returned.");
        explanationPane.classList.add("open");

        // Re-render KaTeX in the newly injected content
        if (window.renderMathInElement) {
          renderMathInElement(explanationPane, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$",  right: "$",  display: false },
            ],
            throwOnError: false,
          });
        }
      } catch (err) {
        explanationText.innerHTML = `<p class="text-red-400 text-sm">Request failed: ${err.message}</p>`;
        explanationPane.classList.add("open");
      } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        activeBtn = null;
      }
    });
  });

  // -----------------------------------------------------------------------
  // 3. EQUATION BLOCK  →  STRETCH DRAWER TOGGLE
  // -----------------------------------------------------------------------

  equationBlocks.forEach((block) => {
    block.addEventListener("click", () => {
      const drawer = block.querySelector(".stretch-drawer");
      if (!drawer) return;

      const isExpanding = !drawer.classList.contains("expanded");

      // Toggle visual state
      block.classList.toggle("active", isExpanding);
      drawer.classList.toggle("expanded", isExpanding);

      // Dynamically measure content height for smooth expansion
      if (isExpanding) {
        const inner = drawer.firstElementChild;
        if (inner) {
          drawer.style.maxHeight = inner.scrollHeight + "px";
        }
      } else {
        drawer.style.maxHeight = "0px";
      }
    });
  });

  // -----------------------------------------------------------------------
  // 4. READING PROGRESS BAR
  // -----------------------------------------------------------------------

  function updateReadingProgress() {
    if (!progressBar) return;
    const scrollTop  = window.scrollY;
    const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
    const pct        = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }

  // -----------------------------------------------------------------------
  // 5. LIGHTWEIGHT MARKDOWN → HTML RENDERER
  // -----------------------------------------------------------------------

  /**
   * Minimal Markdown-to-HTML converter for the explanation pane.
   * Handles: headings, bold, italic, inline code, paragraphs, lists, hr.
   */
  function renderMarkdown(md) {
    let html = md
      // Horizontal rules
      .replace(/^---$/gm, "<hr class='my-3 border-zinc-700'>")
      // Headings (## and ###)
      .replace(/^### (.+)$/gm, "<h4 class='text-sm font-bold text-zinc-200 mt-3 mb-1'>$1</h4>")
      .replace(/^## (.+)$/gm, "<h3 class='text-base font-bold text-zinc-100 mt-3 mb-1.5'>$1</h3>")
      // Bold & italic
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code class='bg-zinc-700/60 text-zinc-200 px-1 py-0.5 rounded text-xs font-mono'>$1</code>")
      // Unordered list items
      .replace(/^[-*] (.+)$/gm, "<li class='ml-4 list-disc text-zinc-300 text-sm'>$1</li>")

    // Wrap consecutive <li> runs in <ul>
    html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, "<ul class='my-2'>$1</ul>");

    // Paragraphs: split on double newlines
    html = html
      .split(/\n{2,}/)
      .map((block) => {
        block = block.trim();
        if (!block) return "";
        // Don't wrap elements that are already block-level
        if (/^<(h[1-6]|ul|ol|li|hr|blockquote|div|table)/i.test(block)) return block;
        return `<p class="text-sm text-zinc-300 leading-relaxed mb-2">${block.replace(/\n/g, " ")}</p>`;
      })
      .join("\n");

    return html;
  }

  // -----------------------------------------------------------------------
  // INIT
  // -----------------------------------------------------------------------
  updateReadingProgress();

  const STORAGE_KEY = "cognitive_recents";
  const DEFAULT_PAPER = {
    id: "default-paper",
    filename: "attention-is-all-you-need.html",
    title: "Attention Is All You Need",
    content: `
      <header class="mb-10 pb-8 border-b border-zinc-200">
        <div class="inline-flex items-center gap-2 bg-blue-50 text-blue-700 font-sans text-xs font-semibold px-3 py-1 rounded-full mb-5">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
          NeurIPS 2017 &bull; Landmark Architecture Paper
        </div>

        <h1 class="text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-zinc-900 mb-4">Attention Is All You Need</h1>

        <p class="font-sans text-sm text-zinc-500 leading-relaxed mb-1">
          Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin
        </p>
        <p class="font-sans text-xs text-zinc-400 italic">
          Google Brain &middot; Google Research &middot; University of Toronto
        </p>
      </header>

      <div class="bg-white border border-zinc-300 border-l-4 border-l-blue-500 rounded-lg px-5 py-4 mb-10 shadow-sm font-sans">
        <div class="flex items-center gap-2 text-sm font-bold text-zinc-800 mb-1">
          <span>✨</span> Interactive Reading Mode
        </div>
        <p class="text-xs text-zinc-500 leading-relaxed">
          Select any passage to summon the floating toolbar. Click an equation block to expand its derivation.
        </p>
        <div class="flex flex-wrap gap-2 mt-3">
          <span class="bg-zinc-100 border border-zinc-200 rounded-full px-3 py-0.5 text-xs font-semibold text-zinc-700">📐 Equation accordions</span>
          <span class="bg-zinc-100 border border-zinc-200 rounded-full px-3 py-0.5 text-xs font-semibold text-zinc-700">💡 Intuition lens</span>
          <span class="bg-zinc-100 border border-zinc-200 rounded-full px-3 py-0.5 text-xs font-semibold text-zinc-700">🧒 ELI5 lens</span>
          <span class="bg-zinc-100 border border-zinc-200 rounded-full px-3 py-0.5 text-xs font-semibold text-zinc-700">📐 Math lens</span>
        </div>
      </div>

      <section class="bg-zinc-50 border border-zinc-200 rounded-xl p-6 mb-10 shadow-sm">
        <h2 class="font-sans text-xs font-bold uppercase tracking-widest text-zinc-400 mb-3">Abstract</h2>
        <p class="text-lg leading-relaxed italic text-zinc-700">
          The dominant sequence transduction models are based on complex recurrent or convolutional neural networks
          that include an encoder and a decoder. The best performing models also connect the encoder and decoder
          through an attention mechanism. We propose a new simple network architecture, the
          <strong class="not-italic">Transformer</strong>, based solely on attention mechanisms, dispensing with
          recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to
          be superior in quality while being more parallelizable and requiring significantly less time to train.
        </p>
      </section>

      <section id="sec-3-2" class="mb-12">
        <h2 class="text-2xl font-bold mb-5 pb-2 border-b border-zinc-200 scroll-mt-20">3.2 &ensp;Scaled Dot-Product Attention</h2>

        <p class="text-lg leading-[1.85] mb-5 text-justify hyphens-auto">
          An attention function can be described as mapping a query and a set of key-value pairs to an output,
          where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of
          the values, where the weight assigned to each value is computed by a compatibility function of the query
          with the corresponding key.
        </p>

        <p class="text-lg leading-[1.85] mb-5 text-justify hyphens-auto">
          We call our particular attention <strong>"Scaled Dot-Product Attention"</strong>. The input consists of
          queries and keys of dimension $d_k$, and values of dimension $d_v$. We compute the dot products of the
          query with all keys, divide each by $\sqrt{d_k}$, and apply a softmax function to obtain the weights on
          the values.
        </p>

        <div class="equation-block bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm my-8" id="eq-scaled-dot-product">
          <div class="px-6 pt-5 pb-3">
            <div class="flex items-center justify-between font-sans text-xs mb-3">
              <span class="bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded">Core Equation</span>
              <span class="text-zinc-400 font-mono font-medium">Eq. (1)</span>
            </div>
            <div class="text-center text-xl py-3 overflow-x-auto">
              $$\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right)V$$
            </div>
          </div>

          <div class="flex items-center justify-between px-6 py-3 bg-zinc-50 border-t border-zinc-200 font-sans text-sm font-semibold text-zinc-500 select-none">
            <div class="flex items-center gap-2">
              <svg class="drawer-chevron w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Inspect variable breakdown &amp; scaling rationale</span>
            </div>
            <span class="text-xs text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full font-semibold">Click to toggle</span>
          </div>

          <div class="stretch-drawer">
            <div class="p-6 border-t border-dashed border-zinc-200 bg-white font-sans">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div class="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                  <div class="flex items-center gap-2 text-sm font-bold text-zinc-800 mb-2">
                    <span class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem]">1</span>
                    Matrix Product $QK^\top$
                  </div>
                  <p class="text-xs text-zinc-500 leading-relaxed">
                    Computes pairwise compatibility scores. For $Q \in \mathbb{R}^{n \times d_k}$ and $K^\top \in \mathbb{R}^{d_k \times n}$,
                    the result is an $n \times n$ attention matrix encoding mutual token resonance.
                  </p>
                </div>

                <div class="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                  <div class="flex items-center gap-2 text-sm font-bold text-zinc-800 mb-2">
                    <span class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem]">2</span>
                    Variance Scaling $\frac{1}{\sqrt{d_k}}$
                  </div>
                  <p class="text-xs text-zinc-500 leading-relaxed">
                    For i.i.d. components $q_i, k_i \sim \mathcal{N}(0,1)$, the dot product has variance $d_k$.
                    Dividing by $\sqrt{d_k}$ restores unit variance, preventing softmax saturation and vanishing gradients.
                  </p>
                </div>

                <div class="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                  <div class="flex items-center gap-2 text-sm font-bold text-zinc-800 mb-2">
                    <span class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem]">3</span>
                    Softmax Normalisation
                  </div>
                  <p class="text-xs text-zinc-500 leading-relaxed">
                    Applies $\text{softmax}(z_i) = e^{z_i}\!\/\!\sum_j e^{z_j}$ row-wise, converting unbounded
                    logits into a valid probability distribution that sums to $1.0$.
                  </p>
                </div>

                <div class="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                  <div class="flex items-center gap-2 text-sm font-bold text-zinc-800 mb-2">
                    <span class="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem]">4</span>
                    Value Aggregation $\times\, V$
                  </div>
                  <p class="text-xs text-zinc-500 leading-relaxed">
                    Multiplies the attention distribution by $V \in \mathbb{R}^{n \times d_v}$.
                    Each output row becomes a context-weighted convex combination of value vectors.
                  </p>
                </div>
              </div>

              <div class="flex gap-3 items-start bg-blue-50/60 border border-blue-100 rounded-lg p-4 text-sm text-zinc-700 leading-relaxed">
                <span class="text-lg">💡</span>
                <div>
                  <strong class="text-zinc-800">Why dot-product over additive attention?</strong>
                  Dot-product attention can be implemented using highly optimised BLAS matrix-multiply routines,
                  making it significantly faster and more memory-efficient than additive attention in practice,
                  despite similar theoretical complexity.
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="text-lg leading-[1.85] mb-5 text-justify hyphens-auto">
          In practice, we compute the attention function on a set of queries simultaneously, packed together into a
          matrix $Q$. The keys and values are also packed together into matrices $K$ and $V$. We compute the matrix
          of outputs as shown in Equation (1).
        </p>

        <p class="text-lg leading-[1.85] mb-5 text-justify hyphens-auto">
          The two most commonly used attention functions are additive attention and dot-product (multiplicative)
          attention. Dot-product attention is identical to our algorithm, except for the scaling factor of
          $\frac{1}{\sqrt{d_k}}$. Additive attention computes the compatibility function using a feed-forward
          network with a single hidden layer. While the two are similar in theoretical complexity, dot-product
          attention is much faster and more space-efficient in practice, since it can be implemented using highly
          optimized matrix multiplication code.
        </p>

        <p class="text-lg leading-[1.85] text-justify hyphens-auto">
          While for small values of $d_k$ the two mechanisms perform similarly, additive attention outperforms
          dot-product attention without scaling for larger values of $d_k$. We suspect that for large values of
          $d_k$, the dot products grow large in magnitude, pushing the softmax function into regions where it has
          extremely small gradients. To counteract this effect, we scale the dot products by $\frac{1}{\sqrt{d_k}}$.
        </p>
      </section>

      <section id="sec-3-2-2" class="mb-12">
        <h2 class="text-2xl font-bold mb-5 pb-2 border-b border-zinc-200 scroll-mt-20">3.2.2 &ensp;Multi-Head Attention</h2>

        <p class="text-lg leading-[1.85] mb-5 text-justify hyphens-auto">
          Instead of performing a single attention function with $d_{\text{model}}$-dimensional keys, values, and
          queries, we found it beneficial to linearly project the queries, keys, and values $h$ times with
          different, learned linear projections to $d_k$, $d_k$, and $d_v$ dimensions, respectively. On each of
          these projected versions of queries, keys, and values we then perform the attention function in parallel,
          yielding $d_v$-dimensional output values. These are concatenated and once again projected, resulting in
          the final values.
        </p>

        <div class="equation-block bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm my-8" id="eq-multi-head">
          <div class="px-6 pt-5 pb-3">
            <div class="flex items-center justify-between font-sans text-xs mb-3">
              <span class="bg-violet-50 text-violet-600 font-bold px-2 py-0.5 rounded">Subspace Projections</span>
              <span class="text-zinc-400 font-mono font-medium">Eq. (2)</span>
            </div>
            <div class="text-center text-xl py-3 overflow-x-auto space-y-2">
              $$\text{MultiHead}(Q,K,V) = \text{Concat}(\text{head}_1, \dots, \text{head}_h)\, W^O$$
              $$\text{where}\;\text{head}_i = \text{Attention}(Q W_i^Q,\; K W_i^K,\; V W_i^V)$$
            </div>
          </div>

          <div class="flex items-center justify-between px-6 py-3 bg-zinc-50 border-t border-zinc-200 font-sans text-sm font-semibold text-zinc-500 select-none">
            <div class="flex items-center gap-2">
              <svg class="drawer-chevron w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>Examine projection dimensions &amp; head concatenation</span>
            </div>
            <span class="text-xs text-violet-500 bg-violet-50 px-2 py-0.5 rounded-full font-semibold">Click to toggle</span>
          </div>

          <div class="stretch-drawer">
            <div class="p-6 border-t border-dashed border-zinc-200 bg-white font-sans">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div class="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                  <div class="flex items-center gap-2 text-sm font-bold text-zinc-800 mb-2">
                    <span class="bg-violet-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem]">1</span>
                    Projection Matrices
                  </div>
                  <p class="text-xs text-zinc-500 leading-relaxed">
                    $W_i^Q \in \mathbb{R}^{d_{\text{model}} \times d_k}$,
                    $W_i^K \in \mathbb{R}^{d_{\text{model}} \times d_k}$,
                    $W_i^V \in \mathbb{R}^{d_{\text{model}} \times d_v}$, and
                    $W^O \in \mathbb{R}^{h d_v \times d_{\text{model}}}$.
                  </p>
                </div>

                <div class="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                  <div class="flex items-center gap-2 text-sm font-bold text-zinc-800 mb-2">
                    <span class="bg-violet-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[0.65rem]">2</span>
                    Canonical Hyperparameters
                  </div>
                  <p class="text-xs text-zinc-500 leading-relaxed">
                    $h = 8$ parallel heads with $d_k = d_v = d_{\text{model}} / h = 512 / 8 = 64$.
                    Due to the reduced per-head dimension, total computation matches single-head attention at full width.
                  </p>
                </div>
              </div>

              <div class="flex gap-3 items-start bg-violet-50/60 border border-violet-100 rounded-lg p-4 text-sm text-zinc-700 leading-relaxed">
                <span class="text-lg">🧠</span>
                <div>
                  <strong class="text-zinc-800">Subspace diversity:</strong>
                  Different heads specialise — one may track subject-verb agreement, another resolves pronoun references,
                  and yet another attends to punctuation boundaries or semantic sentiment.
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="text-lg leading-[1.85] text-justify hyphens-auto">
          Multi-head attention allows the model to jointly attend to information from different representation
          subspaces at different positions. With a single attention head, averaging inhibits this.
        </p>
      </section>
    `,
  };

  const state = {
    openFiles: [],
    activeFileId: "",
    recentFiles: loadRecentFiles(),
  };

  const paperViewport = document.getElementById("paper-viewport");
  const tabsContainer = document.getElementById("tabs-container");
  const fileInput = document.getElementById("file-input");
  const openFileBtn = document.getElementById("open-file-btn");
  const toggleRecentsBtn = document.getElementById("toggle-recents-btn");
  const closeRecentsBtn = document.getElementById("close-recents-btn");
  const recentsDrawer = document.getElementById("recents-drawer");
  const drawerBackdrop = document.getElementById("drawer-backdrop");
  const recentsList = document.getElementById("recents-list");
  const dropOverlay = document.getElementById("drop-overlay");

  let currentSelection = "";
  let activeBtn = null;

  function uid() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `file-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function loadRecentFiles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  function persistRecentFiles() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.recentFiles.slice(0, 8)));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function extractTitle(rawText, fallbackName) {
    const h1Match = rawText.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match && h1Match[1] && h1Match[1].trim()) {
      return h1Match[1].trim();
    }

    const mdMatch = rawText.match(/^#\s+(.+)$/m);
    if (mdMatch && mdMatch[1] && mdMatch[1].trim()) {
      return mdMatch[1].trim();
    }

    return fallbackName || "Untitled Paper";
  }

  function markdownToHtml(markdownText) {
    const lines = markdownText.split(/\n/);
    let html = "";
    let paragraph = [];
    let listItems = [];

    const flushParagraph = () => {
      if (paragraph.length) {
        html += `<p class="text-lg leading-[1.7] text-zinc-700 mb-4">${escapeHtml(paragraph.join(" "))}</p>`;
        paragraph = [];
      }
    };

    const flushList = () => {
      if (listItems.length) {
        html += `<ul class="mb-4 list-disc pl-6 text-lg leading-[1.7] text-zinc-700">${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
        listItems = [];
      }
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        return;
      }

      if (/^#{1,3}\s+/.test(trimmed)) {
        flushParagraph();
        flushList();
        const content = trimmed.replace(/^#{1,3}\s+/, "");
        const headingLevel = trimmed.match(/^#+/)[0].length;
        const level = Math.min(headingLevel, 3);
        html += `<h${level} class="mt-6 mb-3 font-bold text-zinc-900">${escapeHtml(content)}</h${level}>`;
        return;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        flushParagraph();
        listItems.push(trimmed.replace(/^[-*]\s+/, ""));
        return;
      }

      paragraph.push(trimmed);
    });

    flushParagraph();
    flushList();
    return html || `<p class="text-lg text-zinc-700">${escapeHtml(markdownText)}</p>`;
  }

  function renderPaperContent(rawContent, fallbackName) {
    const trimmed = (rawContent || "").trim();
    if (!trimmed) {
      return `<h1 class="text-4xl font-bold mb-6">${escapeHtml(fallbackName || "Untitled Paper")}</h1><p class="text-lg text-zinc-700">This document is empty.</p>`;
    }

    if (/<\/?[a-z][\s\S]*>/i.test(trimmed) && /<(h1|h2|p|div|section|article|body|main|header|ul|ol|table)/i.test(trimmed)) {
      return trimmed;
    }

    const title = extractTitle(trimmed, fallbackName);
    if (/^#\s+/.test(trimmed) || /^(?:[-*]\s+|\d+\.\s+)/m.test(trimmed)) {
      return `<h1 class="text-4xl font-bold mb-6">${escapeHtml(title)}</h1>${markdownToHtml(trimmed)}`;
    }

    return `<h1 class="text-4xl font-bold mb-6">${escapeHtml(title)}</h1><p class="text-lg leading-[1.7] text-zinc-700">${escapeHtml(trimmed).replace(/\n/g, "<br>")}</p>`;
  }

  function recordRecentFile(file) {
    const record = {
      id: file.id,
      filename: file.filename,
      title: file.title,
      openedAt: Date.now(),
    };

    state.recentFiles = state.recentFiles.filter((item) => item.id !== file.id);
    state.recentFiles.unshift(record);
    state.recentFiles = state.recentFiles.slice(0, 8);
    persistRecentFiles();
    renderRecentList();
  }

  function renderRecentList() {
    if (!recentsList) return;

    if (!state.recentFiles.length) {
      recentsList.innerHTML = '<p class="px-2 py-4 text-sm text-zinc-500">No recent papers yet.</p>';
      return;
    }

    recentsList.innerHTML = state.recentFiles
      .map((item) => {
        const file = state.openFiles.find((entry) => entry.id === item.id);
        const isActive = file && state.activeFileId === file.id;

        return `
          <button type="button" class="recent-item flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${isActive ? "border-blue-200 bg-blue-50 text-blue-700" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}" data-recent-id="${item.id}">
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold">${escapeHtml(item.title)}</span>
              <span class="block truncate text-[11px] text-zinc-500">${escapeHtml(item.filename)}</span>
            </span>
            <span class="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">${new Date(item.openedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </button>
        `;
      })
      .join("");

    recentsList.querySelectorAll(".recent-item").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.recentId;
        const target = state.openFiles.find((file) => file.id === targetId);
        if (target) {
          state.activeFileId = target.id;
          renderTabs();
          renderActiveDocument();
          closeDrawer();
        }
      });
    });
  }

  function openFileRecord(file) {
    const existing = state.openFiles.find((entry) => entry.id === file.id);
    if (!existing) {
      state.openFiles.push(file);
    } else {
      Object.assign(existing, file);
    }

    state.activeFileId = file.id;
    renderTabs();
    renderActiveDocument();
    recordRecentFile(file);
  }

  function closeTab(fileId) {
    if (state.openFiles.length <= 1) {
      return;
    }

    const filtered = state.openFiles.filter((file) => file.id !== fileId);
    state.openFiles = filtered;

    if (state.activeFileId === fileId) {
      state.activeFileId = filtered[filtered.length - 1].id;
    }

    renderTabs();
    renderActiveDocument();
  }

  let draggedFileId = null;

  function renderTabs() {
    if (!tabsContainer) return;

    tabsContainer.innerHTML = state.openFiles.map((file) => {
      const isActive = file.id === state.activeFileId;
      return `
        <div id="tab-pill-${file.id}"
             draggable="true"
             class="tab-pill flex items-center rounded-full border cursor-grab active:cursor-grabbing transition-all ${isActive ? "border-blue-300 dark:border-emerald-500 bg-blue-50 dark:bg-emerald-950/40 text-blue-700 dark:text-emerald-300 shadow-sm" : "border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"}"
             data-file-id="${file.id}">
          <button type="button" class="tab-btn max-w-[180px] truncate px-3 py-1.5 text-xs sm:text-sm font-medium ${isActive ? "text-blue-700 dark:text-emerald-300" : "text-zinc-600 dark:text-zinc-300"}" data-tab-id="${file.id}">
            ${escapeHtml(file.title)}
          </button>
          <button type="button" class="tab-close ${state.openFiles.length === 1 ? "hidden" : ""} rounded-r-full pr-2.5 pl-1 py-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition" data-close-id="${file.id}" aria-label="Close tab">✕</button>
        </div>
      `;
    }).join("");

    tabsContainer.querySelectorAll(".tab-pill").forEach((pill) => {
      const fileId = pill.dataset.fileId;

      pill.addEventListener("dragstart", (e) => {
        draggedFileId = fileId;
        e.dataTransfer.setData("text/plain", fileId);
        e.dataTransfer.effectAllowed = "move";
        requestAnimationFrame(() => pill.classList.add("opacity-40", "scale-95"));
      });

      pill.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!draggedFileId || draggedFileId === fileId) return;

        const rect = pill.getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;
        pill.classList.toggle("border-l-2", isLeft);
        pill.classList.toggle("border-l-blue-500", isLeft);
        pill.classList.toggle("border-r-2", !isLeft);
        pill.classList.toggle("border-r-blue-500", !isLeft);
      });

      pill.addEventListener("dragleave", () => {
        pill.classList.remove("border-l-2", "border-l-blue-500", "border-r-2", "border-r-blue-500");
      });

      pill.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pill.classList.remove("border-l-2", "border-l-blue-500", "border-r-2", "border-r-blue-500");

        if (!draggedFileId || draggedFileId === fileId) {
          draggedFileId = null;
          return;
        }

        const rect = pill.getBoundingClientRect();
        const insertBefore = e.clientX < rect.left + rect.width / 2;

        const fromIndex = state.openFiles.findIndex((f) => f.id === draggedFileId);
        let toIndex = state.openFiles.findIndex((f) => f.id === fileId);

        if (fromIndex !== -1 && toIndex !== -1) {
          const [moved] = state.openFiles.splice(fromIndex, 1);
          let targetIndex = state.openFiles.findIndex((f) => f.id === fileId);
          if (!insertBefore) targetIndex += 1;
          const finalIndex = Math.max(0, Math.min(state.openFiles.length, targetIndex));
          state.openFiles.splice(finalIndex, 0, moved);
        }

        draggedFileId = null;
        renderTabs();
      });

      pill.addEventListener("dragend", () => {
        pill.classList.remove("opacity-40", "scale-95", "border-l-2", "border-l-blue-500", "border-r-2", "border-r-blue-500");
        draggedFileId = null;
      });
    });

    tabsContainer.querySelectorAll(".tab-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.tabId;
        if (!targetId) return;
        state.activeFileId = targetId;
        renderTabs();
        renderActiveDocument();
      });
    });

    tabsContainer.querySelectorAll(".tab-close").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(button.dataset.closeId);
      });
    });
  }

  function showDropOverlay() {
    if (!dropOverlay) return;
    dropOverlay.classList.remove("hidden");
    dropOverlay.classList.add("flex");
  }

  function hideDropOverlay() {
    if (!dropOverlay) return;
    dropOverlay.classList.add("hidden");
    dropOverlay.classList.remove("flex");
  }

  function openDrawer() {
    if (!recentsDrawer || !drawerBackdrop) return;
    recentsDrawer.classList.remove("-translate-x-full");
    recentsDrawer.classList.add("translate-x-0");
    drawerBackdrop.classList.remove("hidden");
  }

  function closeDrawer() {
    if (!recentsDrawer || !drawerBackdrop) return;
    recentsDrawer.classList.remove("translate-x-0");
    recentsDrawer.classList.add("-translate-x-full");
    drawerBackdrop.classList.add("hidden");
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Unable to read file."));
      reader.readAsText(file);
    });
  }

  async function loadFile(file) {
    if (!file) return;

    try {
      const rawText = await readFileAsText(file);
      const title = extractTitle(rawText, file.name.replace(/\.[^.]+$/, ""));
      const htmlContent = renderPaperContent(rawText, title);
      const entry = {
        id: uid(),
        filename: file.name,
        title,
        content: htmlContent,
      };

      openFileRecord(entry);
    } catch (error) {
      console.error(error);
    }
  }

  function bindEquationToggles() {
    const equationBlocks = paperViewport.querySelectorAll(".equation-block");
    equationBlocks.forEach((block) => {
      block.onclick = () => {
        const drawer = block.querySelector(".stretch-drawer");
        if (!drawer) return;

        const isExpanding = !drawer.classList.contains("expanded");
        block.classList.toggle("active", isExpanding);
        drawer.classList.toggle("expanded", isExpanding);

        if (isExpanding) {
          const inner = drawer.firstElementChild;
          if (inner) {
            drawer.style.maxHeight = `${inner.scrollHeight}px`;
          }
        } else {
          drawer.style.maxHeight = "0px";
        }
      };
    });
  }

  function renderActiveDocument() {
    const activeFile = state.openFiles.find((file) => file.id === state.activeFileId) || state.openFiles[0];
    if (!activeFile || !paperViewport) return;

    paperViewport.innerHTML = activeFile.content;
    bindEquationToggles();

    if (window.renderMathInElement) {
      renderMathInElement(paperViewport, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }

    renderRecentList();
  }

  function initDefaultState() {
    const base = {
      id: DEFAULT_PAPER.id,
      filename: DEFAULT_PAPER.filename,
      title: DEFAULT_PAPER.title,
      content: DEFAULT_PAPER.content,
    };

    state.openFiles = [base];
    state.activeFileId = base.id;

    const saved = state.recentFiles.filter((entry) => entry.id !== base.id);
    state.recentFiles = [{
      id: base.id,
      filename: base.filename,
      title: base.title,
      openedAt: Date.now(),
    }, ...saved].slice(0, 8);
    persistRecentFiles();
  }

  function positionPalette(rect) {
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hidePalette();
      return;
    }

    closeExplanation();
    palette.classList.add("visible");

    const paletteRect = palette.getBoundingClientRect();
    const pad = 10;

    let left = rect.left + rect.width / 2 - paletteRect.width / 2 + window.scrollX;
    left = Math.max(pad, Math.min(left, document.documentElement.clientWidth - paletteRect.width - pad + window.scrollX));

    let top = rect.top + window.scrollY - paletteRect.height - pad;
    let arrowFlip = false;

    if (top - window.scrollY < pad) {
      top = rect.bottom + window.scrollY + pad;
      arrowFlip = true;
    }

    palette.style.left = `${left}px`;
    palette.style.top = `${top}px`;
    paletteArrow.classList.toggle("arrow-flip", arrowFlip);
  }

  function hidePalette() {
    palette.classList.remove("visible");
    closeExplanation();
  }

  function closeExplanation() {
    explanationPane.classList.remove("open");
    explanationText.textContent = "";
  }

  function renderMarkdown(md) {
    let html = md
      .replace(/^---$/gm, "<hr class='my-3 border-zinc-700'>")
      .replace(/^### (.+)$/gm, "<h4 class='text-sm font-bold text-zinc-200 mt-3 mb-1'>$1</h4>")
      .replace(/^## (.+)$/gm, "<h3 class='text-base font-bold text-zinc-100 mt-3 mb-1.5'>$1</h3>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code class='bg-zinc-700/60 text-zinc-200 px-1 py-0.5 rounded text-xs font-mono'>$1</code>")
      .replace(/^[-*] (.+)$/gm, "<li class='ml-4 list-disc text-zinc-300 text-sm'>$1</li>");

    html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, "<ul class='my-2'>$1</ul>");

    html = html
      .split(/\n{2,}/)
      .map((block) => {
        block = block.trim();
        if (!block) return "";
        // Don't wrap elements that are already block-level
        if (/^<(h[1-6]|ul|ol|li|hr|blockquote|div|table)/i.test(block)) return block;
        return `<p class="text-sm text-zinc-300 leading-relaxed mb-2">${block.replace(/\n/g, " ")}</p>`;
      })
      .join("\n");

    return html;
  }

  function updateReadingProgress() {
    if (!progressBar) return;
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  }

  function bindSelectionPalette() {
    if (!paperViewport) return;

    paperViewport.addEventListener("mouseup", () => {
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          hidePalette();
          return;
        }

        const selectedText = selection.toString().trim();
        if (selectedText.length < 3) {
          hidePalette();
          return;
        }

        currentSelection = selectedText;
        const range = selection.getRangeAt(0);
        positionPalette(range.getBoundingClientRect());
      });
    });

    document.addEventListener("mousedown", (event) => {
      if (palette.contains(event.target)) return;
      if (paperViewport.contains(event.target)) return;
      hidePalette();
    });

    window.addEventListener("scroll", () => {
      updateReadingProgress();
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && palette.classList.contains("visible")) {
        positionPalette(selection.getRangeAt(0).getBoundingClientRect());
      }
    }, { passive: true });
  }

  function bindLensButtons() {
    const lensButtons = document.querySelectorAll(".lens-btn");
    lensButtons.forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();

        const lensType = button.dataset.lens;
        if (!currentSelection || !lensType) return;
        if (activeBtn) return;

        activeBtn = button;
        const originalHTML = button.innerHTML;
        button.innerHTML = '<span class="lens-spinner"></span>';
        button.disabled = true;

        try {
          const response = await fetch("/api/lens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: currentSelection,
              lens_type: lensType,
              context: null,
            }),
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          explanationText.innerHTML = renderMarkdown(data.explanation || "No explanation returned.");
          explanationPane.classList.add("open");

          if (window.renderMathInElement) {
            renderMathInElement(explanationPane, {
              delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
              ],
              throwOnError: false,
            });
          }
        } catch (error) {
          explanationText.innerHTML = `<p class="text-red-400 text-sm">Request failed: ${error.message}</p>`;
          explanationPane.classList.add("open");
        } finally {
          button.innerHTML = originalHTML;
          button.disabled = false;
          activeBtn = null;
        }
      });
    });
  }

  function bindFileControls() {
    if (openFileBtn) {
      openFileBtn.addEventListener("click", () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener("change", async (event) => {
        const file = event.target.files && event.target.files[0];
        if (file) {
          await loadFile(file);
        }
        fileInput.value = "";
      });
    }

    if (toggleRecentsBtn) {
      toggleRecentsBtn.addEventListener("click", () => {
        const isOpen = recentsDrawer && recentsDrawer.classList.contains("translate-x-0");
        if (isOpen) {
          closeDrawer();
        } else {
          openDrawer();
        }
      });
    }

    if (closeRecentsBtn) closeRecentsBtn.addEventListener("click", closeDrawer);
    if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeDrawer);

    window.addEventListener("dragover", (event) => {
      event.preventDefault();
      showDropOverlay();
    });

    window.addEventListener("dragenter", (event) => {
      event.preventDefault();
      showDropOverlay();
    });

    window.addEventListener("dragleave", (event) => {
      if (event.target === document || event.target === window) {
        hideDropOverlay();
      }
    });

    window.addEventListener("drop", async (event) => {
      event.preventDefault();
      hideDropOverlay();
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        await loadFile(file);
      }
    });
  }

  function initialize() {
    initDefaultState();
    renderTabs();
    renderActiveDocument();
    renderRecentList();
    bindSelectionPalette();
    bindLensButtons();
    bindFileControls();
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        if (!state.openFiles || state.openFiles.length <= 1) return;
        const currentIndex = state.openFiles.findIndex((f) => f.id === state.activeFileId);
        if (currentIndex === -1) return;
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + state.openFiles.length) % state.openFiles.length
          : (currentIndex + 1) % state.openFiles.length;
        state.activeFileId = state.openFiles[nextIndex].id;
        renderTabs();
        renderActiveDocument();
      }
    });

    initialize();
  })();
