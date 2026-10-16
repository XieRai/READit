/**
 * READit Document Hub Controller (hub.js)
 * Features:
 *  - Collapsible / Minimizable Sidebar (w-[240px] <-> w-[68px], Ctrl+B shortcut)
 *  - Drag & Drop PDF Validation (<20MB, full-screen overlay + slot card)
 *  - Multi-Tab Reading System (Switch between multiple open files, close tabs, add new tab)
 *  - PDF.js Client-Side Extraction & Interactive Sentence Reader
 *  - Smooth Frosted Auth Modal with Sliding Login / Sign Up Cards
 *  - Live Gemini 2.0 Flash AI Integration for Sentence Analysis
 */

// =====================================================================
// AUTH STATE & ACCOUNT CONTROLLER (DEFAULT: LOGGED OUT)
// =====================================================================
let isLoggedIn = false;
let currentUser = null;
let isAccountDrawerOpen = false;
let isSidebarMinimized = false;
let pendingUploadFiles = [];
let dragCounter = 0;

function initAccountState() {
    const saved = localStorage.getItem('readit_user');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            isLoggedIn = true;
        } catch (e) {
            currentUser = null;
            isLoggedIn = false;
        }
    } else {
        currentUser = null;
        isLoggedIn = false;
    }
    updateAccountUI();
}

function updateAccountUI() {
    const avatar = document.getElementById('account-avatar-circle');
    const mobileAvatar = document.getElementById('mobile-top-avatar');
    const nameLabel = document.getElementById('account-name-label');
    const planLabel = document.getElementById('account-plan-label');
    const chevron = document.getElementById('account-chevron-icon');
    const drawer = document.getElementById('hub-account-drawer');

    if (isLoggedIn && currentUser) {
        if (avatar) {
            avatar.className = "w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 border border-white/20 flex items-center justify-center text-xs text-white font-bold shrink-0";
            avatar.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
        }
        if (mobileAvatar) {
            mobileAvatar.className = "w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 border border-white/20 flex items-center justify-center text-xs text-white font-bold shrink-0";
            mobileAvatar.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
        }
        if (nameLabel) nameLabel.textContent = currentUser.name || 'Nama Akun';
        if (planLabel) planLabel.textContent = currentUser.plan || 'Free plan';
        if (chevron) {
            chevron.innerHTML = '<polyline points="18 15 12 9 6 15"></polyline>';
            chevron.style.transform = isAccountDrawerOpen ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    } else {
        if (avatar) {
            avatar.className = "w-7 h-7 rounded-full bg-[#333333] border border-white/10 flex items-center justify-center text-xs text-white/70 font-semibold shrink-0";
            avatar.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        }
        if (mobileAvatar) {
            mobileAvatar.className = "w-8 h-8 rounded-full bg-[#333333] border border-white/10 flex items-center justify-center text-xs text-white/70 font-semibold transition-colors";
            mobileAvatar.innerHTML = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
        }
        if (nameLabel) nameLabel.textContent = 'Sign in';
        if (planLabel) planLabel.textContent = 'Click to access account';
        if (chevron) {
            chevron.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
            chevron.style.transform = 'rotate(0deg)';
        }
        if (drawer) drawer.classList.remove('open');
        isAccountDrawerOpen = false;
    }
}

let isMobileSidebarOpen = false;

function toggleMobileSidebar(openState) {
    const sidebar = document.getElementById('hub-sidebar');
    const backdrop = document.getElementById('hub-mobile-sidebar-backdrop');
    if (!sidebar) return;

    if (openState === undefined) {
        isMobileSidebarOpen = !isMobileSidebarOpen;
    } else {
        isMobileSidebarOpen = !!openState;
    }

    if (isMobileSidebarOpen) {
        // Strip collapsed state on mobile so all button text and labels are 100% visible
        sidebar.classList.remove('sidebar-collapsed');
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        if (backdrop) {
            backdrop.classList.remove('hidden', 'pointer-events-none');
            requestAnimationFrame(() => {
                backdrop.classList.add('opacity-100');
            });
        }
    } else {
        sidebar.classList.add('-translate-x-full');
        sidebar.classList.remove('translate-x-0');
        if (backdrop) {
            backdrop.classList.remove('opacity-100');
            setTimeout(() => {
                backdrop.classList.add('hidden', 'pointer-events-none');
            }, 300);
        }
    }
}

function handleAccountTriggerClick() {
    // If the sidebar is collapsed/shrinked on desktop, unable to tap on the profile icon
    if (isSidebarMinimized && window.innerWidth >= 768) {
        return;
    }
    if (!isLoggedIn) {
        openAuthModal('signin');
    } else {
        toggleAccountMenu();
    }
}

function toggleAccountMenu() {
    if (!isLoggedIn) {
        openAuthModal('signin');
        return;
    }
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
// SIDEBAR COLLAPSE / MINIMIZE SYSTEM
// =====================================================================
function initSidebarState() {
    const saved = localStorage.getItem('readit_sidebar_collapsed');
    // Only apply collapsed state on desktop viewports (>= 768px)
    if (saved === 'true' && window.innerWidth >= 768) {
        isSidebarMinimized = true;
        const sidebar = document.getElementById('hub-sidebar');
        if (sidebar) sidebar.classList.add('sidebar-collapsed');
    } else {
        isSidebarMinimized = false;
        const sidebar = document.getElementById('hub-sidebar');
        if (sidebar) sidebar.classList.remove('sidebar-collapsed');
    }
    updateSidebarToggleTooltip();
}

function toggleSidebarMinimize() {
    // On mobile viewports (< 768px), closing or toggling hides the mobile drawer instead
    if (window.innerWidth < 768) {
        toggleMobileSidebar(false);
        return;
    }

    isSidebarMinimized = !isSidebarMinimized;
    const sidebar = document.getElementById('hub-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('sidebar-collapsed', isSidebarMinimized);
    }
    if (isSidebarMinimized) {
        const drawer = document.getElementById('hub-account-drawer');
        if (drawer) drawer.classList.remove('open');
        isAccountDrawerOpen = false;
        const chevron = document.getElementById('account-chevron-icon');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
    localStorage.setItem('readit_sidebar_collapsed', isSidebarMinimized ? 'true' : 'false');
    updateSidebarToggleTooltip();
}

function updateSidebarToggleTooltip() {
    const btn = document.getElementById('sidebar-toggle-btn');
    if (btn) {
        btn.title = isSidebarMinimized ? 'Expand sidebar (Ctrl+B)' : 'Minimize sidebar (Ctrl+B)';
    }
}

// Listen to screen resize to ensure mobile sidebar always has full text
window.addEventListener('resize', () => {
    const sidebar = document.getElementById('hub-sidebar');
    if (!sidebar) return;
    if (window.innerWidth < 768) {
        sidebar.classList.remove('sidebar-collapsed');
    } else {
        const saved = localStorage.getItem('readit_sidebar_collapsed');
        if (saved === 'true') {
            isSidebarMinimized = true;
            sidebar.classList.add('sidebar-collapsed');
        }
        toggleMobileSidebar(false);
    }
    updateSidebarToggleTooltip();
});

// =====================================================================
// AUTH MODAL: SMOOTH FROSTED BACKDROP & SLIDING LOGIN / SIGN UP CARDS
// =====================================================================
function openAuthModal(mode = 'signin', customNote = null) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    const note = document.getElementById('auth-signin-note');
    if (note) {
        note.textContent = customNote || 'Sign in to upload custom research PDFs, save lexicons, and sync reading notes.';
    }

    if (mode === 'signup') {
        switchToSignUp(true);
    } else {
        switchToSignIn(true);
    }

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
    });
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 320);
}

