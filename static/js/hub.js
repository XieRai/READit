/**
 * READit Document Hub Controller (hub.js)
 * Extracted from standalone document hub implementation.
 * Manages sidebar navigation, account drawer, document cards, video modals, drag-and-drop upload,
 * and the interactive smart sentence reader workspace.
 */

// =====================================================================
// DOCUMENT HUB STATE & RENDERING
// =====================================================================
let hubDocuments = [
    {
        id: 'demo-arc-fault',
        title: 'Demo File',
        fullTitle: 'Arc fault detection using artificial intelligence: Challenges and benefits',
        isDemo: true
    }
];

let isAccountDrawerOpen = false;
let isRecentGridExpanded = true;
let currentReaderLang = 'en';
let activeReaderSentenceIdx = 1;

function renderHubDocuments() {
    const listContainer = document.getElementById('hub-dynamic-docs-list');
    if (!listContainer) return;

    listContainer.innerHTML = hubDocuments.map((doc) => `
        <div class="flex flex-col items-center group cursor-pointer" onclick="openSmartReader('${doc.title.replace(/'/g, "\\'")}')">
            <!-- Miniature Paper Thumbnail (w-[175px] h-[225px] matching wireframe) -->
            <div class="w-[175px] h-[225px] rounded-[14px] bg-white p-3.5 text-[#111827] shadow-md border border-transparent group-hover:ring-2 group-hover:ring-readitGreen transition overflow-hidden flex flex-col justify-between select-none">
                <div>
                    <!-- Miniature Journal Header -->
                    <div class="flex items-start justify-between border-b border-neutral-800 pb-1.5 mb-1.5">
                        <div class="flex items-center gap-1">
                            <div class="w-3.5 h-3.5 rounded-full border border-[#0284C7] flex items-center justify-center text-[3.8px] font-bold text-[#0284C7]">AIMS</div>
                            <div class="text-[4.3px] italic text-[#0284C7] leading-tight font-serifPaper">
                                <div>Mathematical Biosciences</div>
                                <div>and Engineering</div>
                            </div>
                        </div>
                        <div class="text-[3.6px] text-neutral-700 leading-tight text-right font-serifPaper">
                            <div>MBE, 20(7): 12404</div>
                            <div>DOI: 10.3934/mbe</div>
                            <div>May 2023</div>
                        </div>
                    </div>

                    <!-- Miniature Paper Title -->
                    <div class="text-[4px] italic text-neutral-600 mb-0.5 font-serifPaper">Review</div>
                    <div class="text-[6px] font-bold text-black leading-[1.2] mb-1 font-serifPaper line-clamp-2">
                        ${doc.fullTitle}
                    </div>
                    <div class="text-[4.3px] font-bold text-neutral-800 mb-1.5 font-serifPaper">
                        Chunpeng Tian¹, Zhaoyang Xu², Lukun Wang¹
                    </div>

                    <!-- Miniature Abstract Block -->
                    <div class="text-[4px] text-neutral-800 leading-[1.34] text-justify font-serifPaper">
                        <strong>Abstract:</strong> This systematic review aims to investigate recent developments in the area of arc fault detection. The rising demand for electricity and concomitant expansion of energy systems has resulted in a heightened risk of arc faults and related fires. Through a meticulous literature selection process, 63 articles were included in the final analysis.
                    </div>
                </div>

                <div class="border-t border-neutral-800 pt-1 text-[3.7px] text-neutral-700 font-serifPaper truncate">
                    <strong>Keywords:</strong> arc fault detection; artificial intelligence
                </div>
            </div>

            <!-- Centered Document Label underneath -->
            <span class="mt-2.5 text-[11px] font-semibold text-white tracking-wide max-w-[170px] truncate">
                ${doc.title}
            </span>
        </div>
    `).join('');
}

