/**
 * READit SaaS Landing Page Interactive Controller
 * Handles 3D Hero Document Card, Parallax Backlight, Academic PDF Showcase, and Multilingual Explorer.
 */

// =====================================================================
// THEME SWITCHER CONTROLLER (DEFAULT: DARK THEME)
// =====================================================================
function initTheme() {
    const savedTheme = localStorage.getItem('readit_theme');
    // Default is dark theme per specification
    if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
    } else {
        document.documentElement.classList.add('dark');
        if (!savedTheme) {
            localStorage.setItem('readit_theme', 'dark');
        }
    }
    updateThemeUI();
    renderPdfShowcaseState();
    updateSlidingGreenBlock();
}

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('readit_theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('readit_theme', 'dark');
    }
    updateThemeUI();
    updateHeroCardUI();
    renderPdfShowcaseState();
}

function updateThemeUI() {
    const isDark = document.documentElement.classList.contains('dark');
    const label = document.getElementById('theme-toggle-label');
    const mobileLabel = document.getElementById('mobile-theme-toggle-label');
    if (label) {
        label.textContent = isDark ? 'Dark' : 'Light';
    }
    if (mobileLabel) {
        mobileLabel.textContent = isDark ? 'Dark' : 'Light';
    }
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
        btn.setAttribute('aria-label', isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme');
        btn.setAttribute('title', isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme');
    }
}

// Sample academic presets for the Hero 3D Document Card
const presets = [
    {
        term: "lexical (adj.)",
        shortDef: "relating to words",
        simplifiedTerm: "word-based (adj.)",
        simplifiedDef: "plain everyday vocabulary",
        complexSentence: '"High <span class="text-amber-600 dark:text-amber-300 font-semibold underline">lexical</span> density impedes rapid reading comprehension."',
        simpleSentence: '"<span class="text-emerald-600 dark:text-emeraldGlow font-semibold">Plain word choices</span> make reading effortless and clear."',
        barWidths: ['54%', '38%', '78%']
    },
    {
        term: "epistemological (adj.)",
        shortDef: "relating to knowledge",
        simplifiedTerm: "knowledge-based",
        simplifiedDef: "how we validate truth",
        complexSentence: '"The <span class="text-amber-600 dark:text-amber-300 font-semibold underline">epistemological</span> framework remains hotly contested."',
        simpleSentence: '"How we <span class="text-emerald-600 dark:text-emeraldGlow font-semibold">prove what we know</span> is still debated."',
        barWidths: ['66%', '24%', '62%']
    },
    {
        term: "ontogenetic (adj.)",
        shortDef: "organism development",
        simplifiedTerm: "growth-related",
        simplifiedDef: "how a living thing grows",
        complexSentence: '"<span class="text-amber-600 dark:text-amber-300 font-semibold underline">Ontogenetic</span> shifts occur rapidly during maturation."',
        simpleSentence: '"<span class="text-emerald-600 dark:text-emeraldGlow font-semibold">Growth changes</span> happen fast as organisms mature."',
        barWidths: ['42%', '48%', '84%']
    }
];

let currentPresetIndex = 0;
let isSimplified = false;
let showReadableText = false;

function selectPreset(index) {
    currentPresetIndex = index;
    isSimplified = false;
    updateHeroCardUI();

    for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`preset-btn-${i}`);
        if (btn) {
            if (i === index) {
                btn.className = "px-2.5 py-1 rounded-md bg-neutral-900 text-white dark:bg-white/10 dark:text-neutral-200 hover:opacity-90 transition font-medium text-xs shadow-sm";
            } else {
                btn.className = "px-2.5 py-1 rounded-md bg-black/[0.04] text-neutral-600 dark:bg-white/[0.03] dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition text-xs";
            }
        }
    }
}

function cycleNextPreset() {
    const next = (currentPresetIndex + 1) % presets.length;
    selectPreset(next);
}

function toggleRealTextMode() {
    showReadableText = !showReadableText;
    updateHeroCardUI();
}

function triggerSimplifyAnimation() {
    isSimplified = !isSimplified;
    updateHeroCardUI();
}