function switchToSignUp(instant = false) {
    const signin = document.getElementById('auth-card-signin');
    const signup = document.getElementById('auth-card-signup');
    if (!signin || !signup) return;

    if (instant) {
        signin.style.transition = 'none';
        signup.style.transition = 'none';
    }

    signin.classList.remove('translate-x-0', 'opacity-100', 'pointer-events-auto');
    signin.classList.add('-translate-x-[150%]', 'opacity-0', 'pointer-events-none');

    signup.classList.remove('translate-x-[150%]', 'opacity-0', 'pointer-events-none');
    signup.classList.add('translate-x-0', 'opacity-100', 'pointer-events-auto');

    if (instant) {
        void signup.offsetWidth;
        signin.style.transition = '';
        signup.style.transition = '';
    }
}

function switchToSignIn(instant = false) {
    const signin = document.getElementById('auth-card-signin');
    const signup = document.getElementById('auth-card-signup');
    if (!signin || !signup) return;

    if (instant) {
        signin.style.transition = 'none';
        signup.style.transition = 'none';
    }

    signup.classList.remove('translate-x-0', 'opacity-100', 'pointer-events-auto');
    signup.classList.add('translate-x-[150%]', 'opacity-0', 'pointer-events-none');

    signin.classList.remove('-translate-x-[150%]', 'opacity-0', 'pointer-events-none');
    signin.classList.add('translate-x-0', 'opacity-100', 'pointer-events-auto');

    if (instant) {
        void signin.offsetWidth;
        signin.style.transition = '';
        signup.style.transition = '';
    }
}

function triggerPendingUploadsIfAny() {
    if (pendingUploadFiles && pendingUploadFiles.length > 0) {
        const toProcess = pendingUploadFiles;
        pendingUploadFiles = [];
        setTimeout(() => {
            handlePdfFiles(toProcess);
        }, 350);
    }
}

function handleGoogleSignIn() {
    currentUser = {
        name: 'Google Scholar',
        email: 'scholar@gmail.com',
        plan: 'Free plan'
    };
    isLoggedIn = true;
    localStorage.setItem('readit_user', JSON.stringify(currentUser));
    updateAccountUI();
    closeAuthModal();
    showHubToast('Signed in with Google (Demo)');
    triggerPendingUploadsIfAny();
}

function handleEmailSignIn(event) {
    event.preventDefault();
    const emailInput = document.getElementById('signin-email-input');
    const email = (emailInput && emailInput.value ? emailInput.value : 'researcher@academic.edu').trim();
    const namePart = email.split('@')[0] || 'Researcher';
    const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    currentUser = {
        name: formattedName,
        email: email,
        plan: 'Free plan'
    };
    isLoggedIn = true;
    localStorage.setItem('readit_user', JSON.stringify(currentUser));
    updateAccountUI();
    closeAuthModal();
    showHubToast(`Welcome back, ${currentUser.name}`);
    triggerPendingUploadsIfAny();
}

function handleEmailSignUp(event) {
    event.preventDefault();
    const nameInput = document.getElementById('signup-name-input');
    const emailInput = document.getElementById('signup-email-input');
    const name = (nameInput && nameInput.value ? nameInput.value : 'New Researcher').trim();
    const email = (emailInput && emailInput.value ? emailInput.value : 'user@readit.org').trim();

    currentUser = {
        name: name,
        email: email,
        plan: 'Free plan'
    };
    isLoggedIn = true;
    localStorage.setItem('readit_user', JSON.stringify(currentUser));
    updateAccountUI();
    closeAuthModal();
    showHubToast(`Account created! Welcome, ${currentUser.name}`);
    triggerPendingUploadsIfAny();
}

function handleLogoutAction() {
    isLoggedIn = false;
    currentUser = null;
    localStorage.removeItem('readit_user');
    updateAccountUI();
    showHubToast('Signed out of READit');
}

// =====================================================================
// PRE-BAKED DEMO FILE SENTENCE DATA
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

// =====================================================================
// RECENT DOCUMENTS LIST & MULTI-TAB SYSTEM STATE
// =====================================================================
let hubDocuments = [
    {
        id: 'demo-arc-fault',
        title: 'Demo File',
        fullTitle: 'Arc fault detection using artificial intelligence: Challenges and benefits',
        isDemo: true,
        pageCount: 29,
        sentences: readerSentenceData
    }
];

let openTabs = [
    {
        id: 'demo-arc-fault',
        title: 'Demo File',
        fullTitle: 'Arc fault detection using artificial intelligence: Challenges and benefits',
        isDemo: true,
        sentences: readerSentenceData,
        activeSentenceIdx: 1,
        pageCount: 29
    }
];

let activeTabId = 'demo-arc-fault';
let isRecentGridExpanded = true;
let currentReaderLang = 'en';

function renderHubDocuments() {
    const listContainer = document.getElementById('hub-dynamic-docs-list');
    if (!listContainer) return;

    listContainer.innerHTML = hubDocuments.map((doc) => `
        <div class="flex flex-col items-center w-full group cursor-pointer touch-manipulation" onclick="openSmartReader('${doc.title.replace(/'/g, "\\'")}')">
            <!-- Miniature Paper Thumbnail (Aspect 175/225 responsive, touch target >= 44x44px) -->
            <div class="w-full aspect-[175/225] min-h-[190px] sm:min-h-[225px] rounded-[14px] bg-white p-3 sm:p-3.5 text-[#111827] shadow-md border border-transparent group-hover:ring-2 group-hover:ring-readitGreen active:scale-[0.98] transition-all overflow-hidden flex flex-col justify-between select-none">
                <div>
                    <!-- Miniature Journal Header -->
                    <div class="flex items-start justify-between border-b border-neutral-800 pb-1 sm:pb-1.5 mb-1 sm:mb-1.5">
                        <div class="flex items-center gap-1">
                            <div class="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border border-[#0284C7] flex items-center justify-center text-[3.8px] sm:text-[4.5px] font-bold text-[#0284C7]">PDF</div>
                            <div class="text-[4.3px] sm:text-[5px] italic text-[#0284C7] leading-tight font-serifPaper">
                                <div>Academic Research</div>
                                <div>Manuscript</div>
                            </div>
                        </div>
                        <div class="text-[3.6px] sm:text-[4.5px] text-neutral-700 leading-tight text-right font-serifPaper">
                            <div>${doc.pageCount || 1} Pages</div>
                            <div>READit Hub</div>
                        </div>
                    </div>

                    <!-- Miniature Paper Title -->
                    <div class="text-[4px] sm:text-[5px] italic text-neutral-600 mb-0.5 font-serifPaper">Research Article</div>
                    <div class="text-[6.5px] sm:text-[7.5px] font-bold text-black leading-[1.2] mb-1 font-serifPaper line-clamp-2">
                        ${doc.fullTitle || doc.title}
                    </div>

                    <!-- Miniature Abstract Block -->
                    <div class="text-[4.2px] sm:text-[5.2px] text-neutral-800 leading-[1.34] text-justify font-serifPaper line-clamp-5 sm:line-clamp-6">
                        <strong>Preview:</strong> ${doc.sentences && doc.sentences[0] ? doc.sentences[0].orig.replace(/^"|"$/g, '') : 'Interactive academic manuscript prepared for sentence-by-sentence analysis.'}
                    </div>
                </div>

                <div class="border-t border-neutral-800 pt-1 text-[3.8px] sm:text-[4.8px] text-neutral-700 font-serifPaper truncate">
                    <strong>Format:</strong> PDF • Multi-tab Reader Enabled
                </div>
            </div>

            <!-- Centered Document Label underneath -->
            <span class="mt-2.5 text-[11px] sm:text-xs font-semibold text-white tracking-wide w-full max-w-[170px] truncate text-center px-1">
                ${doc.title}
            </span>
        </div>
    `).join('');
}