// =====================================================================
// LEFT SIDEBAR NAVIGATION & ACCOUNT DRAWER
// =====================================================================
function switchHubTab(tab) {
    const tabs = ['my-docs', 'shared-docs', 'resources'];
    tabs.forEach(t => {
        const btn = document.getElementById(`hub-nav-${t}`);
        if (!btn) return;
        if (t === tab) {
            btn.className = "w-full py-1.5 px-4 rounded-full text-[13px] font-normal border border-white/70 text-white bg-white/[0.02] transition text-center focus:outline-none";
        } else {
            btn.className = "w-full py-1.5 px-4 rounded-full text-[13px] font-normal border border-white/[0.12] text-white/35 hover:text-white/75 hover:border-white/30 transition text-center focus:outline-none";
        }
    });

    closeSmartReader();
    const heading = document.getElementById('hub-section-heading');
    if (heading) {
        if (tab === 'my-docs') {
            heading.textContent = 'Recent Document';
        } else if (tab === 'shared-docs') {
            heading.textContent = 'Shared Document';
        } else {
            heading.textContent = 'Academic Lexicon Resources';
        }
    }
}

function toggleAccountMenu() {
    isAccountDrawerOpen = !isAccountDrawerOpen;
    const drawer = document.getElementById('hub-account-drawer');
    const chevron = document.getElementById('account-chevron-icon');
    if (!drawer || !chevron) return;
    if (isAccountDrawerOpen) {
        drawer.classList.add('open');
        chevron.style.transform = 'rotate(180deg)';
    } else {
        drawer.classList.remove('open');
        chevron.style.transform = 'rotate(0deg)';
    }
}

// =====================================================================
// "+ NEW FILE" UPLOAD & DRAG-AND-DROP LOGIC (ALWAYS SLOT 1)
// =====================================================================
function triggerNewFilePicker() {
    const input = document.getElementById('hub-pdf-upload-input');
    if (input) input.click();
}

function handleNewFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    addUploadedFileToHub(file.name);
    event.target.value = '';
}

function handleDragOver(event) {
    event.preventDefault();
    const dropCard = document.getElementById('new-file-dropcard');
    if (dropCard) dropCard.classList.add('drag-active');
}

function handleDragLeave(event) {
    event.preventDefault();
    const dropCard = document.getElementById('new-file-dropcard');
    if (dropCard) dropCard.classList.remove('drag-active');
}

function handleFileDrop(event) {
    event.preventDefault();
    const dropCard = document.getElementById('new-file-dropcard');
    if (dropCard) dropCard.classList.remove('drag-active');
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) {
        addUploadedFileToHub(file.name);
    }
}

function addUploadedFileToHub(rawName) {
    const cleanTitle = rawName.replace(/\.pdf$/i, '');
    // Insert right after "+ New File" (Slot 1)
    hubDocuments.unshift({
        id: 'doc-' + Date.now(),
        title: cleanTitle,
        fullTitle: cleanTitle + ': Uploaded Research Manuscript',
        isDemo: false
    });
    renderHubDocuments();
    showHubToast(`Added "${cleanTitle}" to Recent Documents`);
}

function toggleRecentDocumentsGrid() {
    isRecentGridExpanded = !isRecentGridExpanded;
    const grid = document.getElementById('hub-documents-grid');
    const tri = document.getElementById('recent-dropdown-triangle');
    if (!grid || !tri) return;
    if (isRecentGridExpanded) {
        grid.classList.remove('hidden');
        tri.style.transform = 'rotate(0deg)';
    } else {
        grid.classList.add('hidden');
        tri.style.transform = 'rotate(-90deg)';
    }
}

