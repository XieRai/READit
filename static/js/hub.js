/**
 * READit Document Hub Controller (hub.js)
 * Clean, Unified PDF.js Reading Engine with Real-Time Companion Inspector
 * Features:
 *  - Zero-backend client-side PDF import via PDF.js with Canvas + interactive TextLayer
 *  - Floating Action Bar near selection (Idea, Quick Ref, conditional Citation)
 *  - Companion Inspector Card beside paper with focused drawers for cognitive load reduction
 *  - Strict Citation availability (only visible when [1], (Author et al), or superscripts exist)
 *  - Anti-hallucination paper context indexing (/api/context/prebake) on load
 *  - Persistent card beside paper until page change or new feature click
 *  - Natural language switching (Simple EN / Bahasa ID) with seamless re-evaluation
 *  - Multi-Tab Reading System with drag-and-drop reordering
 *  - Frosted Auth Modal with Supabase / Google Identity Services
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
let supabaseClient = null;

function getSupabase() {
    if (supabaseClient) return supabaseClient;
    const url = (window.ENV && window.ENV.SUPABASE_URL) || 'https://ecnbupsjpwesvokwszpe.supabase.co';
    const key = (window.ENV && window.ENV.SUPABASE_ANON_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjbmJ1cHNqcHdlc3Zva3dzenBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMzc4MDksImV4cCI6MjEwNzcxMzgwOX0.IwOoWQq4M78LXNd7OuuHFydf0xnz75N4SpDSqYVxAuo';
    if (window.supabase && url && key) {
        supabaseClient = window.supabase.createClient(url, key);
    }
    return supabaseClient;
}

function applySupabaseUser(user) {
    if (!user) return;
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Researcher');
    currentUser = {
        id: user.id,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        email: user.email || '',
        avatarUrl: meta.avatar_url || meta.picture || null,
        plan: 'Free plan'
    };
    isLoggedIn = true;
    localStorage.setItem('readit_user', JSON.stringify(currentUser));
    updateAccountUI();
}

function loadFallbackUser() {
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
}

async function initAccountState() {
    const sb = getSupabase();
    if (sb) {
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (session && session.user) {
                applySupabaseUser(session.user);
            } else {
                loadFallbackUser();
            }

            sb.auth.onAuthStateChange((event, session) => {
                if (session && session.user) {
                    applySupabaseUser(session.user);
                    if (event === 'SIGNED_IN') {
                        showHubToast(`Welcome, ${currentUser.name}`);
                        triggerPendingUploadsIfAny();
                    }
                } else if (event === 'SIGNED_OUT') {
                    currentUser = null;
                    isLoggedIn = false;
                    localStorage.removeItem('readit_user');
                    updateAccountUI();
                }
            });
        } catch (err) {
            console.warn('Supabase auth init:', err);
            loadFallbackUser();
        }
    } else {
        loadFallbackUser();
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
            if (currentUser.avatarUrl) {
                avatar.className = "w-7 h-7 rounded-full overflow-hidden border border-white/20 shrink-0";
                avatar.innerHTML = `<img src="${currentUser.avatarUrl}" alt="${currentUser.name}" class="w-full h-full object-cover">`;
            } else {
                avatar.className = "w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 border border-white/20 flex items-center justify-center text-xs text-white font-bold shrink-0";
                avatar.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
            }
        }
        if (mobileAvatar) {
            if (currentUser.avatarUrl) {
                mobileAvatar.className = "w-8 h-8 rounded-full overflow-hidden border border-white/20 shrink-0";
                mobileAvatar.innerHTML = `<img src="${currentUser.avatarUrl}" alt="${currentUser.name}" class="w-full h-full object-cover">`;
            } else {
                mobileAvatar.className = "w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 border border-white/20 flex items-center justify-center text-xs text-white font-bold shrink-0";
                mobileAvatar.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
            }
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

function handleAccountTriggerClick() {
    if (isLoggedIn) {
        toggleAccountMenu();
    } else {
        openAuthModal('signin');
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
    if (drawer) {
        if (isAccountDrawerOpen) {
            drawer.classList.add('open');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
            drawer.classList.remove('open');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
    }
}

function toggleSidebarMinimize() {
    isSidebarMinimized = !isSidebarMinimized;
    const sidebar = document.getElementById('hub-sidebar');
    const toggleIcon = document.getElementById('sidebar-toggle-icon');
    if (!sidebar) return;

    if (isSidebarMinimized) {
        sidebar.classList.remove('md:w-[240px]');
        sidebar.classList.add('sidebar-minimized');
        if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
    } else {
        sidebar.classList.remove('sidebar-minimized');
        sidebar.classList.add('md:w-[240px]');
        if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
    }
}

function toggleMobileSidebar(openState) {
    const sidebar = document.getElementById('hub-sidebar');
    const backdrop = document.getElementById('hub-mobile-sidebar-backdrop');
    if (!sidebar) return;

    const shouldOpen = openState !== undefined ? openState : sidebar.classList.contains('-translate-x-full');

    if (shouldOpen) {
        sidebar.classList.remove('-translate-x-full');
        sidebar.classList.add('translate-x-0');
        if (backdrop) {
            backdrop.classList.remove('hidden', 'pointer-events-none');
            requestAnimationFrame(() => {
                backdrop.classList.remove('opacity-0');
                backdrop.classList.add('opacity-100');
            });
        }
    } else {
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
        if (backdrop) {
            backdrop.classList.remove('opacity-100');
            backdrop.classList.add('opacity-0');
            setTimeout(() => {
                backdrop.classList.add('hidden', 'pointer-events-none');
            }, 300);
        }
    }
}

function initSidebarState() {
    const sidebar = document.getElementById('hub-sidebar');
    if (sidebar && !sidebar.classList.contains('sidebar-minimized')) {
        sidebar.classList.add('md:w-[240px]');
    }
}

function openAuthModal(mode = 'signin', reasonText = null) {
    const modal = document.getElementById('hub-auth-modal');
    const hint = document.getElementById('auth-modal-hint');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (hint) {
        if (reasonText) {
            hint.textContent = reasonText;
            hint.classList.remove('hidden');
        } else {
            hint.classList.add('hidden');
        }
    }

    if (mode === 'signup') {
        switchToSignUp();
    } else {
        switchToSignIn();
    }
}

function closeAuthModal() {
    const modal = document.getElementById('hub-auth-modal');
    if (modal) modal.classList.add('hidden');
}

function switchToSignUp() {
    const track = document.getElementById('auth-cards-track');
    if (track) track.style.transform = 'translateX(-50%)';
}

function switchToSignIn() {
    const track = document.getElementById('auth-cards-track');
    if (track) track.style.transform = 'translateX(0%)';
}

function triggerPendingUploadsIfAny() {
    if (pendingUploadFiles && pendingUploadFiles.length > 0) {
        const files = [...pendingUploadFiles];
        pendingUploadFiles = [];
        handlePdfFiles(files);
    }
}

function initGoogleIdentity() {
    const clientId = (window.ENV && window.ENV.GOOGLE_CLIENT_ID) || '922432658863-m5a3o71dpsj4p45k1n359fptgh89j31p.apps.googleusercontent.com';
    if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
    try {
        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
        });
    } catch (e) {
        console.warn('Google Identity initialization error:', e);
    }
}

async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;
    const sb = getSupabase();
    if (sb) {
        showHubToast('Signing in with Google...');
        try {
            const { data, error } = await sb.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential
            });
            if (error) {
                console.warn('signInWithIdToken note:', error);
                showHubToast(`Google sign-in: ${error.message}`);
                return;
            }
            if (data && data.user) {
                applySupabaseUser(data.user);
                closeAuthModal();
                showHubToast(`Welcome, ${currentUser.name}!`);
                triggerPendingUploadsIfAny();
            }
        } catch (err) {
            console.error('Google ID token authentication error:', err);
        }
    }
}

async function handleGoogleSignIn() {
    const sb = getSupabase();
    if (!sb) {
        fallbackDemoGoogleLogin();
        return;
    }

    if (window.google && window.google.accounts && window.google.accounts.id) {
        initGoogleIdentity();
        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                fallbackToOAuthRedirect(sb);
            }
        });
        return;
    }

    fallbackToOAuthRedirect(sb);
}

async function fallbackToOAuthRedirect(sb) {
    try {
        showHubToast('Redirecting to Google...');
        const { data, error } = await sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/hub',
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });
        if (error) {
            showHubToast(`Google Auth Error: ${error.message}`);
        }
    } catch (err) {
        console.error('OAuth redirect error:', err);
    }
}

function fallbackDemoGoogleLogin() {
    currentUser = {
        name: 'Demo Researcher',
        email: 'researcher@readit.ai',
        plan: 'Free plan'
    };
    isLoggedIn = true;
    localStorage.setItem('readit_user', JSON.stringify(currentUser));
    updateAccountUI();
    closeAuthModal();
    showHubToast('Signed in as Demo Researcher');
    triggerPendingUploadsIfAny();
}

async function handleEmailSignIn(event) {
    if (event) event.preventDefault();
    const emailInput = document.getElementById('signin-email-input');
    const passwordInput = document.getElementById('signin-password-input');
    const email = (emailInput && emailInput.value ? emailInput.value : '').trim();
    const password = (passwordInput && passwordInput.value ? passwordInput.value : '').trim();

    if (!email || !password) {
        showHubToast('Please enter both email and password');
        return;
    }

    const sb = getSupabase();
    if (sb) {
        try {
            showHubToast('Signing in...');
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) {
                showHubToast(`Sign in failed: ${error.message}`);
                return;
            }
            if (data && data.user) {
                applySupabaseUser(data.user);
                closeAuthModal();
                showHubToast(`Welcome back, ${currentUser.name}`);
                triggerPendingUploadsIfAny();
                return;
            }
        } catch (err) {
            console.warn('Supabase signin error:', err);
        }
    }

    const namePart = email.split('@')[0] || 'Researcher';
    currentUser = {
        name: namePart.charAt(0).toUpperCase() + namePart.slice(1),
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

async function handleEmailSignUp(event) {
    if (event) event.preventDefault();
    const nameInput = document.getElementById('signup-name-input');
    const emailInput = document.getElementById('signup-email-input');
    const passwordInput = document.getElementById('signup-password-input');
    const name = (nameInput && nameInput.value ? nameInput.value : 'Researcher').trim();
    const email = (emailInput && emailInput.value ? emailInput.value : '').trim();
    const password = (passwordInput && passwordInput.value ? passwordInput.value : '').trim();

    if (!email || !password) {
        showHubToast('Please fill in email and password');
        return;
    }

    const sb = getSupabase();
    if (sb) {
        try {
            showHubToast('Creating account...');
            const { data, error } = await sb.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: name }
                }
            });
            if (error) {
                showHubToast(`Sign up failed: ${error.message}`);
                return;
            }
            if (data && data.user) {
                applySupabaseUser(data.user);
                closeAuthModal();
                showHubToast(`Account created! Welcome, ${currentUser.name}`);
                triggerPendingUploadsIfAny();
                return;
            }
        } catch (err) {
            console.warn('Supabase signup error:', err);
        }
    }

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

async function handleLogoutAction() {
    const sb = getSupabase();
    if (sb) {
        try {
            await sb.auth.signOut();
        } catch (err) {
            console.warn('Sign-out error:', err);
        }
    }
    isLoggedIn = false;
    currentUser = null;
    localStorage.removeItem('readit_user');
    updateAccountUI();
    showHubToast('Signed out of READit');
}

// =====================================================================
// RECENT DOCUMENTS LIST & MULTI-TAB SYSTEM STATE (CLEAN EMPTY INITIAL STATE)
// =====================================================================
let hubDocuments = [];
let openTabs = [];
let activeTabId = null;
let isRecentGridExpanded = true;
let currentReaderLang = 'en';

function renderHubDocuments() {
    const listContainer = document.getElementById('hub-dynamic-docs-list');
    if (!listContainer) return;

    if (hubDocuments.length === 0) {
        listContainer.innerHTML = '';
        return;
    }

    listContainer.innerHTML = hubDocuments.map((doc) => `
        <div class="flex flex-col items-center w-full group cursor-pointer touch-manipulation" onclick="openSmartReader('${doc.id}')">
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
                        <strong>Document Ready:</strong> Real-time PDF rendering with interactive lexical deconstruction and anti-hallucination paper context.
                    </div>
                </div>

                <div class="border-t border-neutral-800 pt-1 text-[3.8px] sm:text-[4.8px] text-neutral-700 font-serifPaper truncate">
                    <strong>Format:</strong> PDF • Smart Reader Enabled
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
        showHubToast('Opened in Guest Mode — Sign in anytime to sync to cloud');
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
// DIRECT CLIENT-SIDE PDF IMPORT & OPENING (NO BACKEND PARSE)
// =====================================================================
function processAndOpenPdf(file) {
    const cleanTitle = file.name.replace(/\.pdf$/i, '');
    const fileUrl = URL.createObjectURL(file);
    const docId = 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

    const newDoc = {
        id: docId,
        title: cleanTitle.length > 36 ? cleanTitle.substring(0, 33) + '...' : cleanTitle,
        fullTitle: file.name,
        fileUrl: fileUrl,
        file: file,
        pageCount: 1
    };

    hubDocuments.unshift(newDoc);
    renderHubDocuments();

    openDocumentInTab(newDoc);
    showHubToast(`Loaded "${newDoc.title}" in Smart Reader`);
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

// Drawer Papers List (Mobile View with Drag & Drop Reordering)
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
                
                <!-- Drag Handle -->
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
                        <div class="text-[10px] text-white/50">${tab.pageCount || 1} Pages • PDF Document</div>
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

    list.querySelectorAll('.drawer-drag-handle').forEach(handle => {
        handle.ontouchstart = (e) => {
            const item = handle.closest('.drawer-paper-item');
            if (!item) return;
            drawerTouchDragId = item.getAttribute('data-tab-id');
            item.classList.add('is-touch-dragging');
        };

        handle.ontouchmove = (e) => {
            if (!drawerTouchDragId) return;
            e.preventDefault();
            const touch = e.touches[0];
            const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!targetElement) return;

            const targetItem = targetElement.closest('.drawer-paper-item');
            cleanupDrawerDragClasses();

            if (targetItem) {
                targetItem.classList.add('is-touch-dragging');
                const targetRect = targetItem.getBoundingClientRect();
                const midPoint = targetRect.top + targetRect.height / 2;
                drawerTouchTargetId = targetItem.getAttribute('data-tab-id');
                drawerTouchInsertBefore = touch.clientY < midPoint;

                if (drawerTouchInsertBefore) {
                    targetItem.classList.add('drag-over-top');
                } else {
                    targetItem.classList.add('drag-over-bottom');
                }
            }
        };

        handle.ontouchend = () => {
            if (drawerTouchDragId && drawerTouchTargetId && drawerTouchDragId !== drawerTouchTargetId) {
                const fromIdx = openTabs.findIndex(t => t.id === drawerTouchDragId);
                const toIdx = openTabs.findIndex(t => t.id === drawerTouchTargetId);
                if (fromIdx !== -1 && toIdx !== -1) {
                    const [movedTab] = openTabs.splice(fromIdx, 1);
                    let targetIdx = openTabs.findIndex(t => t.id === drawerTouchTargetId);
                    if (!drawerTouchInsertBefore) targetIdx += 1;
                    targetIdx = Math.max(0, Math.min(openTabs.length, targetIdx));
                    openTabs.splice(targetIdx, 0, movedTab);
                    renderReaderTabs();
                }
            }
            cleanupDrawerDragClasses();
            drawerTouchDragId = null;
            drawerTouchTargetId = null;
        };
    });
}

function handleDrawerDragStart(event, tabId) {
    drawerDraggedTabId = tabId;
    event.dataTransfer.setData('text/plain', tabId);
    event.dataTransfer.effectAllowed = 'move';
}

function handleDrawerDragOver(event, targetTabId) {
    event.preventDefault();
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
    if (targetEl) targetEl.classList.remove('drag-over-top', 'drag-over-bottom');
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
    let toIdx = openTabs.findIndex(t => t.id === targetTabId);

    if (fromIdx !== -1 && toIdx !== -1) {
        const [movedTab] = openTabs.splice(fromIdx, 1);
        let targetIdx = openTabs.findIndex(t => t.id === targetTabId);
        if (!insertBefore) targetIdx += 1;
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

    renderDrawerPapersList();

    const tabsBar = document.getElementById('reader-tabs-bar');
    if (!tabsBar) return;

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

    const [movedTab] = openTabs.splice(fromIndex, 1);
    let targetIndexAfterRemoval = openTabs.findIndex(t => t.id === targetTabId);
    if (!insertBefore) targetIndexAfterRemoval += 1;
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
        activeTabId = null;
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
            fileUrl: doc.fileUrl,
            file: doc.file,
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

function openSmartReader(docIdentifier) {
    let targetDoc = hubDocuments.find(d => d.id === docIdentifier || d.title.toLowerCase() === docIdentifier.toLowerCase());
    if (!targetDoc) return;
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

function renderActiveTabDocument() {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.classList.remove('hidden');
        const pdfContainer = document.getElementById('pdf-page-container');
        if (pdfContainer) pdfContainer.classList.add('hidden');
        const pageNav = document.getElementById('page-nav');
        if (pageNav) pageNav.classList.add('hidden');
        resetInspector();
        return;
    }

    if (tab.fileUrl) {
        loadPdfDocument(tab.fileUrl);
    }
}

// =====================================================================
// PDF.JS RENDERING ENGINE & ANTI-HALLUCINATION CONTEXT
// =====================================================================
window.READIT_SYSTEM = {
    selectedText: null,
    pendingSelection: null,
    activeCard: false,
    activeCardData: null,
    paperContext: null,
    currentPage: 1,
    currentLang: 'en',
    activeFeature: 'translating_idea',
    featureCache: {},
    copyPayloads: {}
};

let currentPdf = null;
let currentPageNum = 1;
let totalPages = 1;
let currentRenderTask = null;
let currentTextLayerTask = null;
let resizeDebounceTimer = null;

async function prebakePaperContext(pdfDoc) {
    const pill = document.getElementById('paper-context-pill');
    const dot = document.getElementById('context-status-dot');
    const label = document.getElementById('context-status-label');
    
    if (pill) {
        pill.classList.remove('hidden');
        pill.classList.add('flex');
    }
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0';
    if (label) label.textContent = 'Context: Indexing...';

    try {
        let extractedText = '';
        const maxPagesToRead = Math.min(pdfDoc.numPages, 4);
        for (let i = 1; i <= maxPagesToRead; i++) {
            const page = await pdfDoc.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            extractedText += `\n--- Page ${i} ---\n` + pageText;
            if (extractedText.length > 12000) break;
        }

        const activeTab = openTabs.find(t => t.id === activeTabId);
        const tabTitle = activeTab ? activeTab.title : '';

        const resp = await fetch('/api/context/prebake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: tabTitle,
                content: extractedText.slice(0, 12000)
            })
        });

        if (resp.ok) {
            const ctx = await resp.json();
            window.READIT_SYSTEM.paperContext = ctx;
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-readitGreen shrink-0';
            if (label) {
                label.textContent = 'Context: Ready';
                if (pill) {
                    pill.title = `Domain: ${ctx.domain || 'N/A'}\nCore Problem: ${ctx.core_problem || 'N/A'}\nMethod: ${ctx.core_method || 'N/A'}`;
                }
            }
        }
    } catch (e) {
        console.warn('Paper context prebake failed, fallback active:', e);
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-white/40 shrink-0';
        if (label) label.textContent = 'Context: Local';
    }
}

async function loadPdfDocument(urlOrData) {
    try {
        const loadingTask = pdfjsLib.getDocument(urlOrData);
        currentPdf = await loadingTask.promise;
        totalPages = currentPdf.numPages;
        currentPageNum = 1;

        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (activeTab) {
            activeTab.pageCount = totalPages;
            renderReaderTabs();
        }

        const pageNav = document.getElementById('page-nav');
        if (pageNav) {
            pageNav.classList.remove('hidden');
            pageNav.classList.add('flex');
        }

        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.classList.add('hidden');
        const pageContainer = document.getElementById('pdf-page-container');
        if (pageContainer) pageContainer.classList.remove('hidden');

        // Background context indexing
        prebakePaperContext(currentPdf);

        await renderPage(currentPageNum);
    } catch (err) {
        console.error('Failed to load PDF:', err);
        showHubToast('Could not open PDF document: ' + err.message);
    }
}

async function renderPage(pageNum) {
    if (!currentPdf) return;

    if (currentRenderTask) {
        try { currentRenderTask.cancel(); } catch (e) {}
        currentRenderTask = null;
    }
    if (currentTextLayerTask) {
        try { currentTextLayerTask.cancel(); } catch (e) {}
        currentTextLayerTask = null;
    }

    const pageLabel = document.getElementById('page-label');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    if (pageLabel) pageLabel.textContent = `${pageNum} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = pageNum <= 1;
    if (btnNext) btnNext.disabled = pageNum >= totalPages;

    const inspectorMeta = document.getElementById('inspector-meta');
    if (inspectorMeta) inspectorMeta.textContent = `Page ${pageNum} / ${totalPages}`;

    window.READIT_SYSTEM.currentPage = pageNum;
    resetInspector();

    const page = await currentPdf.getPage(pageNum);
    const canvas = document.getElementById('pdf-canvas');
    const textLayerDiv = document.getElementById('text-layer');
    const pageContainer = document.getElementById('pdf-page-container');
    const paperCard = document.getElementById('paper-card');
    const viewportContainer = document.getElementById('reader-viewport');
    if (!canvas || !textLayerDiv || !pageContainer || !paperCard || !viewportContainer) return;

    const isLargeScreen = window.innerWidth >= 1024;
    const inspectorWidth = isLargeScreen ? 380 : 0;
    const gap = isLargeScreen ? 24 : 0;
    const padding = window.innerWidth < 640 ? 32 : 64;
    const availableWidth = viewportContainer.clientWidth - inspectorWidth - gap - padding;
    const targetWidth = Math.min(820, Math.max(320, availableWidth));
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const layoutScale = targetWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: layoutScale });

    const widthPx = Math.floor(viewport.width);
    const heightPx = Math.floor(viewport.height);

    pageContainer.style.width = widthPx + 'px';
    pageContainer.style.height = heightPx + 'px';
    paperCard.style.width = widthPx + 'px';
    paperCard.style.minHeight = heightPx + 'px';

    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(widthPx * outputScale);
    canvas.height = Math.floor(heightPx * outputScale);
    canvas.style.width = widthPx + 'px';
    canvas.style.height = heightPx + 'px';

    const ctx = canvas.getContext('2d');
    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

    try {
        currentRenderTask = page.render({
            canvasContext: ctx,
            viewport: viewport,
            transform: transform
        });
        await currentRenderTask.promise;
    } catch (err) {
        if (err?.name === 'RenderingCancelledException') return;
        console.error('Canvas render error:', err);
        return;
    } finally {
        currentRenderTask = null;
    }

    try {
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = widthPx + 'px';
        textLayerDiv.style.height = heightPx + 'px';
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);

        const textContent = await page.getTextContent();
        currentTextLayerTask = pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport
        });
        await currentTextLayerTask.promise;
    } catch (err) {
        if (err?.name === 'AbortException') return;
        console.error('TextLayer render error:', err);
    } finally {
        currentTextLayerTask = null;
    }
}

function changePage(delta) {
    const next = currentPageNum + delta;
    if (next >= 1 && next <= totalPages) {
        currentPageNum = next;
        hideFloatingActions();
        resetInspector();
        renderPage(currentPageNum);
    }
}

// =====================================================================
// CITATION DETECTION ENGINE
// Detects:
// 1. Bracketed numbers: [1], [2, 3], [1-4], [14, 15]
// 2. Author citations: (Wang et al), (Wang et al., 2021), (Smith, 2020), [Wang et al., 2021]
// 3. Superscripts: <sup>1</sup>, <sup>[1]</sup> or unicode ¹, ², ³, ⁴ etc.
// =====================================================================
function detectCitations(text) {
    if (!text || typeof text !== 'string') return [];
    
    const numberedRegex = /\[\s*\d+(?:[\s,\-–—]+\d+)*\s*\]/g;
    const authorYearRegex = /\([A-Z][a-zA-Z\s\.\-&]+,?\s*(?:19|20)\d{2}[a-z]?\)/g;
    const bracketAuthorYearRegex = /\[[A-Z][a-zA-Z\s\.\-&]+(?:19|20)\d{2}[a-z]?\]/g;
    const unicodeSupRegex = /[\u00B9\u00B2\u00B3\u2070\u2074-\u2079]+/g;

    const matches = [
        ...(text.match(numberedRegex) || []),
        ...(text.match(authorYearRegex) || []),
        ...(text.match(bracketAuthorYearRegex) || []),
        ...(text.match(unicodeSupRegex) || [])
    ];
    
    return [...new Set(matches)];
}

function detectCitationsInText(text, html) {
    const fromText = detectCitations(text);
    if (!html) return fromText;
    const supHtmlRegex = /<sup>\s*(?:\[?\s*\d+(?:[\s,\-–—]+\d+)*\s*\]?|[a-z]+)\s*<\/sup>/gi;
    const fromHtml = typeof html === 'string' ? (html.match(supHtmlRegex) || []) : [];
    return [...new Set([...fromText, ...fromHtml])];
}

// =====================================================================
// FLOATING ACTIONS BAR (Near Text Selection)
// =====================================================================
function positionFloatingActions(hasCitations) {
    const bar = document.getElementById('floating-actions-bar');
    if (!bar) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        hideFloatingActions();
        return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        hideFloatingActions();
        return;
    }

    // Strictly toggle Easy Citation button visibility based on whether citations exist
    const citBtn = document.getElementById('floating-btn-citation');
    if (citBtn) {
        if (hasCitations) {
            citBtn.classList.remove('hidden');
            citBtn.classList.add('flex');
        } else {
            citBtn.classList.add('hidden');
            citBtn.classList.remove('flex');
        }
    }

    bar.classList.remove('hidden');
    bar.classList.add('flex');

    const barWidth = bar.offsetWidth || (hasCitations ? 260 : 180);
    const barHeight = bar.offsetHeight || 36;

    let top = rect.top - barHeight - 8;
    let left = rect.left + (rect.width / 2) - (barWidth / 2);

    if (top < 60) {
        top = rect.bottom + 8;
    }
    left = Math.max(12, Math.min(window.innerWidth - barWidth - 12, left));

    bar.style.top = `${Math.round(top)}px`;
    bar.style.left = `${Math.round(left)}px`;
}

function hideFloatingActions() {
    const bar = document.getElementById('floating-actions-bar');
    if (bar) {
        bar.classList.add('hidden');
        bar.classList.remove('flex');
    }
}

async function handleFloatingFeatureClick(feature, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const data = window.READIT_SYSTEM.pendingSelection;
    if (!data || !data.isValid || !data.text) return;

    hideFloatingActions();

    // Lock this card as the persistent active card beside paper
    window.READIT_SYSTEM.activeCard = true;
    window.READIT_SYSTEM.activeCardData = data;
    window.READIT_SYSTEM.selectedText = data.text;
    window.READIT_SYSTEM.featureCache = {};

    updateInspector(data);
    switchFeatureDrawer(feature);
}

// =====================================================================
// REAL-TIME TEXT SELECTION DETECTION & RULES
// =====================================================================
function handleSelectionChange() {
    const selection = window.getSelection();
    if (!selection) return;

    const paperCard = document.getElementById('paper-card');
    if (!paperCard) return;

    if (selection.rangeCount === 0 || selection.isCollapsed) {
        hideFloatingActions();
        window.READIT_SYSTEM.pendingSelection = null;
        // PERSISTENCE RULE: If an active card is already displayed, DO NOT reset inspector!
        if (!window.READIT_SYSTEM.activeCard) {
            resetInspector();
        }
        return;
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;

    const isInsidePaper = (
        (anchorNode && paperCard.contains(anchorNode)) ||
        (focusNode && paperCard.contains(focusNode))
    );

    if (!isInsidePaper) {
        hideFloatingActions();
        return;
    }

    const rawText = selection.toString();
    const cleanText = rawText
        .replace(/([A-Za-z]+)-\s+([A-Za-z]+)/g, '$1$2')
        .replace(/\r?\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (cleanText.length === 0) {
        hideFloatingActions();
        window.READIT_SYSTEM.pendingSelection = null;
        if (!window.READIT_SYSTEM.activeCard) {
            resetInspector();
        }
        return;
    }

    const validation = validateSelection(cleanText);
    const words = cleanText.split(/\s+/).filter(Boolean);
    const detectedCitations = detectCitations(cleanText);

    const selectionData = {
        text: cleanText,
        rawText: rawText,
        page: currentPageNum,
        wordCount: words.length,
        charCount: cleanText.length,
        sentenceCount: validation.sentenceCount,
        isValid: validation.isValid,
        validationReason: validation.reason,
        citations: detectedCitations,
        hasCitations: detectedCitations.length > 0,
        timestamp: Date.now()
    };

    window.READIT_SYSTEM.pendingSelection = selectionData;

    if (validation.isValid) {
        positionFloatingActions(selectionData.hasCitations);
    } else {
        hideFloatingActions();
    }
}

function countSentences(text) {
    if (!text || text.trim().length === 0) return 0;
    
    let protectedText = text;
    const abbrevs = [
        'Fig', 'Figs', 'Figure', 'Figures', 'Ref', 'Refs', 'Reference', 'References',
        'Eq', 'Eqs', 'Equation', 'Equations', 'Sec', 'Secs', 'Section', 'Sections',
        'al', 'e\\.g', 'i\\.e', 'vs', 'cf', 'vol', 'no', 'pp', 'Dr', 'Prof', 'MDPI',
        'Inc', 'Ltd', 'Co', 'Univ', 'Dept', 'approx'
    ];
    abbrevs.forEach(abb => {
        const regex = new RegExp(`\\b${abb}\\.`, 'gi');
        protectedText = protectedText.replace(regex, match => match.slice(0, -1) + '§DOT§');
    });
    protectedText = protectedText.replace(/(\d+)\.(\d+)/g, '$1§DOT§$2');

    const rawSplits = protectedText.split(/[.!?]+(?:\s+|$)(?=[A-Z0-9"'\(\]]|$)/);
    const validSentences = rawSplits.map(s => s.replace(/§DOT§/g, '.').trim()).filter(s => s.length > 2);
    return Math.max(1, validSentences.length);
}

function validateSelection(text) {
    const trimmed = text.trim();
    if (trimmed.length < 15) {
        return {
            isValid: false,
            reason: 'Selection is too short. Please select at least one full sentence.',
            sentenceCount: 1
        };
    }

    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length < 4) {
        return {
            isValid: false,
            reason: 'Selection is too short. Please select at least one full sentence.',
            sentenceCount: 1
        };
    }

    const sentenceCount = countSentences(trimmed);
    if (sentenceCount > 4) {
        return {
            isValid: false,
            reason: `Too much selected (${sentenceCount} sentences). Maximum allowed is 4 sentences.`,
            sentenceCount
        };
    }

    if (words.length > 160) {
        return {
            isValid: false,
            reason: `Too much text selected (${words.length} words). Please select between 1 and 4 sentences.`,
            sentenceCount
        };
    }

    const sideTextRegex = /\b(citation:|academic editor:|received:|revised:|accepted:|published:|copyright:|licensee mdpi|https?:\/\/|doi\.org|\bmdpi\b|issn\b)/i;
    if (sideTextRegex.test(trimmed)) {
        return {
            isValid: false,
            reason: 'Accidentally selected sidebar / metadata text. Please select body sentences.',
            sentenceCount
        };
    }

    const letterChars = (trimmed.match(/[A-Za-z]/g) || []).length;
    const letterRatio = letterChars / trimmed.length;
    if (letterRatio < 0.55) {
        return {
            isValid: false,
            reason: 'Selected text does not sound like natural body prose (too many symbols or fragmented layout).',
            sentenceCount
        };
    }

    return {
        isValid: true,
        reason: null,
        sentenceCount
    };
}

// =====================================================================
// INSPECTOR UI UPDATE & CONDITIONAL TABS
// =====================================================================
function updateInspector(data) {
    const emptyState = document.getElementById('inspector-empty-state');
    const activeContent = document.getElementById('inspector-active-content');
    const badge = document.getElementById('inspector-badge');
    const statusDot = document.getElementById('inspector-status-dot');
    const statusTag = document.getElementById('inspector-status-tag');
    const citationPill = document.getElementById('inspector-citation-detected-pill');
    const sentText = document.getElementById('inspector-sent-text');
    const textWrapper = document.getElementById('inspector-text-wrapper');
    const warningBox = document.getElementById('inspector-warning-box');
    const warningText = document.getElementById('inspector-warning-text');
    const sentencesEl = document.getElementById('inspector-sentences');
    const wordsEl = document.getElementById('inspector-words');
    const charsEl = document.getElementById('inspector-chars');
    const tabCitation = document.getElementById('tab-btn-easy_citation');
    const disabledHint = document.getElementById('translate-disabled-hint');

    if (emptyState) emptyState.classList.add('hidden');
    if (activeContent) activeContent.classList.remove('hidden');

    if (sentText) sentText.textContent = data.text;
    if (sentencesEl) sentencesEl.textContent = `${data.sentenceCount} sentence${data.sentenceCount !== 1 ? 's' : ''}`;
    if (wordsEl) wordsEl.textContent = `${data.wordCount} words`;
    if (charsEl) charsEl.textContent = `${data.charCount} chars`;

    // STRICT CONDITIONAL: Easy Citation tab only visible when citation is included
    const hasCitations = data.citations && data.citations.length > 0;
    if (hasCitations) {
        if (tabCitation) {
            tabCitation.classList.remove('hidden');
            tabCitation.classList.add('flex');
        }
        if (citationPill) {
            citationPill.textContent = `Citation: ${data.citations.join(', ')}`;
            citationPill.classList.remove('hidden');
        }
    } else {
        if (tabCitation) {
            tabCitation.classList.add('hidden');
            tabCitation.classList.remove('flex');
        }
        if (citationPill) citationPill.classList.add('hidden');
        
        if (window.READIT_SYSTEM.activeFeature === 'easy_citation') {
            window.READIT_SYSTEM.activeFeature = 'translating_idea';
        }
    }

    if (data.isValid) {
        if (badge) {
            badge.textContent = `Valid Selection (${data.sentenceCount} sent)`;
            badge.className = 'text-xs font-semibold uppercase tracking-wider text-readitGreen';
        }
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-readitGreen animate-pulse';
        if (statusTag) {
            statusTag.textContent = `Page ${data.page}`;
            statusTag.className = 'text-xs font-monoFeature px-2.5 py-1 rounded-md bg-white/[0.08] text-white/80 border border-white/10';
        }
        if (warningBox) warningBox.classList.add('hidden');
        if (textWrapper) textWrapper.className = 'p-3.5 rounded-xl bg-hubCard border border-white/10 shadow-inner max-h-[160px] overflow-y-auto transition-colors';

        document.querySelectorAll('#btn-trigger-idea, #btn-trigger-quickref, #btn-trigger-citation').forEach(b => b.disabled = false);
        if (disabledHint) disabledHint.classList.add('hidden');
    } else {
        if (badge) {
            badge.textContent = 'Invalid Selection';
            badge.className = 'text-xs font-semibold uppercase tracking-wider text-amber-400';
        }
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-amber-400';
        if (statusTag) {
            statusTag.textContent = 'Rule Violation';
            statusTag.className = 'text-xs font-monoFeature px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30';
        }
        if (warningBox) {
            warningBox.classList.remove('hidden');
            if (warningText) warningText.textContent = data.validationReason || 'Selection does not meet required rules.';
        }
        if (textWrapper) textWrapper.className = 'p-3.5 rounded-xl bg-hubCard border border-amber-500/30 shadow-inner max-h-[160px] overflow-y-auto transition-colors';

        document.querySelectorAll('#btn-trigger-idea, #btn-trigger-quickref, #btn-trigger-citation').forEach(b => b.disabled = true);
        if (disabledHint) {
            disabledHint.classList.remove('hidden');
            disabledHint.textContent = data.validationReason || 'Please select 1 to 4 body sentences.';
        }
    }
}

function resetInspector() {
    window.READIT_SYSTEM.activeCard = false;
    window.READIT_SYSTEM.activeCardData = null;
    window.READIT_SYSTEM.pendingSelection = null;
    window.READIT_SYSTEM.selectedText = '';
    window.READIT_SYSTEM.featureCache = {};
    window.READIT_SYSTEM.copyPayloads = {};

    const emptyState = document.getElementById('inspector-empty-state');
    const activeContent = document.getElementById('inspector-active-content');
    const badge = document.getElementById('inspector-badge');
    const statusDot = document.getElementById('inspector-status-dot');
    const warningBox = document.getElementById('inspector-warning-box');

    if (emptyState) emptyState.classList.remove('hidden');
    if (activeContent) activeContent.classList.add('hidden');
    if (warningBox) warningBox.classList.add('hidden');

    document.getElementById('idea-explanation-container')?.classList.add('hidden');
    document.getElementById('quickref-container')?.classList.add('hidden');
    document.getElementById('citation-container')?.classList.add('hidden');

    if (badge) {
        badge.textContent = 'Interactive Lens Companion';
        badge.className = 'text-xs font-semibold uppercase tracking-wider text-white/50';
    }
    if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-white/30';
}

function copyCurrentSelection() {
    const text = window.READIT_SYSTEM.selectedText;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const copyText = document.getElementById('copy-text');
        if (copyText) {
            const original = copyText.textContent;
            copyText.textContent = 'Copied!';
            setTimeout(() => { copyText.textContent = original; }, 1500);
        }
    });
}

// =====================================================================
// NATURAL LANGUAGE SWITCHER (Simple EN | Bahasa ID)
// =====================================================================
function setReaderLang(lang) {
    if (!['en', 'id'].includes(lang)) return;
    currentReaderLang = lang;
    window.READIT_SYSTEM.currentLang = lang;

    const floatEn = document.getElementById('floating-lang-en');
    const floatId = document.getElementById('floating-lang-id');
    const langBadge = document.getElementById('inspector-lang-badge');
    const ideaLangTag = document.getElementById('idea-lang-tag');

    if (lang === 'en') {
        if (floatEn) floatEn.className = "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] min-w-[96px] justify-center rounded-full bg-readitGreen text-black font-semibold text-xs tracking-wide transition-all shadow-md active:scale-95 focus:outline-none touch-manipulation";
        if (floatId) floatId.className = "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] min-w-[96px] justify-center rounded-full text-white/70 hover:text-white active:scale-95 transition-all text-xs font-semibold tracking-wide focus:outline-none touch-manipulation";
        if (langBadge) {
            langBadge.textContent = 'EN';
            langBadge.className = 'font-monoFeature text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-readitGreen border border-white/10';
        }
        if (ideaLangTag) ideaLangTag.textContent = 'EN';

        document.getElementById('label-core-action')?.replaceChildren(document.createTextNode('Core Action (Actor → Action → Outcome)'));
        document.getElementById('label-plain-meaning')?.replaceChildren(document.createTextNode('Plain Language (0 Dropped Constraints)'));
        document.getElementById('label-why-matters')?.replaceChildren(document.createTextNode('Why It Matters'));
        document.getElementById('label-real-subject')?.replaceChildren(document.createTextNode('Who Actually Did This? (Real Subject)'));
        document.getElementById('label-active-rewrite')?.replaceChildren(document.createTextNode('Direct Active Voice Rewrite'));
        document.getElementById('label-ref-title')?.replaceChildren(document.createTextNode('Cited Work / Foundation'));
        document.getElementById('label-supporting-claim')?.replaceChildren(document.createTextNode('Supporting Claim Grounded on Citation'));
        document.getElementById('label-why-cited')?.replaceChildren(document.createTextNode('Why the Authors Cited This'));
    } else {
        if (floatEn) floatEn.className = "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] min-w-[96px] justify-center rounded-full text-white/70 hover:text-white active:scale-95 transition-all text-xs font-semibold tracking-wide focus:outline-none touch-manipulation";
        if (floatId) floatId.className = "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 min-h-[44px] min-w-[96px] justify-center rounded-full bg-readitGreen text-black font-semibold text-xs tracking-wide transition-all shadow-md active:scale-95 focus:outline-none touch-manipulation";
        if (langBadge) {
            langBadge.textContent = 'ID';
            langBadge.className = 'font-monoFeature text-[10px] px-2 py-0.5 rounded bg-readitGreen/15 text-readitGreen border border-readitGreen/30';
        }
        if (ideaLangTag) ideaLangTag.textContent = 'ID';

        document.getElementById('label-core-action')?.replaceChildren(document.createTextNode('Tindakan Inti (Aktor → Aksi → Hasil)'));
        document.getElementById('label-plain-meaning')?.replaceChildren(document.createTextNode('Bahasa Sederhana (Tanpa Pangkas Batasan)'));
        document.getElementById('label-why-matters')?.replaceChildren(document.createTextNode('Mengapa Ini Penting?'));
        document.getElementById('label-real-subject')?.replaceChildren(document.createTextNode('Siapa Pelaku Sebenarnya? (Subjek Nyata)'));
        document.getElementById('label-active-rewrite')?.replaceChildren(document.createTextNode('Tulis Ulang Kalimat Aktif Langsung'));
        document.getElementById('label-ref-title')?.replaceChildren(document.createTextNode('Karya Ilmiah yang Dikutip'));
        document.getElementById('label-supporting-claim')?.replaceChildren(document.createTextNode('Klaim Makalah yang Didukung Sitasi'));
        document.getElementById('label-why-cited')?.replaceChildren(document.createTextNode('Alasan Penulis Mengutip Rujukan Ini'));
    }

    const data = window.READIT_SYSTEM.activeCardData || window.READIT_SYSTEM.pendingSelection;
    if (window.READIT_SYSTEM.activeCard && data && data.text) {
        const feature = window.READIT_SYSTEM.activeFeature;
        const cacheKey = `${feature}_${lang}`;
        if (window.READIT_SYSTEM.featureCache[cacheKey]) {
            renderFeatureOutput(feature, window.READIT_SYSTEM.featureCache[cacheKey]);
        } else {
            executeFeatureLens(feature, data);
        }
    }
}

// =====================================================================
// FOCUSED FEATURE DRAWER SWITCHER
// =====================================================================
function switchFeatureDrawer(feature) {
    if (!['translating_idea', 'quick_reference', 'easy_citation'].includes(feature)) {
        feature = 'translating_idea';
    }

    window.READIT_SYSTEM.activeFeature = feature;

    const tabs = ['translating_idea', 'quick_reference', 'easy_citation'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const drawer = document.getElementById(`drawer-${t}`);

        if (t === feature) {
            if (btn) {
                btn.className = 'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 bg-readitGreen text-black shadow-sm';
            }
            if (drawer) drawer.classList.remove('hidden');
        } else {
            if (btn) {
                btn.className = 'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 text-white/70 hover:text-white bg-transparent';
            }
            if (drawer) drawer.classList.add('hidden');
        }
    });

    const data = window.READIT_SYSTEM.activeCardData || window.READIT_SYSTEM.pendingSelection;
    if (data && data.text) {
        const lang = window.READIT_SYSTEM.currentLang || 'en';
        const cacheKey = `${feature}_${lang}`;
        if (window.READIT_SYSTEM.featureCache[cacheKey]) {
            renderFeatureOutput(feature, window.READIT_SYSTEM.featureCache[cacheKey]);
        } else {
            executeFeatureLens(feature, data);
        }
    }
}

async function triggerCurrentFeatureAction() {
    const data = window.READIT_SYSTEM.activeCardData || window.READIT_SYSTEM.pendingSelection;
    if (!data || !data.text) return;
    await executeFeatureLens(window.READIT_SYSTEM.activeFeature, data);
}

// =====================================================================
// CALL BACKEND LENS API WITH CONTEXT & CONSTRAINTS
// =====================================================================
async function executeFeatureLens(feature, data) {
    if (!data || !data.text) return;

    const lang = window.READIT_SYSTEM.currentLang || 'en';
    const cacheKey = `${feature}_${lang}`;

    let apiLensType = feature;
    if (feature === 'translating_idea') apiLensType = 'intuition';

    setDrawerLoading(feature, true);

    try {
        const response = await fetch('/api/lens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: data.text,
                lens_type: apiLensType,
                language: lang,
                paper_context: window.READIT_SYSTEM.paperContext || null
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const result = await response.json();
        window.READIT_SYSTEM.featureCache[cacheKey] = result;
        renderFeatureOutput(feature, result);
    } catch (err) {
        console.error(`Failed to execute lens [${feature}]:`, err);
        renderFeatureError(feature, err.message);
    } finally {
        setDrawerLoading(feature, false);
    }
}

function setDrawerLoading(feature, isLoading) {
    if (feature === 'translating_idea') {
        const btn = document.getElementById('btn-trigger-idea');
        const label = document.getElementById('btn-idea-label');
        const container = document.getElementById('idea-explanation-container');
        const actionEl = document.getElementById('idea-core-action');
        const plainEl = document.getElementById('idea-plain-meaning');
        const takeawayEl = document.getElementById('idea-takeaway');
        const anchorEl = document.getElementById('idea-context-anchor');
        const errorEl = document.getElementById('idea-explanation-error');

        if (btn) btn.disabled = isLoading;
        if (label) label.textContent = isLoading ? 'Simplifying (Preserving Constraints)...' : 'Deconstruct Idea (3s Scan)';
        if (isLoading) {
            if (container) container.classList.remove('hidden');
            if (errorEl) errorEl.classList.add('hidden');
            if (actionEl) actionEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Extracting Actor → Action → Outcome...</span>';
            if (plainEl) plainEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Simplifying lexical complexity...</span>';
            if (takeawayEl) takeawayEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Evaluating paper impact...</span>';
            if (anchorEl) anchorEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Grounding in paper context...</span>';
        }
    } else if (feature === 'quick_reference') {
        const btn = document.getElementById('btn-trigger-quickref');
        const label = document.getElementById('btn-quickref-label');
        const container = document.getElementById('quickref-container');
        const realSubjectEl = document.getElementById('quickref-real-subject');
        const activeRewriteEl = document.getElementById('quickref-active-rewrite');
        const passivesContainer = document.getElementById('quickref-passive-container');
        const antecedentsContainer = document.getElementById('quickref-antecedents-container');
        const errorEl = document.getElementById('quickref-error');

        if (btn) btn.disabled = isLoading;
        if (label) label.textContent = isLoading ? 'Decoding Actor & Referents...' : 'Decode Passive & Antecedents';
        if (isLoading) {
            if (container) container.classList.remove('hidden');
            if (errorEl) errorEl.classList.add('hidden');
            if (realSubjectEl) realSubjectEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Resolving real actor / who acted...</span>';
            if (activeRewriteEl) activeRewriteEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Rewriting in direct active voice...</span>';
            if (passivesContainer) passivesContainer.innerHTML = '<span class="text-white/40 italic animate-pulse text-[11px]">Detecting passive verbs...</span>';
            if (antecedentsContainer) antecedentsContainer.innerHTML = '<span class="text-white/40 italic animate-pulse text-[11px]">Mapping ambiguous pronouns and nouns...</span>';
        }
    } else if (feature === 'easy_citation') {
        const btn = document.getElementById('btn-trigger-citation');
        const label = document.getElementById('btn-citation-label');
        const container = document.getElementById('citation-container');
        const titleEl = document.getElementById('citation-ref-title');
        const claimEl = document.getElementById('citation-supporting-claim');
        const whyEl = document.getElementById('citation-why-cited');
        const errorEl = document.getElementById('citation-error');

        if (btn) btn.disabled = isLoading;
        if (label) label.textContent = isLoading ? 'Unpacking Citation Context...' : 'Unpack Citation Context';
        if (isLoading) {
            if (container) container.classList.remove('hidden');
            if (errorEl) errorEl.classList.add('hidden');
            if (titleEl) titleEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Locating cited publication...</span>';
            if (claimEl) claimEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Extracting sentence claim relying on this reference...</span>';
            if (whyEl) whyEl.innerHTML = '<span class="text-white/40 italic animate-pulse">Analyzing author rationale for citation...</span>';
        }
    }
}

function renderFeatureOutput(feature, result) {
    const isID = window.READIT_SYSTEM.currentLang === 'id';

    if (feature === 'translating_idea') {
        const container = document.getElementById('idea-explanation-container');
        const actionEl = document.getElementById('idea-core-action');
        const plainEl = document.getElementById('idea-plain-meaning');
        const takeawayEl = document.getElementById('idea-takeaway');
        const anchorEl = document.getElementById('idea-context-anchor');
        const errorEl = document.getElementById('idea-explanation-error');

        let coreAction = (result.core_action || '').trim();
        let plainMeaning = (result.plain_meaning || '').trim();
        let takeaway = (result.takeaway || '').trim();
        let contextLink = (result.context_link || '').trim();

        if (!coreAction && result.explanation) {
            const raw = result.explanation;
            const actionMatch = raw.match(/\*\*⚡?\s*(?:CORE ACTION|TINDAKAN INTI)\*\*\s*([\s\S]*?)(?=\*\*📖|\*\*PLAIN|\*\*BAHASA|$)/i);
            const plainMatch = raw.match(/\*\*📖?\s*(?:PLAIN ENGLISH|PLAIN LANGUAGE|BAHASA SEDERHANA)\*\*\s*([\s\S]*?)(?=\*\*🎯|\*\*WHY|\*\*MENGAPA|$)/i);
            const takeMatch = raw.match(/\*\*🎯?\s*(?:WHY IT MATTERS|MENGAPA INI PENTING)\*\*\s*([\s\S]*?)(?=\*\*🔒|\*\*CONTEXT|\*\*KONTEKS|$)/i);
            const anchorMatch = raw.match(/\*\*🔒?\s*(?:CONTEXT ANCHOR|JANGKAR KONTEKS)\*\*\s*([\s\S]*?)$/i);

            if (actionMatch) coreAction = actionMatch[1].trim();
            if (plainMatch) plainMeaning = plainMatch[1].trim();
            if (takeMatch) takeaway = takeMatch[1].replace(/^[•\-\*]\s*/, '').trim();
            if (anchorMatch) contextLink = anchorMatch[1].trim();
            if (!plainMeaning) plainMeaning = raw;
        }

        if (!coreAction) {
            coreAction = isID ? 'Mekanisme utama yang dijelaskan pada teks terpilih.' : 'Key mechanism outlined in selected text.';
        }
        if (!takeaway) {
            takeaway = isID ? 'Secara langsung memengaruhi metodologi dan hasil riset.' : 'Directly impacts the core thesis and methodology.';
        }
        if (!contextLink) {
            contextLink = window.READIT_SYSTEM.paperContext?.domain 
                ? (isID ? `Bidang: ${window.READIT_SYSTEM.paperContext.domain}` : `Domain: ${window.READIT_SYSTEM.paperContext.domain}`)
                : (isID ? 'Terkait erat dengan konteks keseluruhan makalah.' : 'Grounded in global paper context.');
        }

        if (actionEl) actionEl.textContent = coreAction;
        if (plainEl) plainEl.textContent = plainMeaning;
        if (takeawayEl) takeawayEl.textContent = takeaway;
        if (anchorEl) anchorEl.textContent = contextLink;

        window.READIT_SYSTEM.copyPayloads['translating_idea'] = 
            `⚡ ${isID ? 'TINDAKAN INTI' : 'CORE ACTION'}:\n${coreAction}\n\n` +
            `📖 ${isID ? 'BAHASA SEDERHANA' : 'PLAIN MEANING'}:\n${plainMeaning}\n\n` +
            `🎯 ${isID ? 'MENGAPA PENTING' : 'WHY IT MATTERS'}:\n• ${takeaway}\n\n` +
            `🔒 ${isID ? 'JANGKAR KONTEKS' : 'CONTEXT ANCHOR'}:\n${contextLink}`;

        if (container) container.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');

    } else if (feature === 'quick_reference') {
        const container = document.getElementById('quickref-container');
        const realSubjectEl = document.getElementById('quickref-real-subject');
        const activeRewriteEl = document.getElementById('quickref-active-rewrite');
        const passivesContainer = document.getElementById('quickref-passive-container');
        const antecedentsContainer = document.getElementById('quickref-antecedents-container');
        const errorEl = document.getElementById('quickref-error');

        let realSubject = typeof result.real_subject === 'string' ? result.real_subject : JSON.stringify(result.real_subject || '');
        let activeRewrite = typeof result.active_rewrite === 'string' ? result.active_rewrite : JSON.stringify(result.active_rewrite || '');
        let passiveList = Array.isArray(result.passive_phrases) ? result.passive_phrases : [];
        let antecedents = Array.isArray(result.antecedents) ? result.antecedents : [];

        if (realSubjectEl) realSubjectEl.textContent = realSubject || (isID ? 'Penulis / Peneliti studi ini' : 'The study authors / researchers');
        if (activeRewriteEl) activeRewriteEl.textContent = activeRewrite || (isID ? 'Penulis melakukan aksi secara langsung.' : 'The authors performed the action directly.');

        if (passivesContainer) {
            if (passiveList.length > 0) {
                passivesContainer.innerHTML = passiveList.map(phrase => 
                    `<span class="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[11px] font-monoFeature">"${escapeHtml(String(phrase))}"</span>`
                ).join('');
            } else {
                passivesContainer.innerHTML = `<span class="text-white/50 text-[11px] italic">${isID ? 'Tidak ada frasa pasif yang kabur' : 'No ambiguous passive phrases detected'}</span>`;
            }
        }

        if (antecedentsContainer) {
            if (antecedents.length > 0) {
                antecedentsContainer.innerHTML = antecedents.map(item => {
                    const term = typeof item === 'object' ? (item.term || item.referent || Object.keys(item)[0]) : String(item);
                    const meaning = typeof item === 'object' ? (item.refers_to || item.meaning || item.antecedent || Object.values(item)[0]) : '';
                    return `<div class="p-2 rounded-lg bg-white/[0.03] border border-white/08 flex items-start gap-2">
                        <span class="font-monoFeature font-semibold text-readitGreen shrink-0">${escapeHtml(term)}</span>
                        <span class="text-white/40">→</span>
                        <span class="text-white/90 leading-snug">${escapeHtml(meaning)}</span>
                    </div>`;
                }).join('');
            } else {
                antecedentsContainer.innerHTML = `<span class="text-white/50 text-[11px] italic">${isID ? 'Semua rujukan kata ganti jelas' : 'All referents and pronouns are clear'}</span>`;
            }
        }

        window.READIT_SYSTEM.copyPayloads['quick_reference'] = 
            `🔍 ${isID ? 'RUJUKAN CEPAT (DEKODER SUBJEK & RUJUKAN)' : 'QUICK REFERENCE (SUBJECT & REFERENT DECODER)'}:\n` +
            `• ${isID ? 'Subjek Nyata' : 'Real Subject'}: ${realSubject}\n` +
            `• ${isID ? 'Kalimat Aktif' : 'Active Voice'}: ${activeRewrite}\n` +
            `• ${isID ? 'Frasa Pasif' : 'Passive Phrases'}: ${passiveList.join(', ')}`;

        if (container) container.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');

    } else if (feature === 'easy_citation') {
        const container = document.getElementById('citation-container');
        const labelBadge = document.getElementById('citation-label-badge');
        const titleEl = document.getElementById('citation-ref-title');
        const claimEl = document.getElementById('citation-supporting-claim');
        const whyEl = document.getElementById('citation-why-cited');
        const errorEl = document.getElementById('citation-error');

        const citLabel = result.citation_label || (window.READIT_SYSTEM.activeCardData?.citations?.[0] || '[1]');
        const refTitle = result.reference_title || (isID ? 'Daftar Pustaka Makalah (Rujukan Terindeks)' : 'Paper Reference Bibliography');
        const supportingClaim = result.supporting_claim || (isID ? 'Klaim utama kalimat ini didasarkan pada rujukan tersebut.' : 'Sentence claim is substantiated by this literature.');
        const whyCited = result.why_cited || (isID ? 'Dikutip untuk memperkuat bukti empiris dari premis penelitian.' : 'Cited to substantiate the empirical claim in this study.');

        if (labelBadge) labelBadge.textContent = citLabel;
        if (titleEl) titleEl.textContent = refTitle;
        if (claimEl) claimEl.textContent = supportingClaim;
        if (whyEl) whyEl.textContent = whyCited;

        window.READIT_SYSTEM.copyPayloads['easy_citation'] = 
            `📚 ${isID ? 'SITASI MUDAH' : 'EASY CITATION'} (${citLabel}):\n` +
            `• ${isID ? 'Karya Ilmiah' : 'Reference'}: ${refTitle}\n` +
            `• ${isID ? 'Klaim yang Didukung' : 'Supporting Claim'}: ${supportingClaim}\n` +
            `• ${isID ? 'Alasan Dikutip' : 'Why Cited'}: ${whyCited}`;

        if (container) container.classList.remove('hidden');
        if (errorEl) errorEl.classList.add('hidden');
    }
}