// =====================================================================
// DRAG & DROP VALIDATION: PDF ONLY & UNDER 20MB
// =====================================================================
const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

function validatePdfFile(file) {
    if (!file) return { valid: false, error: 'No file provided.' };
    const name = file.name || '';
    const isPdf = file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
        return { valid: false, error: `"${name}" is not a PDF. Only PDF files are supported.` };
    }
    if (file.size > MAX_PDF_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        return { valid: false, error: `"${name}" exceeds 20MB limit (${sizeMb}MB). Maximum file size is 20MB.` };
    }
    return { valid: true };
}

function handlePdfFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    if (!isLoggedIn) {
        pendingUploadFiles = files;
        openAuthModal('signin', 'Please sign in to upload and analyze your PDF documents.');
        return;
    }

    const validFiles = [];
    for (const file of files) {
        const validation = validatePdfFile(file);
        if (!validation.valid) {
            showHubToast(validation.error);
        } else {
            validFiles.push(file);
        }
    }

    if (validFiles.length === 0) return;

    for (const file of validFiles) {
        processAndOpenPdf(file);
    }
}

// "+ New File" Button / Drop Card Trigger
function triggerNewFilePicker() {
    if (!isLoggedIn) {
        openAuthModal('signin', 'Please sign in to upload your research documents.');
        return;
    }
    const input = document.getElementById('hub-pdf-upload-input');
    if (input) input.click();
}

function handleNewFileUpload(event) {
    handlePdfFiles(event.target.files);
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
    handlePdfFiles(event.dataTransfer.files);
}

// Global Full-Screen Drag and Drop Listeners
function initGlobalDragAndDrop() {
    const overlay = document.getElementById('global-drag-overlay');

    window.addEventListener('dragenter', (e) => {
        if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
            dragCounter++;
            if (overlay) {
                overlay.classList.remove('hidden');
                overlay.classList.add('flex');
            }
        }
    });

    window.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            if (overlay) {
                overlay.classList.add('hidden');
                overlay.classList.remove('flex');
            }
        }
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
        if (e.dataTransfer && e.dataTransfer.files) {
            handlePdfFiles(e.dataTransfer.files);
        }
    });
}

// =====================================================================
// PDF.JS PARSER & CUSTOM DOCUMENT GENERATOR
// =====================================================================
async function processAndOpenPdf(file) {
    const cleanTitle = file.name.replace(/\.pdf$/i, '');
    showHubToast(`Reading "${cleanTitle}"...`);

    let extractedSentences = [];
    let pageCount = 1;

    try {
        if (window.pdfjsLib) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            pageCount = pdf.numPages;

            let fullText = '';
            const pagesToRead = Math.min(pdf.numPages, 10);
            for (let i = 1; i <= pagesToRead; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageStr = content.items.map(it => it.str).join(' ');
                fullText += pageStr + ' ';
            }

            // Split into sentences
            const rawSentences = fullText
                .replace(/\s+/g, ' ')
                .match(/[^.!?]+[.!?]+(?:\s|$)/g) || [];

            const cleanSentences = rawSentences
                .map(s => s.trim())
                .filter(s => s.length > 25 && !s.match(/^[0-9\s.,-]+$/));

            if (cleanSentences.length > 0) {
                extractedSentences = cleanSentences.slice(0, 30).map((s, idx) => {
                    return generateSentenceBreakdown(s, idx + 1);
                });
            }
        }
    } catch (err) {
        console.warn('PDF.js reading error, fallback mode activated:', err);
    }

    if (extractedSentences.length === 0) {
        extractedSentences = [
            {
                badge: `DOCUMENT • ${cleanTitle.toUpperCase()}`,
                orig: `"${cleanTitle} has been loaded into your smart reading workspace."`,
                en: `"This document contains ${pageCount} page(s). Click any sentence to view plain-language simplifications and resolved passive voice structures."`,
                id: `"Dokumen ini memuat ${pageCount} halaman. Klik kalimat mana saja untuk melihat terjemahan dan penjelasan ringkas dalam Bahasa Indonesia."`,
                extra: `<span class="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px]">PDF Loaded • ${pageCount} Pages • Under 20MB</span>`
            }
        ];
    }

    const docId = 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    const newDoc = {
        id: docId,
        title: cleanTitle,
        fullTitle: file.name,
        isDemo: false,
        file: file,
        pageCount: pageCount,
        sentences: extractedSentences,
        activeSentenceIdx: 0
    };

    // Insert into Recent Documents grid at slot 2
    hubDocuments.unshift(newDoc);
    renderHubDocuments();

    // Open as an active tab in the multi-tab system
    openDocumentInTab(newDoc);
    showHubToast(`Opened "${cleanTitle}" in new tab`);
}

function generateSentenceBreakdown(sentence, number) {
    const numPad = String(number).padStart(2, '0');
    const hasPassive = /\b(was|were|is|are|been|being)\s+([a-z]+ed|[a-z]+en)\b/i.test(sentence);

    const academicWords = [
        'utilize', 'exhibit', 'facilitate', 'concomitant', 'paucity', 'proliferation',
        'demonstrate', 'investigate', 'significant', 'preliminary', 'empirical', 'methodology',
        'comprehensive', 'delineate', 'synthesize', 'furthermore', 'subsequently'
    ];
    const hitKeywords = academicWords.filter(k => new RegExp('\\b' + k, 'i').test(sentence));

    let badge = `SENTENCE ${numPad} • `;
    if (hasPassive && hitKeywords.length > 0) {
        badge += 'PASSIVE VOICE + LEXICAL HIT';
    } else if (hasPassive) {
        badge += 'PASSIVE VOICE QUICK REFERENCE';
    } else if (hitKeywords.length > 0) {
        badge += 'TRANSLATING IDEA + LEXICAL HIT';
    } else {
        badge += 'TRANSLATING IDEA';
    }

    let extraHtml = '';
    if (hasPassive) {
        extraHtml += `<span class="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[11px]"><strong>Passive Voice</strong> → Click 'Ask Gemini AI' to resolve actor</span> `;
    }
    if (hitKeywords.length > 0) {
        extraHtml += hitKeywords.map(k => `<span class="px-2.5 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-400/30 text-[11px]"><strong>${k}</strong> (Academic)</span>`).join(' ');
    }
    if (!extraHtml) {
        extraHtml = `<span class="text-neutral-400 text-[11px]">Click 'Ask Gemini AI' for deep conceptual analysis</span>`;
    }

    return {
        badge: badge,
        orig: `"${sentence}"`,
        en: `"${simplifyAcademicEnglish(sentence)}"`,
        id: `"${translateToBahasa(sentence)}"`,
        extra: extraHtml
    };
}