// =====================================================================
// INTERACTIVE SMART SENTENCE READER LOGIC
// =====================================================================
const readerSentenceData = [
    {
        badge: "SENTENCE 01 • TRANSLATING IDEA",
        orig: '"This systematic review aims to investigate recent developments in the area of arc fault detection."',
        en: '"This paper reviews the newest methods for detecting dangerous electrical sparks (arc faults)."',
        id: '"Tinjauan sistematis ini bertujuan mempelajari perkembangan terbaru dalam mendeteksi percikan api listrik (arc fault)."',
        extra: '<span class="text-neutral-400">Role:</span><span class="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Paper Objective</span>'
    },
    {
        badge: "SENTENCE 02 • TRANSLATING IDEA + LEXICAL HIT",
        orig: '"The rising demand for electricity and concomitant expansion of energy systems has resulted in a heightened risk of arc faults and the likelihood of related fires, presenting a matter of considerable concern."',
        en: '"As electricity use grows and power grids expand at the same time, dangerous electrical sparks (arc faults) and fires are much more likely to happen."',
        id: '"Seiring meningkatnya kebutuhan listrik dan meluasnya jaringan energi secara bersamaan (concomitant), risiko percikan api listrik dan kebakaran menjadi jauh lebih tinggi."',
        extra: '<span class="text-neutral-400">Detected Terms:</span><span class="px-2.5 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-400/30"><strong>concomitant</strong> (C2) → happening at the same time</span><span class="px-2.5 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-400/30"><strong>heightened</strong> (C1) → increased</span>'
    },
    {
        badge: "SENTENCE 03 • QUICK REFERENCE + IDEA",
        orig: '"To address this challenge, this review focuses on the role of artificial intelligence (AI) in arc fault detection, with the objective of illuminating its advantages and identifying current limitations."',
        en: '"To solve the fire risk from Sentence 2, the authors examine how AI can detect arc faults faster, while pointing out where AI still struggles."',
        id: '"Untuk mengatasi risiko kebakaran pada Kalimat 2, tinjauan ini berfokus pada peran AI dalam mendeteksi gangguan busur api beserta kelebihan dan keterbatasannya."',
        extra: '<span class="text-neutral-400">Reference Link:</span><span class="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-400/30"><strong>"this challenge"</strong> refers to → Heightened risk of arc faults &amp; fires (Sentence 2)</span>'
    },
    {
        badge: "SENTENCE 04 • PASSIVE VOICE QUICK REFERENCE",
        orig: '"Through a meticulous literature selection process, a total of 63 articles were included in the final analysis."',
        en: '"The authors (Tian et al.) carefully screened the research literature and selected 63 peer-reviewed papers for their final analysis."',
        id: '"Melalui proses seleksi literatur yang ketat, para penulis (Tian dkk.) menyertakan total 63 artikel jurnal dalam analisis akhir."',
        extra: '<span class="text-neutral-400">Passive Resolved:</span><span class="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"><strong>"were included"</strong> → Actor: The Review Authors (Tian et al., 2023)</span>'
    },
    {
        badge: "SENTENCE 05 • PASSIVE VOICE + LEXICAL HIT",
        orig: '"Simultaneously, three major challenges were also identified, including missed and false detections, the restricted application of neural networks and the paucity of relevant data."',
        en: '"At the same time, analyzing those 63 papers revealed three big hurdles: missed or false alarms, inflexible neural networks, and a severe shortage (paucity) of training data."',
        id: '"Secara bersamaan, ditemukan tiga tantangan utama: deteksi yang terlewat/palsu, keterbatasan penerapan jaringan saraf, dan kelangkaan (paucity) data yang relevan."',
        extra: '<span class="px-2.5 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-400/30"><strong>paucity</strong> (C2) → severe shortage</span><span class="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-400/30"><strong>"were also identified"</strong> → Actor: Tian et al. across the 63 articles</span>'
    },
    {
        badge: "SENTENCE 06 • TRANSLATING IDEA",
        orig: '"In conclusion, AI has exhibited tremendous potential for transforming the field of arc fault detection and holds substantial promise for enhancing electrical safety."',
        en: '"Overall, AI shows huge promise for making arc fault detection much more reliable and keeping electrical grids safe."',
        id: '"Kesimpulannya, AI menunjukkan potensi besar untuk mengubah bidang deteksi gangguan busur api dan meningkatkan keselamatan kelistrikan."',
        extra: '<span class="text-neutral-400">Detected Terms:</span><span class="px-2.5 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-400/30"><strong>exhibited</strong> (C1) → shown / demonstrated</span>'
    },
    {
        badge: "SENTENCE 07 • TRANSLATING IDEA + LEXICAL HIT",
        orig: '"The proliferation of urbanization and industrialization has resulted in a surging demand for energy, necessitating the development of new and efficient energy systems."',
        en: '"Rapid city and factory growth has caused energy demand to spike, requiring newer and more efficient power systems."',
        id: '"Pesatnya pertumbuhan (proliferation) urbanisasi dan industrialisasi meningkatkan kebutuhan energi secara drastis."',
        extra: '<span class="text-neutral-400">Detected Terms:</span><span class="px-2.5 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-400/30"><strong>proliferation</strong> (C1) → rapid growth / spread</span>'
    },
    {
        badge: "SENTENCE 08 • EASY CITATION [1]",
        orig: '"Nonetheless, the outdated nature of current photovoltaic and energy storage systems has given rise to numerous incidents of arc faults [1]."',
        en: '"However, aging solar panels (photovoltaic) and battery storage systems have caused many dangerous arc fault incidents [1]."',
        id: '"Namun, kondisi sistem panel surya (fotovoltaik) dan penyimpanan energi yang menua telah memicu banyak insiden percikan busur api [1]."',
        extra: '<span class="px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30"><strong>Inline Citation [1]</strong> → Lu, S., Phung, B. T., &amp; Zhang, D. (2018). "A comprehensive review on DC arc fault detection in photovoltaic systems." <em>IEEE Trans. Power Delivery</em>.</span>'
    }
];