function renderFeatureError(feature, errorMsg) {
    let errorContainerId = 'idea-explanation-error';
    if (feature === 'quick_reference') errorContainerId = 'quickref-error';
    if (feature === 'easy_citation') errorContainerId = 'citation-error';

    const errEl = document.getElementById(errorContainerId);
    if (errEl) {
        errEl.classList.remove('hidden');
        errEl.innerHTML = `<div class="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">Error resolving ${feature}: ${escapeHtml(errorMsg)}</div>`;
    }
}

function copyDrawerContent(feature) {
    const text = window.READIT_SYSTEM.copyPayloads[feature];
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        let labelId = 'copy-idea-label';
        if (feature === 'quick_reference') labelId = 'copy-quickref-label';
        if (feature === 'easy_citation') labelId = 'copy-citation-label';

        const label = document.getElementById(labelId);
        if (label) {
            const original = label.textContent;
            label.textContent = 'Copied!';
            setTimeout(() => { label.textContent = original; }, 1500);
        }
    });
}

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
            btn.className = "sidebar-nav-btn w-full py-2.5 px-4 rounded-full text-[13.5px] font-medium border border-white/70 text-white bg-white/[0.05] transition flex items-center gap-3 focus:outline-none min-h-[44px] touch-manipulation";
        } else {
            btn.className = "sidebar-nav-btn w-full py-2.5 px-4 rounded-full text-[13.5px] font-normal border border-white/[0.12] text-white/40 hover:text-white/80 hover:border-white/30 transition flex items-center gap-3 focus:outline-none min-h-[44px] touch-manipulation";
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
        desc: "Hover over any sentence in your PDF to highlight the full sentence automatically. Click once to open the companion inspector beside the paper without losing your reading spot."
    },
    {
        title: "02 · Translating Idea",
        desc: "Converts dense C1/C2 academic phrasing into plain, clear language in Simple English or Bahasa Indonesia while keeping technical accuracy and constraints intact."
    },
    {
        title: "03 · Quick Reference (Passive Voice)",
        desc: "Automatically links ambiguous passive phrases and pronouns back to the exact actor or subject in preceding sentences."
    },
    {
        title: "04 · Easy Citation",
        desc: "Brings bibliography references like [1] directly into your reading inspector so you never lose your scroll position."
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
            </div>
        `;
    } else {
        title.textContent = 'Privacy and Policy';
        body.innerHTML = `
            <p class="leading-relaxed text-white/70">
                READit processes uploaded academic PDFs locally in your browser session and only sends individual inspected sentences (plus background context anchors) to generate plain-language breakdowns. Your manuscripts are never used to train external models.
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
    setTimeout(initGoogleIdentity, 600);

    // Register selection change listeners for floating actions bar on PDF TextLayer
    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('mouseup', handleSelectionChange);
});