function updateHeroCardUI() {
    const item = presets[currentPresetIndex];
    const highlightBox = document.getElementById('highlight-box');
    const skeletonContainer = document.getElementById('highlight-skeleton');
    const textContainer = document.getElementById('highlight-text-content');
    const liveSentence = document.getElementById('live-sentence-text');

    const bar1 = document.getElementById('bar-1');
    const bar2 = document.getElementById('bar-2');
    const bar3 = document.getElementById('bar-3');

    const popoverBadge = document.getElementById('popover-badge');
    const popoverTerm = document.getElementById('popover-term');
    const popoverDef = document.getElementById('popover-def');
    const simplifyBtnText = document.getElementById('simplify-btn-text');

    if (bar1 && bar2 && bar3) {
        bar1.style.width = isSimplified ? '38%' : item.barWidths[0];
        bar2.style.width = isSimplified ? '32%' : item.barWidths[1];
        bar3.style.width = isSimplified ? '50%' : item.barWidths[2];
    }

    if (isSimplified) {
        if (highlightBox) highlightBox.className = "emerald-simplified-box rounded-xl p-4 my-1 cursor-pointer group relative";
        if (bar1) bar1.className = "h-2.5 rounded-full bg-emeraldGlow transition-all duration-500";
        if (bar2) bar2.className = "h-2.5 rounded-full bg-emeraldGlow transition-all duration-500";
        if (bar3) bar3.className = "h-2 rounded-full bg-emeraldGlow/50 transition-all duration-500";

        if (popoverBadge) {
            popoverBadge.textContent = "simplified ✓";
            popoverBadge.className = "text-xs font-medium text-emeraldGlow tracking-wide";
        }
        if (popoverTerm) popoverTerm.textContent = item.simplifiedTerm;
        if (popoverDef) popoverDef.textContent = item.simplifiedDef;
        if (simplifyBtnText) simplifyBtnText.textContent = "Restore Original";
        if (liveSentence) liveSentence.innerHTML = item.simpleSentence;
    } else {
        if (highlightBox) highlightBox.className = "amber-highlight-box rounded-xl p-4 my-1 cursor-pointer group relative";
        if (bar1) bar1.className = "h-2.5 rounded-full bg-[#E5B842] transition-all duration-500";
        if (bar2) bar2.className = "h-2.5 rounded-full bg-[#E5B842] transition-all duration-500";
        if (bar3) bar3.className = "h-2 rounded-full bg-[#E5B842]/50 transition-all duration-500";

        if (popoverBadge) {
            popoverBadge.textContent = "translation";
            popoverBadge.className = "text-xs font-normal text-neutral-300 tracking-wide";
        }
        if (popoverTerm) popoverTerm.textContent = item.term;
        if (popoverDef) popoverDef.textContent = item.shortDef;
        if (simplifyBtnText) simplifyBtnText.textContent = "Simplify";
        if (liveSentence) liveSentence.innerHTML = item.complexSentence;
    }

    if (showReadableText) {
        if (skeletonContainer) skeletonContainer.classList.add('hidden');
        if (textContainer) textContainer.classList.remove('hidden');
    } else {
        if (skeletonContainer) skeletonContainer.classList.remove('hidden');
        if (textContainer) textContainer.classList.add('hidden');
    }
}

function triggerChromeInstall() {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3200);
}

// =====================================================================
// SCROLL PARALLAX BACKLIGHT CONTROLLER
// =====================================================================
window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    const glow1 = document.getElementById('parallax-glow-1');
    const glow2 = document.getElementById('parallax-glow-2');
    const glow3 = document.getElementById('parallax-glow-3');
    const glow4 = document.getElementById('parallax-glow-4');

    if (glow1) glow1.style.transform = `translate3d(0, ${scrollY * 0.22}px, 0)`;
    if (glow2) glow2.style.transform = `translate3d(0, ${scrollY * 0.15}px, 0)`;
    if (glow3) glow3.style.transform = `translate3d(0, ${scrollY * 0.28}px, 0)`;
    if (glow4) glow4.style.transform = `translate3d(0, ${scrollY * 0.18}px, 0)`;
});

// =====================================================================
// INTERACTIVE ACADEMIC PDF FEATURE SHOWCASE LOGIC
// =====================================================================
let activeFeatureIndex = 0;
let currentPaperMode = 'after';
let currentPdfLang = 'en';
let isAccordionOpen = true;