function openSmartReader(docTitle) {
    const dashView = document.getElementById('hub-dashboard-view');
    const readerView = document.getElementById('hub-reader-view');
    const titleEl = document.getElementById('reader-doc-title');

    if (dashView) dashView.classList.add('hidden');
    if (readerView) {
        readerView.classList.remove('hidden');
        readerView.classList.add('flex');
    }
    if (titleEl) titleEl.textContent = docTitle;
    selectReaderSentence(1);
}

function closeSmartReader() {
    const readerView = document.getElementById('hub-reader-view');
    const dashView = document.getElementById('hub-dashboard-view');

    if (readerView) {
        readerView.classList.add('hidden');
        readerView.classList.remove('flex');
    }
    if (dashView) dashView.classList.remove('hidden');
}

function selectReaderSentence(idx) {
    activeReaderSentenceIdx = idx;
    for (let i = 0; i < readerSentenceData.length; i++) {
        const el = document.getElementById(`rsent-${i}`);
        if (!el) continue;
        if (i === idx) {
            el.classList.add('active-sentence');
        } else {
            el.classList.remove('active-sentence');
        }
    }

    const item = readerSentenceData[idx];
    if (!item) return;

    const badge = document.getElementById('rguide-badge');
    const before = document.getElementById('rguide-before');
    const after = document.getElementById('rguide-after');
    const extra = document.getElementById('rguide-extra');

    if (badge) badge.textContent = item.badge;
    if (before) before.textContent = item.orig;
    if (after) after.textContent = currentReaderLang === 'en' ? item.en : item.id;
    if (extra) extra.innerHTML = item.extra;
}

function setReaderLang(lang) {
    currentReaderLang = lang;
    const btnEn = document.getElementById('reader-lang-en');
    const btnId = document.getElementById('reader-lang-id');
    if (btnEn && btnId) {
        if (lang === 'en') {
            btnEn.className = "px-3 py-1 rounded-full bg-readitGreen text-black font-semibold transition";
            btnId.className = "px-3 py-1 rounded-full text-white/60 hover:text-white transition";
        } else {
            btnId.className = "px-3 py-1 rounded-full bg-readitGreen text-black font-semibold transition";
            btnEn.className = "px-3 py-1 rounded-full text-white/60 hover:text-white transition";
        }
    }
    selectReaderSentence(activeReaderSentenceIdx);
}

// =====================================================================
// MODALS FOR GUIDES & ACCOUNT DRAWER ITEMS
// =====================================================================
const guideModalItems = [
    {
        title: "01 · Hover & Click Sentence",
        desc: "Hover over any sentence in your PDF to highlight the full sentence automatically. Click once to open the inline breakdown accordion right below the paragraph."
    },
    {
        title: "02 · Translating Idea",
        desc: "Converts dense C1/C2 academic phrasing into plain, clear language in Simple English or Bahasa Indonesia while keeping technical accuracy intact."
    },
    {
        title: "03 · Quick Reference (Passive Voice)",
        desc: "Automatically links ambiguous passive phrases ('were identified', 'this challenge') back to the exact actor or subject in preceding sentences."
    },
    {
        title: "04 · Easy Citation",
        desc: "Brings bibliography references like [1] directly into your inline reading accordion so you never lose your scroll position."
    }
];

function openGuideVideoModal(idx) {
    const item = guideModalItems[idx];
    if (!item) return;
    const titleEl = document.getElementById('video-modal-title');
    const descEl = document.getElementById('video-modal-desc');
    const modal = document.getElementById('hub-video-modal');

    if (titleEl) titleEl.textContent = item.title;
    if (descEl) descEl.textContent = item.desc;
    if (modal) modal.classList.remove('hidden');
}