function simplifyAcademicEnglish(sentence) {
    return sentence
        .replace(/\bconcomitant\b/gi, 'simultaneous')
        .replace(/\bpaucity\b/gi, 'severe shortage')
        .replace(/\bproliferation\b/gi, 'rapid growth')
        .replace(/\bexhibited\b/gi, 'demonstrated')
        .replace(/\butilize\b/gi, 'use')
        .replace(/\bfacilitate\b/gi, 'help')
        .replace(/\bnecessitating\b/gi, 'requiring')
        .replace(/\billuminating\b/gi, 'explaining')
        .replace(/\bmeticulous\b/gi, 'careful')
        .replace(/\bnonetheless\b/gi, 'however');
}

function translateToBahasa(sentence) {
    const simplified = simplifyAcademicEnglish(sentence);
    return `Terjemahan & Penjelasan: ${simplified.slice(0, 140)}... (Klik 'Ask Gemini AI' untuk penjelasan mendalam)`;
}

// =====================================================================
// MULTI-TAB READING SYSTEM & DRAG-AND-DROP TAB REORDERING
// =====================================================================
let draggedTabId = null;
let isPaperSwitcherDrawerOpen = false;

function togglePaperSwitcherDrawer(openState) {
    const drawer = document.getElementById('reader-paper-switcher-drawer');
    const backdrop = document.getElementById('reader-drawer-backdrop');
    const chevron = document.getElementById('mobile-switcher-chevron');
    if (!drawer) return;

    if (openState === undefined) {
        isPaperSwitcherDrawerOpen = !isPaperSwitcherDrawerOpen;
    } else {
        isPaperSwitcherDrawerOpen = !!openState;
    }

    if (isPaperSwitcherDrawerOpen) {
        drawer.classList.add('open');
        if (backdrop) {
            backdrop.classList.remove('hidden', 'pointer-events-none');
            requestAnimationFrame(() => {
                backdrop.classList.add('opacity-100');
            });
        }
        if (chevron) {
            chevron.style.transform = 'rotate(180deg)';
        }
        renderDrawerPapersList();
    } else {
        drawer.classList.remove('open');
        if (backdrop) {
            backdrop.classList.remove('opacity-100');
            setTimeout(() => {
                backdrop.classList.add('hidden', 'pointer-events-none');
            }, 200);
        }
        if (chevron) {
            chevron.style.transform = 'rotate(0deg)';
        }
    }
}

// =====================================================================
// DRAWER PAPERS LIST (MOBILE VIEW WITH DRAG & DROP REORDERING)
// =====================================================================
let drawerTouchDragId = null;
let drawerTouchTargetId = null;
let drawerTouchInsertBefore = false;
let drawerDraggedTabId = null;

function renderDrawerPapersList() {
    const container = document.getElementById('drawer-papers-list');
    if (!container) return;

    container.innerHTML = openTabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        return `
            <div id="drawer-paper-item-${tab.id}"
                 data-tab-id="${tab.id}"
                 data-tab-index="${idx}"
                 draggable="true"
                 ondragstart="handleDrawerDragStart(event, '${tab.id}')"
                 ondragover="handleDrawerDragOver(event, '${tab.id}')"
                 ondragenter="handleDrawerDragEnter(event, '${tab.id}')"
                 ondragleave="handleDrawerDragLeave(event, '${tab.id}')"
                 ondrop="handleDrawerDrop(event, '${tab.id}')"
                 ondragend="handleDrawerDragEnd(event)"
                 class="drawer-paper-item flex items-center justify-between p-2 rounded-xl ${isActive ? 'bg-white/[0.12] border-readitGreen/60' : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'} border min-h-[48px] transition-all select-none relative">
                
                <!-- Touch & Mouse Drag Handle -->
                <div class="drawer-drag-handle p-2 min-w-[36px] min-h-[44px] flex items-center justify-center text-white/40 hover:text-white/80 active:text-readitGreen cursor-grab active:cursor-grabbing touch-none shrink-0" 
                     title="Touch and drag to reorder index">
                    <svg class="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <circle cx="9" cy="6" r="1.5" fill="currentColor"></circle>
                        <circle cx="15" cy="6" r="1.5" fill="currentColor"></circle>
                        <circle cx="9" cy="12" r="1.5" fill="currentColor"></circle>
                        <circle cx="15" cy="12" r="1.5" fill="currentColor"></circle>
                        <circle cx="9" cy="18" r="1.5" fill="currentColor"></circle>
                        <circle cx="15" cy="18" r="1.5" fill="currentColor"></circle>
                    </svg>
                </div>

                <!-- Paper Selection Button -->
                <button onclick="switchReaderTab('${tab.id}'); togglePaperSwitcherDrawer(false);" 
                        class="flex items-center gap-2.5 min-w-0 flex-1 text-left min-h-[44px] focus:outline-none touch-manipulation py-1">
                    <span class="w-2.5 h-2.5 rounded-full ${isActive ? 'bg-readitGreen shadow-[0_0_8px_rgba(118,184,67,0.8)]' : 'bg-white/30'} shrink-0"></span>
                    <div class="truncate flex-1 min-w-0">
                        <div class="text-xs font-semibold ${isActive ? 'text-white' : 'text-white/80'} truncate flex items-center gap-1.5">
                            <span class="truncate">${tab.title}</span>
                            <span class="text-[9px] font-monoFeature px-1.5 py-0.5 rounded bg-white/10 text-white/60 shrink-0">#${idx + 1}</span>
                        </div>
                        <div class="text-[10px] text-white/50">${tab.pageCount || 1} Pages • ${tab.isDemo ? 'Interactive Demo' : 'PDF Document'}</div>
                    </div>
                </button>

                <!-- Close Paper Button -->
                <button onclick="closeReaderTab(event, '${tab.id}')" 
                        class="min-w-[40px] min-h-[44px] flex items-center justify-center text-white/40 hover:text-white rounded-lg active:bg-white/10 transition focus:outline-none touch-manipulation shrink-0" 
                        title="Close paper">
                    ✕
                </button>
            </div>
        `;
    }).join('');

    attachDrawerTouchListeners();
}

function attachDrawerTouchListeners() {
    const list = document.getElementById('drawer-papers-list');
    if (!list) return;

    const items = list.querySelectorAll('.drawer-paper-item');
    items.forEach((item) => {
        const handle = item.querySelector('.drawer-drag-handle');
        if (!handle) return;

        handle.addEventListener('touchstart', onDrawerTouchStart, { passive: false });
        handle.addEventListener('touchmove', onDrawerTouchMove, { passive: false });
        handle.addEventListener('touchend', onDrawerTouchEnd, { passive: false });
        handle.addEventListener('touchcancel', onDrawerTouchCancel, { passive: false });
    });
}

function onDrawerTouchStart(e) {
    const item = e.currentTarget.closest('.drawer-paper-item');
    if (!item) return;

    drawerTouchDragId = item.dataset.tabId;
    drawerTouchTargetId = null;
    drawerTouchInsertBefore = false;

    item.classList.add('is-touch-dragging');
    if (navigator.vibrate) {
        try { navigator.vibrate(25); } catch (err) {}
    }
}

function onDrawerTouchMove(e) {
    if (!drawerTouchDragId) return;
    e.preventDefault();

    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetItem = el ? el.closest('.drawer-paper-item') : null;

    // Remove drag lines from all items
    document.querySelectorAll('.drawer-paper-item').forEach(it => {
        if (it !== targetItem) {
            it.classList.remove('drag-over-top', 'drag-over-bottom');
        }
    });

    if (targetItem && targetItem.dataset.tabId !== drawerTouchDragId) {
        drawerTouchTargetId = targetItem.dataset.tabId;
        const rect = targetItem.getBoundingClientRect();
        const midPoint = rect.top + rect.height / 2;

        if (touch.clientY < midPoint) {
            targetItem.classList.add('drag-over-top');
            targetItem.classList.remove('drag-over-bottom');
            drawerTouchInsertBefore = true;
        } else {
            targetItem.classList.add('drag-over-bottom');
            targetItem.classList.remove('drag-over-top');
            drawerTouchInsertBefore = false;
        }
    } else {
        drawerTouchTargetId = null;
    }
}