const pdfFeatureCopy = {
    en: {
        feat0Label: "After (Plain-Language Breakdown)",
        feat0Text: '"As electricity use grows and power grids expand alongside it, dangerous electrical sparks (arc faults) and fires are much more likely to happen."',
        feat1Label: "Active Subject & Antecedent Link",
        feat1Text: '<strong>Who identified them?</strong> → The authors (<span class="underline decoration-indigo-400">Tian et al., 2023</span>) across the <span class="underline decoration-indigo-400">63 analyzed articles</span>.<br/><strong>Active Rewrite:</strong> "By analyzing those 63 papers, the authors identified three major AI challenges: missed/false alarms, limited neural network flexibility, and a <strong>shortage (paucity)</strong> of training data."',
        feat2Text: '<strong class="text-blue-300">Why it\'s cited here:</strong> Confirms that aging solar (photovoltaic) inverters and degraded cable insulation are the primary triggers for DC series arc faults in modern grids.'
    },
    id: {
        feat0Label: "Sesudah (Penjelasan Bahasa Indonesia Sederhana)",
        feat0Text: '"Seiring meningkatnya kebutuhan listrik dan meluasnya jaringan energi secara bersamaan (concomitant), risiko percikan api listrik (arc fault) serta kebakaran menjadi jauh lebih tinggi."',
        feat1Label: "Subjek Aktif & Rujukan Kalimat Pasif",
        feat1Text: '<strong>Siapa yang mengidentifikasi?</strong> → Para penulis (<span class="underline decoration-indigo-400">Tian dkk., 2023</span>) melalui analisis terhadap <span class="underline decoration-indigo-400">63 artikel jurnal</span>.<br/><strong>Kalimat Aktif:</strong> "Melalui 63 artikel tersebut, penulis menemukan 3 tantangan utama AI: deteksi yang terlewat/palsu, keterbatasan jaringan saraf, dan <strong>minimnya (paucity)</strong> data yang relevan."',
        feat2Text: '<strong class="text-blue-300">Konteks Sitasi [1]:</strong> Membuktikan bahwa sistem panel surya (fotovoltaik) yang menua merupakan penyebab utama munculnya gangguan busur api (arc faults) pada jaringan listrik modern.'
    }
};

function updateSlidingGreenBlock() {
    const container = document.getElementById('feature-cards-container');
    const activeCard = document.getElementById(`feature-card-${activeFeatureIndex}`);
    const slider = document.getElementById('sliding-green-block');
    if (!container || !activeCard || !slider) return;

    const isHorizontal = window.innerWidth < 1024;
    let offsetLeft = 0;
    let offsetTop = 0;
    let width = 0;
    let height = 0;

    if (isHorizontal) {
        offsetLeft = activeCard.offsetLeft;
        offsetTop = activeCard.offsetTop;
        width = activeCard.offsetWidth;
        height = activeCard.offsetHeight;

        // Fallback to getBoundingClientRect if offsetLeft is 0 when active index > 0
        if (offsetLeft === 0 && activeFeatureIndex > 0) {
            const cRect = container.getBoundingClientRect();
            const aRect = activeCard.getBoundingClientRect();
            offsetLeft = aRect.left - cRect.left;
            offsetTop = aRect.top - cRect.top;
            width = aRect.width;
            height = aRect.height;
        }

        if (width > 0 && height > 0) {
            slider.style.transform = `translate3d(${offsetLeft}px, ${offsetTop}px, 0)`;
            slider.style.width = `${width}px`;
            slider.style.height = `${height}px`;
            slider.style.opacity = '1';
        }
    } else {
        offsetTop = activeCard.offsetTop;
        height = activeCard.offsetHeight;
        if (height > 0) {
            slider.style.transform = `translate3d(0, ${offsetTop}px, 0)`;
            slider.style.width = '100%';
            slider.style.height = `${height}px`;
            slider.style.opacity = '1';
        }
    }
}

window.addEventListener('resize', updateSlidingGreenBlock);
window.addEventListener('orientationchange', () => {
    setTimeout(updateSlidingGreenBlock, 80);
});
window.addEventListener('load', () => {
    updateSlidingGreenBlock();
    setTimeout(updateSlidingGreenBlock, 50);
    setTimeout(updateSlidingGreenBlock, 250);
});
if (document.fonts) {
    document.fonts.ready.then(updateSlidingGreenBlock);
}

function selectFeature(index) {
    activeFeatureIndex = index;
    currentPaperMode = 'after';
    isAccordionOpen = true;

    updateSlidingGreenBlock();
    renderPdfShowcaseState();
    requestAnimationFrame(updateSlidingGreenBlock);
    setTimeout(updateSlidingGreenBlock, 40);

    setTimeout(() => {
        const scrollContainer = document.getElementById('pdf-scroll-container');
        const targetEl = document.getElementById(`target-feature-${index}`);
        if (scrollContainer && targetEl) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const offset = (targetRect.top - containerRect.top) + scrollContainer.scrollTop - 75;
            scrollContainer.scrollTo({
                top: Math.max(0, offset),
                behavior: 'smooth'
            });
        }
    }, 90);
}