function closeGuideVideoModal() {
    const modal = document.getElementById('hub-video-modal');
    if (modal) modal.classList.add('hidden');
}

function openAccountModal(type) {
    const modal = document.getElementById('hub-account-modal');
    const title = document.getElementById('account-modal-title');
    const body = document.getElementById('account-modal-body');
    if (!modal || !title || !body) return;

    if (type === 'settings') {
        title.textContent = 'Account Settings';
        body.innerHTML = `
            <div class="space-y-3">
                <div>
                    <label class="block text-[11px] text-white/50 mb-1">Display Name</label>
                    <input type="text" value="Nama Akun" class="w-full px-3 py-2 rounded-lg bg-[#1A1A1A] border border-white/15 text-white text-xs focus:outline-none focus:border-readitGreen" />
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg bg-[#1A1A1A] border border-white/10">
                    <div>
                        <div class="font-medium text-white">Current Plan</div>
                        <div class="text-[11px] text-white/50">Free Academic Tier (Unlimited Local AWL Lookups)</div>
                    </div>
                    <span class="px-2.5 py-0.5 rounded-full bg-readitGreen/20 text-readitGreen font-semibold text-[10px]">Active</span>
                </div>
            </div>
        `;
    } else if (type === 'preference') {
        title.textContent = 'Reading Preference';
        body.innerHTML = `
            <div class="space-y-3">
                <div>
                    <label class="block text-[11px] text-white/50 mb-1.5">Default Breakdown Language</label>
                    <select onchange="setReaderLang(this.value)" class="w-full px-3 py-2 rounded-lg bg-[#1A1A1A] border border-white/15 text-white text-xs focus:outline-none">
                        <option value="en" ${currentReaderLang === 'en' ? 'selected' : ''}>Simple English (EN)</option>
                        <option value="id" ${currentReaderLang === 'id' ? 'selected' : ''}>Bahasa Indonesia (ID)</option>
                    </select>
                </div>
                <label class="flex items-center justify-between p-3 rounded-lg bg-[#1A1A1A] border border-white/10 cursor-pointer">
                    <span>Auto-highlight whole sentence on hover</span>
                    <input type="checkbox" checked class="accent-[#76B843]" />
                </label>
            </div>
        `;
    } else {
        title.textContent = 'Privacy and Policy';
        body.innerHTML = `
            <p class="leading-relaxed text-white/70">
                READit processes uploaded academic PDFs locally in your browser session and only sends individual clicked sentences (plus adjacent sentence context) to generate plain-language breakdowns. Your manuscripts are never used to train external models.
            </p>
        `;
    }

    modal.classList.remove('hidden');
}

function closeAccountModal() {
    const modal = document.getElementById('hub-account-modal');
    if (modal) modal.classList.add('hidden');
}

function saveAccountModal() {
    closeAccountModal();
    showHubToast('Preferences saved');
}

function handleLogoutAction() {
    toggleAccountMenu();
    showHubToast('Logged out of Nama Akun (Free plan)');
}

function showHubToast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2600);
}

// =====================================================================
// GLOBAL INITIALIZATION & KEY LISTENERS
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
    renderHubDocuments();
});

// Close modals on Escape key
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeGuideVideoModal();
        closeAccountModal();
    }
});

// Expose functions to window for inline onclick handlers
window.renderHubDocuments = renderHubDocuments;
window.switchHubTab = switchHubTab;
window.toggleAccountMenu = toggleAccountMenu;
window.triggerNewFilePicker = triggerNewFilePicker;
window.handleNewFileUpload = handleNewFileUpload;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleFileDrop = handleFileDrop;
window.addUploadedFileToHub = addUploadedFileToHub;
window.toggleRecentDocumentsGrid = toggleRecentDocumentsGrid;
window.openSmartReader = openSmartReader;
window.closeSmartReader = closeSmartReader;
window.selectReaderSentence = selectReaderSentence;
window.setReaderLang = setReaderLang;
window.openGuideVideoModal = openGuideVideoModal;
window.closeGuideVideoModal = closeGuideVideoModal;
window.openAccountModal = openAccountModal;
window.closeAccountModal = closeAccountModal;
window.saveAccountModal = saveAccountModal;
window.handleLogoutAction = handleLogoutAction;
window.showHubToast = showHubToast;