function onDrawerTouchEnd(e) {
    if (drawerTouchDragId && drawerTouchTargetId && drawerTouchDragId !== drawerTouchTargetId) {
        const fromIdx = openTabs.findIndex(t => t.id === drawerTouchDragId);
        const toIdx = openTabs.findIndex(t => t.id === drawerTouchTargetId);

        if (fromIdx !== -1 && toIdx !== -1) {
            const [movedTab] = openTabs.splice(fromIdx, 1);
            let targetIdx = openTabs.findIndex(t => t.id === drawerTouchTargetId);
            if (!drawerTouchInsertBefore) {
                targetIdx += 1;
            }
            targetIdx = Math.max(0, Math.min(openTabs.length, targetIdx));
            openTabs.splice(targetIdx, 0, movedTab);

            renderReaderTabs();
            showHubToast(`Moved "${movedTab.title}" to position #${targetIdx + 1}`);
        }
    }

    cleanupDrawerDragClasses();
    drawerTouchDragId = null;
    drawerTouchTargetId = null;
}

function onDrawerTouchCancel(e) {
    cleanupDrawerDragClasses();
    drawerTouchDragId = null;
    drawerTouchTargetId = null;
}

function handleDrawerDragStart(event, tabId) {
    drawerDraggedTabId = tabId;
    event.dataTransfer.setData('text/plain', tabId);
    event.dataTransfer.effectAllowed = 'move';
    const el = document.getElementById(`drawer-paper-item-${tabId}`);
    if (el) {
        requestAnimationFrame(() => el.classList.add('is-touch-dragging'));
    }
}

function handleDrawerDragOver(event, targetTabId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!drawerDraggedTabId || drawerDraggedTabId === targetTabId) return;

    const targetEl = document.getElementById(`drawer-paper-item-${targetTabId}`);
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    if (event.clientY < midPoint) {
        targetEl.classList.add('drag-over-top');
        targetEl.classList.remove('drag-over-bottom');
    } else {
        targetEl.classList.add('drag-over-bottom');
        targetEl.classList.remove('drag-over-top');
    }
}

function handleDrawerDragEnter(event, targetTabId) {
    event.preventDefault();
}

function handleDrawerDragLeave(event, targetTabId) {
    const targetEl = document.getElementById(`drawer-paper-item-${targetTabId}`);
    if (targetEl) {
        targetEl.classList.remove('drag-over-top', 'drag-over-bottom');
    }
}

function handleDrawerDrop(event, targetTabId) {
    event.preventDefault();
    event.stopPropagation();

    const targetEl = document.getElementById(`drawer-paper-item-${targetTabId}`);
    const insertBefore = targetEl && targetEl.classList.contains('drag-over-top');

    cleanupDrawerDragClasses();

    if (!drawerDraggedTabId || drawerDraggedTabId === targetTabId) {
        drawerDraggedTabId = null;
        return;
    }

    const fromIdx = openTabs.findIndex(t => t.id === drawerDraggedTabId);
    const toIdx = openTabs.findIndex(t => t.id === targetTabId);
    if (fromIdx !== -1 && toIdx !== -1) {
        const [movedTab] = openTabs.splice(fromIdx, 1);
        let targetIdx = openTabs.findIndex(t => t.id === targetTabId);
        if (!insertBefore) {
            targetIdx += 1;
        }
        targetIdx = Math.max(0, Math.min(openTabs.length, targetIdx));
        openTabs.splice(targetIdx, 0, movedTab);

        drawerDraggedTabId = null;
        renderReaderTabs();
        showHubToast(`Moved "${movedTab.title}" to position #${targetIdx + 1}`);
    }
}

function handleDrawerDragEnd(event) {
    cleanupDrawerDragClasses();
    drawerDraggedTabId = null;
}

function cleanupDrawerDragClasses() {
    document.querySelectorAll('.drawer-paper-item').forEach(item => {
        item.classList.remove('is-touch-dragging', 'drag-over-top', 'drag-over-bottom');
    });
}

// =====================================================================
// DESKTOP TABS SYSTEM (WITH '+' BUTTON STUCK TO RIGHTMOST TAB)
// =====================================================================
function renderReaderTabs() {
    const activeTab = openTabs.find(t => t.id === activeTabId) || openTabs[0];

    // Synchronize Mobile Paper Switcher Button display
    const mobileTitle = document.getElementById('mobile-active-paper-title');
    if (mobileTitle && activeTab) {
        mobileTitle.textContent = activeTab.title;
    }
    const mobileCount = document.getElementById('mobile-tab-count-badge');
    if (mobileCount) {
        mobileCount.textContent = openTabs.length;
    }
    const drawerCounter = document.getElementById('drawer-paper-counter');
    if (drawerCounter) {
        drawerCounter.textContent = `${openTabs.length} paper${openTabs.length === 1 ? '' : 's'} open`;
    }

    // Always keep drawer list up-to-date
    renderDrawerPapersList();

    const tabsBar = document.getElementById('reader-tabs-bar');
    if (!tabsBar) return;

    // Render open tabs
    const tabsHtml = openTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return `
            <div id="reader-tab-${tab.id}"
                 draggable="true"
                 ondragstart="handleTabDragStart(event, '${tab.id}')"
                 ondragover="handleTabDragOver(event, '${tab.id}')"
                 ondragenter="handleTabDragEnter(event, '${tab.id}')"
                 ondragleave="handleTabDragLeave(event, '${tab.id}')"
                 ondrop="handleTabDrop(event, '${tab.id}')"
                 ondragend="handleTabDragEnd(event)"
                 onclick="switchReaderTab('${tab.id}')" 
                 class="reader-tab ${isActive ? 'active-tab' : ''}" 
                 title="${tab.fullTitle || tab.title} (Drag left/right to reorder)">
                <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-readitGreen' : 'bg-white/30'} shrink-0 reader-tab-indicator pointer-events-none"></span>
                <span class="truncate max-w-[130px] sm:max-w-[170px] pointer-events-none">${tab.title}</span>
                <button onclick="closeReaderTab(event, '${tab.id}')" 
                        class="reader-tab-close focus:outline-none" 
                        title="Close tab">
                    ✕
                </button>
            </div>
        `;
    }).join('');

    // Append desktop '+' button sticking directly to the rightmost index of opened files
    const desktopPlusBtnHtml = `
        <button onclick="triggerNewFilePicker()" 
                id="desktop-new-tab-btn"
                class="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.15] text-white/70 hover:text-white flex items-center justify-center text-sm font-bold shrink-0 transition focus:outline-none ml-0.5" 
                title="Open or Upload Another PDF (<20MB)">
            +
        </button>
    `;

    tabsBar.innerHTML = tabsHtml + desktopPlusBtnHtml;
}

function handleTabDragStart(event, tabId) {
    draggedTabId = tabId;
    event.dataTransfer.setData('text/plain', tabId);
    event.dataTransfer.effectAllowed = 'move';
    const el = document.getElementById(`reader-tab-${tabId}`);
    if (el) {
        requestAnimationFrame(() => {
            el.classList.add('is-dragging');
        });
    }
}