function handlePaperSpanClick(index) {
    if (activeFeatureIndex === index) {
        toggleCurrentAccordion();
    } else {
        selectFeature(index);
    }
}

function toggleCurrentAccordion() {
    isAccordionOpen = !isAccordionOpen;
    currentPaperMode = isAccordionOpen ? 'after' : 'before';
    renderPdfShowcaseState();
}

function setPaperMode(mode) {
    currentPaperMode = mode;
    isAccordionOpen = (mode === 'after');
    renderPdfShowcaseState();
}

function setPdfLanguage(lang) {
    currentPdfLang = lang;
    const btnEn = document.getElementById('lang-btn-en');
    const btnId = document.getElementById('lang-btn-id');

    if (btnEn && btnId) {
        if (lang === 'en') {
            btnEn.className = "px-3 py-1 rounded-full bg-emeraldGlow text-obsidian font-semibold transition";
            btnId.className = "px-3 py-1 rounded-full text-neutral-400 hover:text-white transition";
        } else {
            btnId.className = "px-3 py-1 rounded-full bg-emeraldGlow text-obsidian font-semibold transition";
            btnEn.className = "px-3 py-1 rounded-full text-neutral-400 hover:text-white transition";
        }
    }

    const copy = pdfFeatureCopy[lang];
    if (copy) {
        const acc0Label = document.getElementById('acc-0-after-label');
        const acc0Text = document.getElementById('acc-0-after-text');
        const acc1Label = document.getElementById('acc-1-after-label');
        const acc1Text = document.getElementById('acc-1-after-text');
        const acc2Text = document.getElementById('acc-2-after-text');

        if (acc0Label) acc0Label.textContent = copy.feat0Label;
        if (acc0Text) acc0Text.innerHTML = copy.feat0Text;
        if (acc1Label) acc1Label.textContent = copy.feat1Label;
        if (acc1Text) acc1Text.innerHTML = copy.feat1Text;
        if (acc2Text) acc2Text.innerHTML = copy.feat2Text;
    }
}