// Debounced window resize handler for PDF Canvas
window.addEventListener('resize', () => {
    if (!currentPdf) return;
    clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(() => {
        renderPage(currentPageNum);
    }, 150);
});

// Hide floating actions on viewport scroll
const readerViewport = document.getElementById('reader-viewport');
if (readerViewport) {
    readerViewport.addEventListener('scroll', () => {
        hideFloatingActions();
    }, { passive: true });
}
window.addEventListener('scroll', () => {
    hideFloatingActions();
}, { passive: true });

// Keyboard shortcuts: Escape closes modals, Ctrl+B toggles sidebar, Ctrl+Q cycles tabs, Arrow keys flip pages
window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (e.key === 'Escape') {
        closeAuthModal();
        closeGuideVideoModal();
        closeAccountModal();
        hideFloatingActions();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebarMinimize();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        navigateNextTab(e.shiftKey);
    }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        changePage(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        changePage(1);
    }
});

// Expose functions globally for HTML event handlers
window.renderHubDocuments = renderHubDocuments;
window.switchHubTab = switchHubTab;
window.handleAccountTriggerClick = handleAccountTriggerClick;
window.toggleAccountMenu = toggleAccountMenu;
window.toggleSidebarMinimize = toggleSidebarMinimize;
window.toggleMobileSidebar = toggleMobileSidebar;
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
window.processAndOpenPdf = processAndOpenPdf;
window.toggleRecentDocumentsGrid = toggleRecentDocumentsGrid;
window.openSmartReader = openSmartReader;
window.closeSmartReader = closeSmartReader;
window.switchReaderTab = switchReaderTab;
window.closeReaderTab = closeReaderTab;
window.togglePaperSwitcherDrawer = togglePaperSwitcherDrawer;
window.handleTabDragStart = handleTabDragStart;
window.handleTabDragOver = handleTabDragOver;
window.handleTabDragEnter = handleTabDragEnter;
window.handleTabDragLeave = handleTabDragLeave;
window.handleTabDrop = handleTabDrop;
window.handleTabDragEnd = handleTabDragEnd;
window.navigateNextTab = navigateNextTab;
window.changePage = changePage;
window.renderPage = renderPage;
window.loadPdfDocument = loadPdfDocument;
window.prebakePaperContext = prebakePaperContext;
window.handleFloatingFeatureClick = handleFloatingFeatureClick;
window.switchFeatureDrawer = switchFeatureDrawer;
window.triggerCurrentFeatureAction = triggerCurrentFeatureAction;
window.executeFeatureLens = executeFeatureLens;
window.copyDrawerContent = copyDrawerContent;
window.copyCurrentSelection = copyCurrentSelection;
window.setReaderLang = setReaderLang;
window.detectCitations = detectCitations;
window.detectCitationsInText = detectCitationsInText;
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