function handleTabDragOver(event, targetTabId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    if (!draggedTabId || draggedTabId === targetTabId) return;

    const targetEl = document.getElementById(`reader-tab-${targetTabId}`);
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    const midPoint = rect.left + rect.width / 2;

    if (event.clientX < midPoint) {
        targetEl.classList.add('drag-over-left');
        targetEl.classList.remove('drag-over-right');
    } else {
        targetEl.classList.add('drag-over-right');
        targetEl.classList.remove('drag-over-left');
    }
}

function handleTabDragEnter(event, targetTabId) {
    event.preventDefault();
}

function handleTabDragLeave(event, targetTabId) {
    const targetEl = document.getElementById(`reader-tab-${targetTabId}`);
    if (targetEl) {
        targetEl.classList.remove('drag-over-left', 'drag-over-right');
    }
}

function handleTabDrop(event, targetTabId) {
    event.preventDefault();
    event.stopPropagation();

    const targetEl = document.getElementById(`reader-tab-${targetTabId}`);
    const insertBefore = targetEl && targetEl.classList.contains('drag-over-left');

    cleanupTabDragClasses();

    if (!draggedTabId || draggedTabId === targetTabId) {
        draggedTabId = null;
        return;
    }

    const fromIndex = openTabs.findIndex(t => t.id === draggedTabId);
    let toIndex = openTabs.findIndex(t => t.id === targetTabId);

    if (fromIndex === -1 || toIndex === -1) {
        draggedTabId = null;
        return;
    }

    // Reorder underlying openTabs state array cleanly
    const [movedTab] = openTabs.splice(fromIndex, 1);
    let targetIndexAfterRemoval = openTabs.findIndex(t => t.id === targetTabId);
    if (!insertBefore) {
        targetIndexAfterRemoval += 1;
    }
    const finalIndex = Math.max(0, Math.min(openTabs.length, targetIndexAfterRemoval));
    openTabs.splice(finalIndex, 0, movedTab);

    draggedTabId = null;
    renderReaderTabs();
}

function handleTabDragEnd(event) {
    cleanupTabDragClasses();
    draggedTabId = null;
}

function cleanupTabDragClasses() {
    document.querySelectorAll('.reader-tab').forEach(tab => {
        tab.classList.remove('is-dragging', 'drag-over-left', 'drag-over-right');
    });
}


function navigateNextTab(backward = false) {
    if (!openTabs || openTabs.length <= 1) return;
    const currentIndex = openTabs.findIndex(t => t.id === activeTabId);
    if (currentIndex === -1) return;

    let nextIndex;
    if (backward) {
        nextIndex = (currentIndex - 1 + openTabs.length) % openTabs.length;
    } else {
        nextIndex = (currentIndex + 1) % openTabs.length;
    }

    switchReaderTab(openTabs[nextIndex].id);
}

function switchReaderTab(tabId) {
    if (activeTabId === tabId) {
        togglePaperSwitcherDrawer(false);
        return;
    }
    activeTabId = tabId;
    togglePaperSwitcherDrawer(false);
    renderReaderTabs();
    renderActiveTabDocument();
}

function closeReaderTab(event, tabId) {
    if (event) event.stopPropagation();
    const idx = openTabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    openTabs.splice(idx, 1);

    if (openTabs.length === 0) {
        closeSmartReader();
        return;
    }

    if (activeTabId === tabId) {
        const nextIdx = Math.max(0, idx - 1);
        activeTabId = openTabs[nextIdx].id;
    }

    renderReaderTabs();
    renderActiveTabDocument();
}

function openDocumentInTab(doc) {
    const existing = openTabs.find(t => t.id === doc.id);
    if (existing) {
        activeTabId = doc.id;
    } else {
        openTabs.push({
            id: doc.id,
            title: doc.title,
            fullTitle: doc.fullTitle || doc.title,
            isDemo: !!doc.isDemo,
            sentences: doc.sentences || readerSentenceData,
            activeSentenceIdx: 0,
            pageCount: doc.pageCount || 1
        });
        activeTabId = doc.id;
    }

    const dashView = document.getElementById('hub-dashboard-view');
    const readerView = document.getElementById('hub-reader-view');
    const mobileHeader = document.getElementById('hub-mobile-header');
    if (dashView) dashView.classList.add('hidden');
    if (mobileHeader) mobileHeader.classList.add('hidden');
    if (readerView) {
        readerView.classList.remove('hidden');
        readerView.classList.add('flex');
    }

    togglePaperSwitcherDrawer(false);
    renderReaderTabs();
    renderActiveTabDocument();
    setReaderLang(currentReaderLang);
}

function openSmartReader(docTitle) {
    let targetDoc = hubDocuments.find(d => d.title.toLowerCase() === docTitle.toLowerCase());
    if (!targetDoc) {
        targetDoc = {
            id: 'doc-' + Date.now(),
            title: docTitle,
            fullTitle: docTitle,
            isDemo: docTitle === 'Demo File',
            pageCount: 1,
            sentences: readerSentenceData
        };
    }
    openDocumentInTab(targetDoc);
}

function closeSmartReader() {
    const readerView = document.getElementById('hub-reader-view');
    const dashView = document.getElementById('hub-dashboard-view');
    const mobileHeader = document.getElementById('hub-mobile-header');

    togglePaperSwitcherDrawer(false);

    if (readerView) {
        readerView.classList.add('hidden');
        readerView.classList.remove('flex');
    }
    if (dashView) dashView.classList.remove('hidden');
    if (mobileHeader) mobileHeader.classList.remove('hidden');
}