function renderPdfShowcaseState() {
    for (let i = 0; i < 3; i++) {
        const card = document.getElementById(`feature-card-${i}`);
        const badge = document.getElementById(`badge-feat-${i}`);
        const desc = document.getElementById(`desc-feat-${i}`);
        const title = document.getElementById(`title-feat-${i}`);

        if (badge) badge.style.display = 'none';

        if (card) {
            if (i === activeFeatureIndex) {
                card.className = "relative z-10 w-full flex flex-col items-center justify-center lg:items-start lg:justify-start py-2.5 px-1.5 sm:py-3 sm:px-3 lg:p-7 rounded-xl sm:rounded-2xl lg:rounded-[24px] transition-all duration-300 focus:outline-none group border border-transparent min-h-[52px] lg:min-h-0";
                if (title) {
                    title.className = "w-full font-monoFeature font-bold text-[10px] min-[370px]:text-[11px] sm:text-xs lg:text-xl tracking-tight sm:tracking-normal lg:tracking-[0.06em] uppercase text-center lg:text-left text-white transition-colors leading-[1.25] break-words";
                }
                if (desc) {
                    desc.className = "hidden lg:block font-sans text-sm sm:text-[15px] leading-relaxed text-white/90 mt-2";
                }
            } else {
                card.className = "relative z-10 w-full flex flex-col items-center justify-center lg:items-start lg:justify-start py-2.5 px-1.5 sm:py-3 sm:px-3 lg:p-7 rounded-xl sm:rounded-2xl lg:rounded-[24px] transition-all duration-300 focus:outline-none group border border-neutral-200 dark:border-white/[0.08] hover:border-neutral-300 dark:hover:border-white/20 bg-white dark:bg-white/[0.015] shadow-sm dark:shadow-none min-h-[52px] lg:min-h-0";
                if (title) {
                    title.className = "w-full font-monoFeature font-bold text-[10px] min-[370px]:text-[11px] sm:text-xs lg:text-xl tracking-tight sm:tracking-normal lg:tracking-[0.06em] uppercase text-center lg:text-left text-neutral-800 dark:text-neutral-300 group-hover:text-black dark:group-hover:text-white transition-colors leading-[1.25] break-words";
                }
                if (desc) {
                    desc.className = "hidden lg:block font-sans text-sm sm:text-[15px] leading-relaxed text-neutral-700 dark:text-[#8A9994] group-hover:text-neutral-950 dark:group-hover:text-neutral-200 transition-colors mt-2";
                }
            }
        }
    }

    const stepEl = document.getElementById('active-feature-step');
    if (stepEl) stepEl.textContent = `0${activeFeatureIndex + 1} / 03`;

    const btnBefore = document.getElementById('mode-btn-before');
    const btnAfter = document.getElementById('mode-btn-after');

    if (btnBefore && btnAfter) {
        if (currentPaperMode === 'before') {
            btnBefore.className = "px-3 sm:px-3.5 py-1 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-obsidian font-semibold shadow-sm transition text-[11px] sm:text-xs";
            btnAfter.className = "px-3.5 sm:px-4 py-1 rounded-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition font-medium text-[11px] sm:text-xs";
        } else {
            btnAfter.className = "px-3.5 sm:px-4 py-1 rounded-full bg-emeraldGlow text-obsidian font-semibold shadow-sm transition text-[11px] sm:text-xs";
            btnBefore.className = "px-3 sm:px-3.5 py-1 rounded-full text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition font-medium text-[11px] sm:text-xs";
        }
    }

    const target0 = document.getElementById('target-feature-0');
    const target1 = document.getElementById('target-feature-1');
    const target2 = document.getElementById('target-feature-2');
    const ant1 = document.getElementById('abstract-antecedent-1');
    const ant2 = document.getElementById('abstract-antecedent-2');

    if (target0) target0.className = "pdf-highlight-span cursor-pointer hover:bg-neutral-200/70";
    if (target1) target1.className = "pdf-highlight-span cursor-pointer hover:bg-neutral-200/70";
    if (target2) target2.className = "pdf-highlight-span cursor-pointer hover:bg-neutral-200/70";
    if (ant1) ant1.className = "pdf-highlight-span";
    if (ant2) ant2.className = "pdf-highlight-span";

    for (let i = 0; i < 3; i++) {
        const acc = document.getElementById(`accordion-feature-${i}`);
        if (acc) acc.classList.remove('open');
    }

    const statusLabel = document.getElementById('pdf-active-status-label');
    const featureNames = ["TRANSLATING IDEA", "QUICK REFERENCE", "EASY CITATION"];

    if (currentPaperMode === 'after') {
        if (activeFeatureIndex === 0 && target0) {
            target0.className = "pdf-highlight-span pdf-highlight-active-translate";
        } else if (activeFeatureIndex === 1 && target1) {
            target1.className = "pdf-highlight-span pdf-highlight-active-reference";
            if (ant1) ant1.className = "pdf-highlight-span pdf-highlight-antecedent";
            if (ant2) ant2.className = "pdf-highlight-span pdf-highlight-antecedent";
        } else if (activeFeatureIndex === 2 && target2) {
            target2.className = "pdf-highlight-span pdf-highlight-active-citation";
        }

        if (isAccordionOpen) {
            const currentAcc = document.getElementById(`accordion-feature-${activeFeatureIndex}`);
            if (currentAcc) currentAcc.classList.add('open');
        }
        if (statusLabel) statusLabel.textContent = `${featureNames[activeFeatureIndex]} • ACTIVE`;
    } else {
        if (statusLabel) statusLabel.textContent = `ORIGINAL PAPER • BEFORE READIT`;
    }

    setTimeout(updateSlidingGreenBlock, 20);
}

// =====================================================================
// MULTILINGUAL DATASET EXPLORER LOGIC
// =====================================================================
const datasetWords = [
    {
        word: "concomitant",
        cefr: "C2 • Academic Tier 1",
        pos: "Adjective • Formal",
        simpleEn: '"happening at the same time; accompanying"',
        note: "Used when two trends expand together (e.g., electricity demand + grid size).",
        id: "yang menyertai / terjadi bersamaan",
        es: "simultáneo / que acompaña",
        zh: "伴随的 / 同时发生的",
        ja: "付随する / 同時に起こる"
    },
    {
        word: "paucity",
        cefr: "C2 • Research Core",
        pos: "Noun • Quantitative",
        simpleEn: '"a severe shortage or scarcity of something"',
        note: "Common in literature reviews describing a lack of training data or prior studies.",
        id: "kelangkaan / minimnya jumlah",
        es: "escasez / falta de datos",
        zh: "缺乏 / 稀少",
        ja: "不足 / 欠乏"
    },
    {
        word: "proliferation",
        cefr: "C1 • General Academic",
        pos: "Noun • Process",
        simpleEn: '"rapid growth or sudden increase in numbers"',
        note: "Describes fast-spreading phenomena like urbanization or AI adoption.",
        id: "perkembangan pesat / lonjakan",
        es: "proliferación / rápido aumento",
        zh: "激增 / 迅速扩增",
        ja: "急増 / 急速な普及"
    }
];

function selectDatasetWord(idx) {
    const item = datasetWords[idx];
    if (!item) return;

    const cefrEl = document.getElementById('ds-cefr');
    const posEl = document.getElementById('ds-pos');
    const simpleEnEl = document.getElementById('ds-simple-en');
    const noteEl = document.getElementById('ds-context-note');
    const idEl = document.getElementById('ds-lang-id');
    const esEl = document.getElementById('ds-lang-es');
    const zhEl = document.getElementById('ds-lang-zh');
    const jaEl = document.getElementById('ds-lang-ja');

    if (cefrEl) cefrEl.textContent = item.cefr;
    if (posEl) posEl.textContent = item.pos;
    if (simpleEnEl) simpleEnEl.textContent = item.simpleEn;
    if (noteEl) noteEl.textContent = item.note;
    if (idEl) idEl.textContent = item.id;
    if (esEl) esEl.textContent = item.es;
    if (zhEl) zhEl.textContent = item.zh;
    if (jaEl) jaEl.textContent = item.ja;

    for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`ds-word-${i}`);
        if (btn) {
            if (i === idx) {
                btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-monoFeature bg-emeraldGlow text-obsidian font-semibold transition shadow-sm";
            } else {
                btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-monoFeature bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white border border-neutral-200 dark:border-white/10 transition";
            }
        }
    }
}

// =====================================================================
// MOBILE MENU CONTROLLER
// =====================================================================
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('burger-icon-open');
    const iconClose = document.getElementById('burger-icon-close');
    const btn = document.getElementById('mobile-menu-btn');
    if (!menu) return;

    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
        menu.classList.remove('hidden');
        if (iconOpen) iconOpen.classList.add('hidden');
        if (iconClose) iconClose.classList.remove('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'true');
    } else {
        closeMobileMenu();
    }
}

function closeMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('burger-icon-open');
    const iconClose = document.getElementById('burger-icon-close');
    const btn = document.getElementById('mobile-menu-btn');
    if (!menu) return;

    menu.classList.add('hidden');
    if (iconOpen) iconOpen.classList.remove('hidden');
    if (iconClose) iconClose.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
        closeMobileMenu();
    }
});

// =====================================================================
// SMART SCROLL HEADER CONTROLLER (HIDE ON DOWN, REVEAL ON UP)
// =====================================================================
let lastHeaderScrollY = window.scrollY;
const siteHeader = document.getElementById('site-header');

window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const mobileMenu = document.getElementById('mobile-menu');
    const isMenuOpen = mobileMenu && !mobileMenu.classList.contains('hidden');

    if (siteHeader) {
        if (isMenuOpen) {
            // Keep header in view if user is navigating the mobile drawer
            siteHeader.classList.remove('header-hidden');
        } else if (currentScrollY <= 24) {
            // Always show at top of page
            siteHeader.classList.remove('header-hidden');
        } else if (currentScrollY > lastHeaderScrollY && currentScrollY > 70) {
            // Scrolling down -> hide header
            siteHeader.classList.add('header-hidden');
        } else if (currentScrollY < lastHeaderScrollY) {
            // Scrolling up -> reveal header
            siteHeader.classList.remove('header-hidden');
        }
    }

    lastHeaderScrollY = currentScrollY;
}, { passive: true });

// Initialize theme on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
} else {
    initTheme();
}