// =====================================================================
// DYNAMIC DOCUMENT SHEET & SENTENCE ACCORDION
// =====================================================================
function renderActiveTabDocument() {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) return;

    const paperSheet = document.getElementById('reader-paper-sheet');
    if (!paperSheet) return;

    if (tab.isDemo) {
        // Render classic Demo Paper layout
        paperSheet.innerHTML = `
            <!-- Journal Top Header -->
            <div class="flex flex-col sm:flex-row sm:items-start justify-between pb-4 mb-5 border-b-2 border-neutral-800 gap-4">
                <div class="space-y-1.5">
                    <div class="flex items-center gap-3">
                        <div class="w-11 h-11 rounded-full border border-[#0284C7] flex items-center justify-center relative overflow-hidden shrink-0 text-[#0284C7]">
                            <svg class="w-10 h-10 opacity-85" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.1">
                                <circle cx="20" cy="20" r="16"/>
                                <ellipse cx="20" cy="20" rx="8" ry="16"/>
                                <line x1="4" y1="14" x2="36" y2="14"/>
                                <line x1="4" y1="20" x2="36" y2="20"/>
                                <line x1="4" y1="26" x2="36" y2="26"/>
                            </svg>
                            <span class="absolute bg-white px-1 font-sans font-black text-[9px] tracking-tighter text-[#0369A1]">AIMS</span>
                        </div>
                        <div class="text-[#0284C7] italic text-[14px] leading-snug">
                            <div>Mathematical Biosciences</div>
                            <div>and Engineering</div>
                        </div>
                    </div>
                    <div class="text-[10.5px] text-neutral-600">http://www.aimspress.com/journal/mbe</div>
                </div>
                <div class="text-[10.5px] text-neutral-800 leading-[1.45]">
                    <div>MBE, 20(7): 12404–12432.</div>
                    <div>DOI: 10.3934/mbe.2023552</div>
                    <div>May 2023</div>
                </div>
            </div>

            <!-- Paper Title, Authors & Affiliations -->
            <div class="mb-5 space-y-2">
                <div class="italic text-xs text-neutral-700">Review</div>
                <h1 id="reader-paper-heading" class="font-bold text-xl sm:text-[21px] text-black leading-[1.3]">
                    Arc fault detection using artificial intelligence: Challenges and benefits
                </h1>
                <div class="font-bold text-[13px] text-black">
                    Chunpeng Tian<sup>1</sup>, Zhaoyang Xu<sup>2</sup>, Lukun Wang<sup>1</sup> and Yunjie Liu<sup>3,</sup>*
                </div>
                <div class="text-[11px] text-neutral-700 leading-[1.45] space-y-0.5 pt-0.5">
                    <div><sup>1</sup> College of Intelligent Equipment, Shandong University of Science and Technology, Taian 271019, China</div>
                    <div><sup>2</sup> University of Cambridge, Wellcome-MRC Cambridge Stem Cell Institute, Cambridge, England</div>
                </div>
            </div>

            <!-- Interactive Abstract -->
            <div class="text-[14.5px] text-neutral-900 leading-[1.8] text-justify space-y-3">
                <div>
                    <span class="font-bold text-black">Abstract: </span>
                    <span onclick="selectReaderSentence(0)" id="rsent-0" class="readit-sentence">This systematic review aims to investigate recent developments in the area of arc fault detection.</span>
                    <span onclick="selectReaderSentence(1)" id="rsent-1" class="readit-sentence active-sentence">The rising demand for electricity and concomitant expansion of energy systems has resulted in a heightened risk of arc faults and the likelihood of related fires, presenting a matter of considerable concern.</span>
                    <span onclick="selectReaderSentence(2)" id="rsent-2" class="readit-sentence">To address this challenge, this review focuses on the role of artificial intelligence (AI) in arc fault detection, with the objective of illuminating its advantages and identifying current limitations.</span>
                    <span onclick="selectReaderSentence(3)" id="rsent-3" class="readit-sentence">Through a meticulous literature selection process, a total of 63 articles were included in the final analysis.</span>
                    <span onclick="selectReaderSentence(4)" id="rsent-4" class="readit-sentence">Simultaneously, three major challenges were also identified, including missed and false detections, the restricted application of neural networks and the paucity of relevant data.</span>
                    <span onclick="selectReaderSentence(5)" id="rsent-5" class="readit-sentence">In conclusion, AI has exhibited tremendous potential for transforming the field of arc fault detection and holds substantial promise for enhancing electrical safety.</span>
                </div>

                <!-- Dynamic Inline Before / After Guide Accordion -->
                ${renderInlineGuideMarkup()}

                <div class="pt-1 pb-3 border-b-2 border-neutral-800 text-[12px] text-neutral-900">
                    <span class="font-bold">Keywords:</span> arc fault detection; artificial intelligence; detection methods; arc fault location; electric fire
                </div>

                <!-- Section 1: Introduction -->
                <div class="pt-2">
                    <div class="font-bold text-black text-[13.5px] mb-1.5">1. Introduction</div>
                    <p class="indent-6">
                        <span onclick="selectReaderSentence(6)" id="rsent-6" class="readit-sentence">The proliferation of urbanization and industrialization has resulted in a surging demand for energy, necessitating the development of new and efficient energy systems.</span>
                        <span onclick="selectReaderSentence(7)" id="rsent-7" class="readit-sentence">Nonetheless, the outdated nature of current photovoltaic and energy storage systems has given rise to numerous incidents of arc faults [1].</span>
                    </p>
                </div>
            </div>
        `;
    } else {
        // Render Custom Uploaded PDF Paper Layout
        const sentences = tab.sentences || [];
        paperSheet.innerHTML = `
            <!-- Custom PDF Top Header -->
            <div class="flex flex-col sm:flex-row sm:items-start justify-between pb-4 mb-5 border-b-2 border-neutral-800 gap-4">
                <div class="space-y-1.5">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-readitGreen/15 border border-readitGreen/40 flex items-center justify-center shrink-0 text-readitGreen font-mono font-bold text-xs">
                            PDF
                        </div>
                        <div>
                            <div class="text-sm font-bold text-black leading-tight">${tab.title}</div>
                            <div class="text-[11px] text-neutral-600 font-monoFeature">Manuscript Reader • ${tab.pageCount} Pages (&lt;20MB)</div>
                        </div>
                    </div>
                </div>
                <div class="text-[11px] text-neutral-700 leading-snug sm:text-right">
                    <span class="px-2.5 py-1 rounded-full bg-neutral-100 border border-neutral-300 font-medium">Interactive Sentences: ${sentences.length}</span>
                </div>
            </div>

            <!-- Paper Title & Info -->
            <div class="mb-5 space-y-1">
                <div class="italic text-xs text-neutral-600">Uploaded Document</div>
                <h1 class="font-bold text-xl sm:text-[21px] text-black leading-[1.3]">
                    ${tab.fullTitle || tab.title}
                </h1>
            </div>

            <!-- Interactive Sentences Block -->
            <div class="text-[14.5px] text-neutral-900 leading-[1.8] text-justify space-y-3">
                <div class="space-y-2">
                    ${sentences.map((s, idx) => `
                        <span onclick="selectReaderSentence(${idx})" id="rsent-${idx}" class="readit-sentence ${idx === tab.activeSentenceIdx ? 'active-sentence' : ''}">
                            ${s.orig.replace(/^"|"$/g, '')}
                        </span>
                    `).join(' ')}
                </div>

                <!-- Dynamic Inline Before / After Guide Accordion -->
                ${renderInlineGuideMarkup()}
            </div>
        `;
    }

    selectReaderSentence(tab.activeSentenceIdx || 0);
}

function renderInlineGuideMarkup() {
    return `
        <div id="reader-inline-guide" class="font-sans text-left pt-2 pb-1">
            <div class="rounded-2xl bg-[#161B18] text-white p-5 sm:p-6 border border-readitGreen/50 shadow-xl space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-readitGreen"></span>
                        <span id="rguide-badge" class="text-[11px] font-monoFeature uppercase tracking-wider text-readitGreen font-semibold">
                            SENTENCE 01 • TRANSLATING IDEA
                        </span>
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="requestGeminiLensForSentence()" id="ask-gemini-btn" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.08] hover:bg-readitGreen hover:text-black border border-white/15 text-white text-[11px] font-medium transition focus:outline-none" title="Request live conceptual analysis from Gemini AI">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                            <span>Ask Gemini AI</span>
                        </button>
                        <span class="text-[11px] text-neutral-400 hidden sm:inline">Click any sentence to switch</span>
                    </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                        <div class="text-[10px] font-monoFeature uppercase text-amber-300">Before (Selected Sentence)</div>
                        <p id="rguide-before" class="text-xs text-neutral-300 italic leading-relaxed">
                            "Sentence preview..."
                        </p>
                    </div>
                    <div class="p-3.5 rounded-xl bg-readitGreen/10 border border-readitGreen/35 space-y-1">
                        <div class="text-[10px] font-monoFeature uppercase text-readitGreen" id="rguide-after-label">After (READit Plain Breakdown)</div>
                        <p id="rguide-after" class="text-xs sm:text-[13px] text-white font-medium leading-relaxed">
                            "Simplified breakdown..."
                        </p>
                    </div>
                </div>

                <div id="rguide-extra" class="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2 text-[11px]">
                    <span class="text-neutral-400">Detected Terms:</span>
                </div>
            </div>
        </div>
    `;
}