// =====================================================================
// FOOTER INFORMATION & LEGAL MODALS CONTROLLER
// =====================================================================
const modalData = {
    privacy: {
        badge: "Legal",
        title: "Privacy Policy",
        actionText: "Launch Hub →",
        actionHref: "/hub",
        html: `
            <div class="space-y-4">
                <p class="text-xs text-neutral-500 font-monoFeature">Last updated: October 2025</p>
                <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs">
                    <strong>Zero Data Retention Guarantee:</strong> Your academic documents are processed in-memory and client-side. We never store, sell, or train foundational models on your uploaded manuscripts.
                </div>
                <h4 class="font-semibold text-neutral-900 dark:text-white text-sm">1. Document Processing</h4>
                <p>When you drag & drop or upload academic PDFs to READit, document parsing and text vectorization occur locally within your browser session or temporarily in active runtime memory. Files are immediately released upon closing the tab.</p>
                <h4 class="font-semibold text-neutral-900 dark:text-white text-sm">2. AI Integration & API Keys</h4>
                <p>READit allows users to connect custom LLM keys (such as Google Gemini, OpenAI, or local Ollama). Your API keys are saved exclusively in your browser's private <code class="font-mono text-xs px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">localStorage</code> and are never transmitted to any third-party telemetry servers.</p>
                <h4 class="font-semibold text-neutral-900 dark:text-white text-sm">3. Analytics & Telemetry</h4>
                <p>We do not run tracking pixels, intrusive ad network tags, or third-party behavioral trackers. Only anonymous performance metrics (such as page rendering latency) are recorded to ensure app reliability.</p>
            </div>
        `
    },
    terms: {
        badge: "Legal",
        title: "Terms of Service",
        actionText: "Acknowledge & Launch →",
        actionHref: "/hub",
        html: `
            <div class="space-y-4">
                <p class="text-xs text-neutral-500 font-monoFeature">Effective Date: October 2025</p>
                <h4 class="font-semibold text-neutral-900 dark:text-white text-sm">1. Scholarly Fair Use</h4>
                <p>READit is intended for educational, academic research, literature synthesis, and reading enhancement. Users retain complete intellectual property ownership over any uploaded manuscripts, dissertations, and research papers.</p>
                <h4 class="font-semibold text-neutral-900 dark:text-white text-sm">2. AI-Generated Synthesis & Accuracy</h4>
                <p>READit provides automated lexical simplification, contextual definitions, and multilingual translations. While our algorithms strive for the highest academic rigor, researchers are advised to verify critical formulas, statistical findings, and citations prior to publishing.</p>
                <h4 class="font-semibold text-neutral-900 dark:text-white text-sm">3. Acceptable Use</h4>
                <p>You agree not to use the service for unauthorized automated scraping, distributing malware, or breaching copyright protections on proprietary academic databases.</p>
            </div>
        `
    },
    changelog: {
        badge: "Changelog",
        title: "Platform Release Notes",
        actionText: "Try Latest Version →",
        actionHref: "/hub",
        html: `
            <div class="space-y-6">
                <div class="border-l-2 border-emerald-500 pl-4 space-y-1.5">
                    <div class="flex items-center gap-2">
                        <span class="font-semibold text-neutral-900 dark:text-white text-sm">v1.0.4 — Multi-Tab & Drag Reordering</span>
                        <span class="text-[10px] font-monoFeature px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emeraldGlow">Current</span>
                    </div>
                    <p class="text-xs text-neutral-500">Released October 2025</p>
                    <ul class="list-disc list-inside text-xs space-y-1 pt-1 text-neutral-600 dark:text-neutral-400">
                        <li>Multi-tab PDF reader with native HTML5 drag-and-drop tab sequence reordering.</li>
                        <li>Mobile-optimized Document Hub with 2-column grid and collapsible reader controls.</li>
                        <li>Collapsible sidebar with icon preservation and floating bilingual toggle (EN / ID).</li>
                        <li>Smooth login/signup transition cards and secure custom API key management.</li>
                    </ul>
                </div>
                <div class="border-l-2 border-neutral-300 dark:border-white/20 pl-4 space-y-1.5 opacity-80">
                    <div class="flex items-center gap-2">
                        <span class="font-semibold text-neutral-900 dark:text-white text-sm">v1.0.0 — Public Beta Launch</span>
                    </div>
                    <p class="text-xs text-neutral-500">Released September 2025</p>
                    <ul class="list-disc list-inside text-xs space-y-1 pt-1 text-neutral-600 dark:text-neutral-400">
                        <li>Core lexical simplification engine with academic paper split-screen reader.</li>
                        <li>Bilingual contextual dictionary supporting English and Indonesian scholarly lexicons.</li>
                    </ul>
                </div>
            </div>
        `
    },
    download: {
        badge: "App",
        title: "Install & Launch READit",
        actionText: "Open Document Hub →",
        actionHref: "javascript:void(0)",
        html: `
            <div class="space-y-4">
                <p>READit is engineered as a modern, zero-install Web Application and Progressive Web App (PWA). You don't need heavy installers or desktop background services to read and synthesize dense PDFs.</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div class="p-3.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02]">
                        <div class="font-semibold text-neutral-900 dark:text-white text-xs mb-1">Web Platform</div>
                        <p class="text-xs text-neutral-500">Works instantly in Chrome, Safari, Edge, Firefox, and Brave without installation.</p>
                    </div>
                    <div class="p-3.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02]">
                        <div class="font-semibold text-neutral-900 dark:text-white text-xs mb-1">Install as App (PWA)</div>
                        <p class="text-xs text-neutral-500">Click the install icon in your browser address bar to add READit to your desktop dock or home screen.</p>
                    </div>
                </div>
            </div>
        `
    },
    pricing: {
        badge: "Pricing",
        title: "Academic Beta Pricing",
        actionText: "Get Started Free →",
        actionHref: "javascript:void(0)",
        html: `
            <div class="space-y-4">
                <div class="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20">
                    <div class="flex items-center justify-between">
                        <div>
                            <h4 class="font-bold text-neutral-900 dark:text-white text-base">Community Academic Plan</h4>
                            <p class="text-xs text-neutral-500">Free for all students, postgraduates, and researchers</p>
                        </div>
                        <div class="text-right">
                            <span class="text-2xl font-bold text-emerald-600 dark:text-emeraldGlow">$0</span>
                            <span class="text-xs text-neutral-500 block">Forever Free</span>
                        </div>
                    </div>
                </div>
                <ul class="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                    <li class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                        <span>Multi-tab PDF Reader with unlimited local document uploads (up to 20MB per file)</span>
                    </li>
                    <li class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                        <span>Instant lexical simplifier and interactive academic dictionary</span>
                    </li>
                    <li class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                        <span>Bring your own LLM API Key (Gemini, OpenAI) for zero data sharing</span>
                    </li>
                    <li class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                        <span>English & Indonesian bilingual translation support</span>
                    </li>
                </ul>
            </div>
        `
    }
};

function openLandingModal(key, event) {
    if (event) {
        event.preventDefault();
    }
    const data = modalData[key];
    if (!data) return;

    const modal = document.getElementById('landing-info-modal');
    const badge = document.getElementById('modal-badge');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const actionBtn = document.getElementById('modal-action-btn');

    if (!modal || !title || !content) return;

    if (badge) badge.textContent = data.badge;
    title.textContent = data.title;
    content.innerHTML = data.html;

    if (actionBtn) {
        actionBtn.textContent = data.actionText;
        actionBtn.setAttribute('href', data.actionHref);
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
}

function closeLandingModal() {
    const modal = document.getElementById('landing-info-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
}

function openLegalModal(type, event) {
    openLandingModal(type === 'privacy' ? 'privacy' : 'terms', event);
}

function openChangelogModal(event) {
    openLandingModal('changelog', event);
}

function openDownloadModal(event) {
    openLandingModal('download', event);
}

function openPricingModal(event) {
    openLandingModal('pricing', event);
}

// Global modal dismiss listeners
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLandingModal();
    }
});

document.addEventListener('click', (e) => {
    const modal = document.getElementById('landing-info-modal');
    if (modal && e.target === modal) {
        closeLandingModal();
    }
});

// Expose functions globally for inline HTML onclick handlers
window.selectPreset = selectPreset;
window.cycleNextPreset = cycleNextPreset;
window.toggleRealTextMode = toggleRealTextMode;
window.triggerSimplifyAnimation = triggerSimplifyAnimation;
window.triggerChromeInstall = triggerChromeInstall;
window.selectFeature = selectFeature;
window.handlePaperSpanClick = handlePaperSpanClick;
window.toggleCurrentAccordion = toggleCurrentAccordion;
window.setPaperMode = setPaperMode;
window.setPdfLanguage = setPdfLanguage;
window.selectDatasetWord = selectDatasetWord;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
window.toggleTheme = toggleTheme;
window.openLandingModal = openLandingModal;
window.closeLandingModal = closeLandingModal;
window.openLegalModal = openLegalModal;
window.openChangelogModal = openChangelogModal;
window.openDownloadModal = openDownloadModal;
window.openPricingModal = openPricingModal;