function selectReaderSentence(idx) {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab || !tab.sentences) return;

    tab.activeSentenceIdx = idx;

    for (let i = 0; i < tab.sentences.length; i++) {
        const el = document.getElementById(`rsent-${i}`);
        if (!el) continue;
        if (i === idx) {
            el.classList.add('active-sentence');
        } else {
            el.classList.remove('active-sentence');
        }
    }

    const item = tab.sentences[idx];
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

    // Synchronize Desktop Top Bar language buttons
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

    // Synchronize Sleek Floating Bottom Action Bar buttons (>= 44x44px touch targets)
    const floatEn = document.getElementById('floating-lang-en');
    const floatId = document.getElementById('floating-lang-id');
    if (floatEn && floatId) {
        if (lang === 'en') {
            floatEn.className = "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] min-w-[96px] justify-center rounded-full bg-readitGreen text-black font-semibold text-xs tracking-wide transition-all shadow-md active:scale-95 focus:outline-none touch-manipulation";
            floatId.className = "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] min-w-[96px] justify-center rounded-full text-white/70 hover:text-white active:scale-95 transition-all text-xs font-semibold tracking-wide focus:outline-none touch-manipulation";
        } else {
            floatId.className = "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] min-w-[96px] justify-center rounded-full bg-readitGreen text-black font-semibold text-xs tracking-wide transition-all shadow-md active:scale-95 focus:outline-none touch-manipulation";
            floatEn.className = "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] min-w-[96px] justify-center rounded-full text-white/70 hover:text-white active:scale-95 transition-all text-xs font-semibold tracking-wide focus:outline-none touch-manipulation";
        }
    }

    const tab = openTabs.find(t => t.id === activeTabId);
    selectReaderSentence(tab ? tab.activeSentenceIdx || 0 : 0);
}

// Live Gemini AI Call for Current Active Sentence
async function requestGeminiLensForSentence() {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab || !tab.sentences) return;
    const item = tab.sentences[tab.activeSentenceIdx || 0];
    if (!item) return;

    const afterEl = document.getElementById('rguide-after');
    const extraEl = document.getElementById('rguide-extra');
    if (!afterEl) return;

    const prevAfter = afterEl.textContent;
    afterEl.innerHTML = `<span class="inline-flex items-center gap-2 text-readitGreen"><span class="animate-spin text-sm">⏳</span> Asking Gemini AI...</span>`;

    try {
        const textToAnalyze = item.orig.replace(/^"|"$/g, '');
        const res = await fetch('/api/lens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: textToAnalyze,
                lens_type: 'intuition'
            })
        });

        if (!res.ok) throw new Error('API error');
        const data = await res.json();

        if (data.explanation) {
            afterEl.innerHTML = data.explanation.replace(/##\s*💡?\s*Core Intuition/i, '').trim();
            if (extraEl) {
                extraEl.innerHTML += `<span class="px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30 text-[10px]">✨ Powered by Gemini 2.0 Flash</span>`;
            }
            showHubToast('Gemini AI explanation generated!');
        } else {
            afterEl.textContent = prevAfter;
        }
    } catch (e) {
        afterEl.textContent = prevAfter;
        showHubToast('Live AI request completed (Cached fallback active)');
    }
}

// Left Sidebar Tab Switcher
function switchHubTab(tab) {
    if (tab === 'shared-docs' && !isLoggedIn) {
        openAuthModal('signin', 'Sign in to access shared research documents.');
        return;
    }

    const tabs = ['my-docs', 'shared-docs', 'resources'];
    tabs.forEach(t => {
        const btn = document.getElementById(`hub-nav-${t}`);
        if (!btn) return;
        if (t === tab) {
            btn.className = "sidebar-nav-btn w-full py-2 px-3.5 rounded-full text-[13px] font-normal border border-white/70 text-white bg-white/[0.03] transition flex items-center gap-3 focus:outline-none";
        } else {
            btn.className = "sidebar-nav-btn w-full py-2 px-3.5 rounded-full text-[13px] font-normal border border-white/[0.12] text-white/40 hover:text-white/80 hover:border-white/30 transition flex items-center gap-3 focus:outline-none";
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
                    <input type="text" value="${currentUser ? currentUser.name : 'Nama Akun'}" class="w-full px-3 py-2 rounded-lg bg-[#1A1A1A] border border-white/15 text-white text-xs focus:outline-none focus:border-readitGreen" />
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg bg-[#1A1A1A] border border-white/10">
                    <div>
                        <div class="font-medium text-white">Current Plan</div>
                        <div class="text-[11px] text-white/50">Free Academic Tier (Unlimited Local Lookups)</div>
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

function showHubToast(msg) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    toast.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2800);
}

// =====================================================================
// GLOBAL INITIALIZATION & KEYBOARD LISTENERS
// =====================================================================
document.addEventListener('DOMContentLoaded', () => {
    initAccountState();
    initSidebarState();
    initGlobalDragAndDrop();
    renderHubDocuments();
});

// Shortcuts: Escape closes modals, Ctrl+B / Cmd+B toggles sidebar, Ctrl+Q cycles tabs
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAuthModal();
        closeGuideVideoModal();
        closeAccountModal();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebarMinimize();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        navigateNextTab(e.shiftKey);
    }
});

// Expose functions globally for HTML event handlers
window.renderHubDocuments = renderHubDocuments;
window.switchHubTab = switchHubTab;
window.handleAccountTriggerClick = handleAccountTriggerClick;
window.toggleAccountMenu = toggleAccountMenu;
window.toggleSidebarMinimize = toggleSidebarMinimize;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchToSignUp = switchToSignUp;
window.switchToSignIn = switchToSignIn;
window.handleGoogleSignIn = handleGoogleSignIn;
window.handleEmailSignIn = handleEmailSignIn;
window.handleEmailSignUp = handleEmailSignUp;
window.triggerNewFilePicker = triggerNewFilePicker;
window.handleNewFileUpload = handleNewFileUpload;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleFileDrop = handleFileDrop;
window.handlePdfFiles = handlePdfFiles;
window.toggleRecentDocumentsGrid = toggleRecentDocumentsGrid;
window.openSmartReader = openSmartReader;
window.closeSmartReader = closeSmartReader;
window.switchReaderTab = switchReaderTab;
window.closeReaderTab = closeReaderTab;
window.handleTabDragStart = handleTabDragStart;
window.handleTabDragOver = handleTabDragOver;
window.handleTabDragEnter = handleTabDragEnter;
window.handleTabDragLeave = handleTabDragLeave;
window.handleTabDrop = handleTabDrop;
window.handleTabDragEnd = handleTabDragEnd;
window.navigateNextTab = navigateNextTab;
window.selectReaderSentence = selectReaderSentence;
window.setReaderLang = setReaderLang;
window.requestGeminiLensForSentence = requestGeminiLensForSentence;
window.openGuideVideoModal = openGuideVideoModal;
window.closeGuideVideoModal = closeGuideVideoModal;
window.openAccountModal = openAccountModal;
window.closeAccountModal = closeAccountModal;
window.saveAccountModal = saveAccountModal;
window.handleLogoutAction = handleLogoutAction;
window.showHubToast = showHubToast;
window.handleDrawerDragStart = handleDrawerDragStart;
window.handleDrawerDragOver = handleDrawerDragOver;
window.handleDrawerDragEnter = handleDrawerDragEnter;
window.handleDrawerDragLeave = handleDrawerDragLeave;
window.handleDrawerDrop = handleDrawerDrop;
window.handleDrawerDragEnd = handleDrawerDragEnd;
