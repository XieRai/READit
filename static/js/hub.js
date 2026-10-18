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
let isLoggingOut = false;

function getSupabase() {
    if (supabaseClient) return supabaseClient;
    const url = (window.ENV && window.ENV.SUPABASE_URL) || '';
    const key = (window.ENV && window.ENV.SUPABASE_ANON_KEY) || '';
    if (window.supabase && url && key) {
        supabaseClient = window.supabase.createClient(url, key);
    }
    return supabaseClient;
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

function applySupabaseUser(user) {
    if (!user) return;
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || meta.display_name || (user.email ? user.email.split('@')[0] : 'Researcher');
    currentUser = {
        id: user.id,
        name: name,
        displayName: name,
        email: user.email || '',
        avatarUrl: meta.avatar_url || meta.picture || null,
        plan: 'Free plan'
    };
    isLoggedIn = true;
    localStorage.setItem('readit_user', JSON.stringify(currentUser));
    updateAccountUI();
    syncUserProfileAndPreferences(user.id);
    if (typeof loadUserSavedInsightsFromSupabase === 'function') {
        loadUserSavedInsightsFromSupabase();
    }
}

async function syncUserProfileAndPreferences(userId) {
    if (!userId) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
        const [profileRes, prefRes] = await Promise.all([
            sb.from('users').select('display_name').eq('id', userId).maybeSingle(),
            sb.from('user_preferences').select('target_language, reader_theme').eq('user_id', userId).maybeSingle()
        ]);

        // 1. Sync custom display name from public.users table if present
        if (profileRes && profileRes.data && profileRes.data.display_name) {
            const dbDisplayName = profileRes.data.display_name.trim();
            if (dbDisplayName && currentUser && currentUser.id === userId) {
                currentUser.name = dbDisplayName;
                currentUser.displayName = dbDisplayName;
                localStorage.setItem('readit_user', JSON.stringify(currentUser));
                updateAccountUI();
            }
        }

        // 2. Sync target language preference from public.user_preferences table
        if (prefRes && prefRes.data && prefRes.data.target_language) {
            const dbLang = prefRes.data.target_language;
            if (['en', 'id'].includes(dbLang)) {
                setReaderLang(dbLang, false); // false = do not trigger echo write back to DB
            }
        } else if (currentUser && currentUser.id === userId) {
            // First time or missing record in user_preferences: upsert defaults
            const currentPref = localStorage.getItem('readit_target_language') || 'en';
            await sb.from('user_preferences').upsert({
                user_id: userId,
                target_language: currentPref,
                reader_theme: localStorage.getItem('readit_theme') || 'dark',
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
        }
    } catch (err) {
        console.warn('syncUserProfileAndPreferences error:', err);
    }
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
    if (typeof updateStarButtonsVisibility === 'function') {
        updateStarButtonsVisibility(isLoggedIn && !!currentUser);
    }
}

async function initAccountState() {
    // Check if we just logged out and should display the confirmation toast
    try {
        if (sessionStorage.getItem('readit_logout_toast')) {
            sessionStorage.removeItem('readit_logout_toast');
            setTimeout(() => {
                showHubToast('Signed out of READit');
            }, 300);
        }
    } catch (e) {}

    const sb = getSupabase();
    if (sb) {
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (session && session.user) {
                applySupabaseUser(session.user);
                loadUserLibraryFromSupabase();
                if (typeof loadUserSavedInsightsFromSupabase === 'function') {
                    loadUserSavedInsightsFromSupabase();
                }
            } else {
                loadFallbackUser();
                await loadDemoPaper();
                if (typeof updateStarButtonsVisibility === 'function') {
                    updateStarButtonsVisibility(false);
                }
            }

            sb.auth.onAuthStateChange((event, session) => {
                if (session && session.user) {
                    applySupabaseUser(session.user);
                    if (event === 'SIGNED_IN') {
                        showHubToast(`Welcome, ${currentUser.name}`);
                        triggerPendingUploadsIfAny();
                        loadUserLibraryFromSupabase();
                        if (typeof loadUserSavedInsightsFromSupabase === 'function') {
                            loadUserSavedInsightsFromSupabase();
                        }
                    }
                } else if (event === 'SIGNED_OUT') {
                    const wasLoggedIn = isLoggedIn;
                    currentUser = null;
                    isLoggedIn = false;
                    userSavedInsights = [];
                    localStorage.removeItem('readit_user');
                    if (typeof updateStarButtonsVisibility === 'function') {
                        updateStarButtonsVisibility(false);
                    }

                    // If an active user was signed out and reload hasn't been triggered yet, refresh once
                    if (wasLoggedIn && !isLoggingOut) {
                        isLoggingOut = true;
                        try {
                            sessionStorage.setItem('readit_logout_toast', 'true');
                        } catch (e) {}
                        window.location.reload();
                        return;
                    }

                    hubDocuments = [];
                    openTabs = [];
                    loadDemoPaper();
                    updateAccountUI();
                }
            });
        } catch (err) {
            console.warn('Supabase auth init:', err);
            loadFallbackUser();
            await loadDemoPaper();
        }
    } else {
        loadFallbackUser();
        await loadDemoPaper();
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
        if (typeof updateStarButtonsVisibility === 'function') {
            updateStarButtonsVisibility(true);
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
        if (typeof updateStarButtonsVisibility === 'function') {
            updateStarButtonsVisibility(false);
        }
    }
}

function handleAccountTriggerClick() {
    if (!isLoggedIn) {
        openAuthModal('signin');
        return;
    }
    if (isSidebarMinimized && window.innerWidth >= 768) {
        openAccountModal('settings');
        return;
    }
    toggleAccountMenu();
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
        const drawer = document.getElementById('hub-account-drawer');
        if (drawer) drawer.classList.remove('open');
        isAccountDrawerOpen = false;

        sidebar.classList.remove('md:w-[240px]');
        sidebar.classList.add('sidebar-collapsed', 'sidebar-minimized', 'md:w-[68px]');
        if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
        localStorage.setItem('readit_sidebar_minimized', 'true');
    } else {
        sidebar.classList.remove('sidebar-collapsed', 'sidebar-minimized', 'md:w-[68px]');
        sidebar.classList.add('md:w-[240px]');
        if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
        localStorage.setItem('readit_sidebar_minimized', 'false');
    }
}

function toggleMobileSidebar(openState) {
    const sidebar = document.getElementById('hub-sidebar');
    const backdrop = document.getElementById('hub-mobile-sidebar-backdrop');
    if (!sidebar) return;

    const shouldOpen = openState !== undefined ? openState : sidebar.classList.contains('-translate-x-full');

    if (shouldOpen) {
        sidebar.classList.remove('sidebar-collapsed', 'sidebar-minimized');
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
    const toggleIcon = document.getElementById('sidebar-toggle-icon');
    if (!sidebar) return;

    const savedState = localStorage.getItem('readit_sidebar_minimized');
    if (savedState === 'true' && window.innerWidth >= 768) {
        isSidebarMinimized = true;
        sidebar.classList.remove('md:w-[240px]');
        sidebar.classList.add('sidebar-collapsed', 'sidebar-minimized', 'md:w-[68px]');
        if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
    } else {
        isSidebarMinimized = false;
        sidebar.classList.remove('sidebar-collapsed', 'sidebar-minimized', 'md:w-[68px]');
        sidebar.classList.add('md:w-[240px]');
        if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
    }
}

function openAuthModal(mode = 'signin', reasonText = null) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    const note = document.getElementById('auth-signin-note');
    if (note) {
        if (reasonText) {
            note.textContent = reasonText;
        } else {
            note.textContent = 'Sign in to upload custom research PDFs, save lexicons, and sync reading notes.';
        }
    }

    if (mode === 'signup') {
        switchToSignUp();
    } else {
        switchToSignIn();
    }

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100', 'pointer-events-auto');
    });
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.remove('opacity-100', 'pointer-events-auto');
    modal.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function switchToSignUp() {
    const signinCard = document.getElementById('auth-card-signin');
    const signupCard = document.getElementById('auth-card-signup');
    if (signinCard) {
        signinCard.classList.remove('translate-x-0', 'opacity-100', 'pointer-events-auto');
        signinCard.classList.add('-translate-x-[150%]', 'opacity-0', 'pointer-events-none');
    }
    if (signupCard) {
        signupCard.classList.remove('translate-x-[150%]', 'opacity-0', 'pointer-events-none');
        signupCard.classList.add('translate-x-0', 'opacity-100', 'pointer-events-auto');
    }
}

function switchToSignIn() {
    const signinCard = document.getElementById('auth-card-signin');
    const signupCard = document.getElementById('auth-card-signup');
    if (signupCard) {
        signupCard.classList.remove('translate-x-0', 'opacity-100', 'pointer-events-auto');
        signupCard.classList.add('translate-x-[150%]', 'opacity-0', 'pointer-events-none');
    }
    if (signinCard) {
        signinCard.classList.remove('-translate-x-[150%]', 'opacity-0', 'pointer-events-none');
        signinCard.classList.add('translate-x-0', 'opacity-100', 'pointer-events-auto');
    }
}

function triggerPendingUploadsIfAny() {
    if (pendingUploadFiles && pendingUploadFiles.length > 0) {
        const files = [...pendingUploadFiles];
        pendingUploadFiles = [];
        handlePdfFiles(files);
    }
    // Automatically backup and sync any open local documents into cloud account
    if (isLoggedIn && currentUser) {
        for (const doc of hubDocuments) {
            if (doc.file && !doc.isCloudOnly) {
                const parsedData = {
                    file_hash: doc.fileHash,
                    title: doc.title,
                    page_count: doc.pageCount,
                    prebake_context: doc.prebakeContext
                };
                saveNewDocumentToCloud(doc, doc.file, parsedData);
            }
        }
    }
}

function initGoogleIdentity() {
    const clientId = (window.ENV && window.ENV.GOOGLE_CLIENT_ID) || '';
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
    if (isLoggingOut) return;
    isLoggingOut = true;

    // Immediately clear authentication state and stored user info
    isLoggedIn = false;
    currentUser = null;
    localStorage.removeItem('readit_user');

    // Store a one-shot notification flag in sessionStorage so the toast appears after reload
    try {
        sessionStorage.setItem('readit_logout_toast', 'true');
    } catch (e) {}

    // Clear document state in memory
    hubDocuments = [];
    openTabs = [];
    activeTabId = null;
    currentPdf = null;

    // Sign out of Supabase to invalidate cloud session & localStorage tokens
    const sb = getSupabase();
    if (sb) {
        try {
            await sb.auth.signOut();
        } catch (err) {
            console.warn('Sign-out error:', err);
        }
    }

    // Refresh page once so papers and state from previous logged-in account do not appear
    window.location.reload();
}

// =====================================================================
// DEMO PAPER CONFIGURATION (SUPABASE STORAGE & DATABASE CACHE)
// =====================================================================
const DEMO_PAPER_CONFIG = {
    id: 'demo-paper-sample',
    fileHash: '11bdd54d13587d38b4f611b0113a70e2d8315b0b445e5c134a0aeb81bcf6951c',
    title: 'AC Series Arc Fault (Demo)',
    fullTitle: 'Intelligent Identification Method of Low Voltage AC Series Arc Fault Based on Using Residual Model and Rime Optimization Algorithm',
    authors: ['Xiao He', 'Takahiro Kawaguchi', 'Seiji Hashimoto'],
    pageCount: 22,
    storagePath: 'demo/11bdd54d13587d38b4f611b0113a70e2d8315b0b445e5c134a0aeb81bcf6951c.pdf',
    demoFallbackUrl: '/assets/docs/demo_paper_sample.pdf',
    isDemo: true,
    isCloudOnly: true
};

let demoPaperPromise = null;

async function loadDemoPaper() {
    if (hubDocuments.some(d => d.id === DEMO_PAPER_CONFIG.id || d.fileHash === DEMO_PAPER_CONFIG.fileHash)) {
        return;
    }

    if (demoPaperPromise) {
        return demoPaperPromise;
    }

    demoPaperPromise = (async () => {
        try {
            if (hubDocuments.some(d => d.id === DEMO_PAPER_CONFIG.id || d.fileHash === DEMO_PAPER_CONFIG.fileHash)) {
                return;
            }

            let demoDocData = null;
            const sb = getSupabase();
            if (sb) {
                try {
                    const { data: rpcData, error: rpcErr } = await sb.rpc('get_demo_document');
                    if (!rpcErr && rpcData && rpcData.length > 0) {
                        demoDocData = rpcData[0];
                    } else {
                        const { data, error } = await sb
                            .from('documents')
                            .select('file_hash, title, authors, doi, page_count, prebake_context, storage_path, is_demo_file')
                            .eq('is_demo_file', true)
                            .limit(1);

                        if (!error && data && data.length > 0) {
                            demoDocData = data[0];
                        }
                    }
                } catch (err) {
                    console.warn('Could not query demo document from Supabase:', err);
                }
            }

            if (hubDocuments.some(d => d.id === DEMO_PAPER_CONFIG.id || d.fileHash === (demoDocData?.file_hash || DEMO_PAPER_CONFIG.fileHash))) {
                return;
            }

            const demoDoc = {
                id: DEMO_PAPER_CONFIG.id,
                fileHash: demoDocData?.file_hash || DEMO_PAPER_CONFIG.fileHash,
                title: DEMO_PAPER_CONFIG.title,
                fullTitle: demoDocData?.title || DEMO_PAPER_CONFIG.fullTitle,
                authors: demoDocData?.authors || DEMO_PAPER_CONFIG.authors,
                pageCount: demoDocData?.page_count || DEMO_PAPER_CONFIG.pageCount,
                lastReadPage: 1,
                progressPct: 0,
                storagePath: demoDocData?.storage_path || DEMO_PAPER_CONFIG.storagePath,
                prebakeContext: demoDocData?.prebake_context || null,
                isCloudOnly: true,
                isDemo: true,
                demoFallbackUrl: DEMO_PAPER_CONFIG.demoFallbackUrl
            };

            hubDocuments.push(demoDoc);
            renderHubDocuments();
        } finally {
            demoPaperPromise = null;
        }
    })();

    return demoPaperPromise;
}

// =====================================================================
// RECENT DOCUMENTS LIST & MULTI-TAB SYSTEM STATE (CLEAN EMPTY INITIAL STATE)
// =====================================================================
let hubDocuments = [];
let openTabs = [];
let activeTabId = null;
let isRecentGridExpanded = true;
let currentReaderLang = localStorage.getItem('readit_target_language') || 'en';

function renderHubDocuments() {
    const listContainer = document.getElementById('hub-dynamic-docs-list');
    if (!listContainer) return;

    // Deduplicate hubDocuments by fileHash or id
    const seen = new Set();
    hubDocuments = hubDocuments.filter(d => {
        const key = d.fileHash || d.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (hubDocuments.length === 0) {
        listContainer.innerHTML = '';
        return;
    }

    listContainer.innerHTML = hubDocuments.map((doc) => `
        <div class="flex flex-col items-center w-full group cursor-pointer touch-manipulation relative" onclick="openSmartReader('${doc.id}')">
            <!-- Miniature Paper Thumbnail (Aspect 175/225 responsive, touch target >= 44x44px) -->
            <div class="w-full aspect-[175/225] min-h-[190px] sm:min-h-[225px] rounded-[14px] bg-white p-3 sm:p-3.5 text-[#111827] shadow-md border border-transparent group-hover:ring-2 group-hover:ring-readitGreen active:scale-[0.98] transition-all overflow-hidden flex flex-col justify-between select-none relative">
                ${!doc.isDemo ? `
                    <!-- Delete Document Button -->
                    <button onclick="event.stopPropagation(); promptDeleteDocument('${doc.id}')"
                            class="absolute top-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/75 hover:bg-rose-600 text-white/80 hover:text-white flex items-center justify-center transition-all opacity-90 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 focus:outline-none z-20 shadow-md backdrop-blur-sm active:scale-90 touch-manipulation"
                            title="Delete file and associated starred content"
                            aria-label="Delete document">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                ` : ''}
                <div>
                    <!-- Miniature Journal Header -->
                    <div class="flex items-start justify-between border-b border-neutral-800 pb-1 sm:pb-1.5 mb-1 sm:mb-1.5">
                        <div class="flex items-center gap-1">
                            <div class="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border border-[#0284C7] flex items-center justify-center text-[3.8px] sm:text-[4.5px] font-bold text-[#0284C7]">PDF</div>
                            <div class="text-[4.3px] sm:text-[5px] italic text-[#0284C7] leading-tight font-serifPaper">
                                <div>Academic Research</div>
                                <div>${doc.isDemo ? 'Demo Manuscript' : 'Manuscript'}</div>
                            </div>
                        </div>
                        <div class="flex flex-col items-end">
                            ${doc.isDemo ? '<span class="text-[7.5px] font-monoFeature uppercase font-bold text-emerald-700 bg-emerald-100 border border-emerald-400 px-1 py-0.5 rounded leading-none mb-0.5 shadow-xs">Demo</span>' : ''}
                            <div class="text-[3.6px] sm:text-[4.5px] text-neutral-700 leading-tight text-right font-serifPaper">
                                <div>${doc.pageCount || 1} Pages</div>
                                <div>READit Hub</div>
                            </div>
                        </div>
                    </div>

                    <!-- Miniature Paper Title -->
                    <div class="text-[4px] sm:text-[5px] italic text-neutral-600 mb-0.5 font-serifPaper">${doc.isDemo ? 'Featured Demo Paper' : 'Research Article'}</div>
                    <div class="text-[6.5px] sm:text-[7.5px] font-bold text-black leading-[1.2] mb-1 font-serifPaper line-clamp-2">
                        ${escapeHtml(doc.fullTitle || doc.title)}
                    </div>

                    <!-- Miniature Abstract Block -->
                    <div class="text-[4.2px] sm:text-[5.2px] text-neutral-800 leading-[1.34] text-justify font-serifPaper line-clamp-5 sm:line-clamp-6">
                        <strong>Document Ready:</strong> Real-time PDF rendering with interactive lexical deconstruction and anti-hallucination paper context.
                    </div>
                </div>

                <div class="border-t border-neutral-800 pt-1 text-[3.8px] sm:text-[4.8px] text-neutral-700 font-serifPaper truncate flex items-center justify-between">
                    <span><strong>Format:</strong> PDF • Smart Reader</span>
                    ${doc.isDemo ? '<span class="font-monoFeature font-semibold text-emerald-600">Sample Paper</span>' : ''}
                </div>
            </div>

            <!-- Centered Document Label underneath -->
            <div class="mt-2.5 flex flex-col items-center w-full px-1">
                <span class="text-[11px] sm:text-xs font-semibold text-white tracking-wide w-full max-w-[170px] truncate text-center" title="${escapeHtml(doc.fullTitle || doc.title)}">
                    ${escapeHtml(doc.title)}
                </span>
                ${doc.isDemo ? '<span class="text-[9.5px] font-monoFeature font-semibold text-readitGreen uppercase tracking-wider mt-0.5">Demo Paper</span>' : ''}
            </div>
        </div>
    `).join('');
}

// =====================================================================
// DELETE DOCUMENT & ASSOCIATED STARRED INSIGHTS CONTROLLER
// =====================================================================
let pendingDeleteDocId = null;

function promptDeleteDocument(docIdentifier) {
    const doc = hubDocuments.find(d => d.id === docIdentifier || d.fileHash === docIdentifier);
    if (!doc) return;

    if (doc.isDemo) {
        showHubToast('Built-in demo paper cannot be deleted');
        return;
    }

    pendingDeleteDocId = doc.id;

    const modal = document.getElementById('hub-delete-confirm-modal');
    const titleEl = document.getElementById('delete-modal-doc-title');
    const warnText = document.getElementById('delete-modal-warning-text');
    const confirmBtn = document.getElementById('btn-confirm-delete');

    if (titleEl) {
        titleEl.textContent = doc.fullTitle || doc.title || 'Research Document';
    }

    const starredCount = (typeof userSavedInsights !== 'undefined' && Array.isArray(userSavedInsights))
        ? userSavedInsights.filter(i => (doc.fileHash && i.file_hash === doc.fileHash) || (doc.id && i.file_hash === doc.id)).length
        : 0;

    if (warnText) {
        if (starredCount > 0) {
            warnText.innerHTML = `Deleting this file will permanently remove it from your library and delete all <strong class="underline text-amber-300 font-bold">${starredCount} starred breakdown${starredCount > 1 ? 's' : ''}</strong> associated with this paper from your notebook.`;
        } else {
            warnText.textContent = 'Deleting this file will permanently remove it from your cloud library and reading history. Any future bookmarks on this file will be lost.';
        }
    }

    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<span>Delete File ${starredCount > 0 ? '& Starred' : ''}</span>`;
    }

    if (modal) modal.classList.remove('hidden');
}

function closeDeleteConfirmModal() {
    const modal = document.getElementById('hub-delete-confirm-modal');
    if (modal) modal.classList.add('hidden');
    pendingDeleteDocId = null;
}

async function confirmDeleteDocument() {
    if (!pendingDeleteDocId) return;

    const doc = hubDocuments.find(d => d.id === pendingDeleteDocId);
    if (!doc) {
        closeDeleteConfirmModal();
        return;
    }

    const confirmBtn = document.getElementById('btn-confirm-delete');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="inline-block animate-spin mr-1">↻</span> Deleting...';
    }

    const fileHash = doc.fileHash;
    const docId = doc.id;
    let storagePath = doc.storagePath;
    if (!storagePath && isLoggedIn && currentUser && currentUser.id && fileHash) {
        storagePath = `${currentUser.id}/${fileHash}.pdf`;
    }

    // 1. If signed in, delete from Supabase (user_saved_insights, user_documents, storage)
    if (isLoggedIn && currentUser && currentUser.id) {
        const sb = getSupabase();
        if (sb) {
            try {
                // Delete user_saved_insights for this paper
                if (fileHash) {
                    const { error: insErr } = await sb
                        .from('user_saved_insights')
                        .delete()
                        .eq('user_id', currentUser.id)
                        .eq('file_hash', fileHash);
                    if (insErr) console.warn('Error deleting user_saved_insights from Supabase:', insErr.message);
                }

                // Delete user_documents linking this paper
                if (fileHash) {
                    const { error: docErr } = await sb
                        .from('user_documents')
                        .delete()
                        .eq('user_id', currentUser.id)
                        .eq('file_hash', fileHash);
                    if (docErr) console.warn('Error deleting user_documents from Supabase:', docErr.message);
                }

                // Remove PDF from user storage bucket if exists
                if (storagePath) {
                    const { error: stErr } = await sb.storage.from('papers').remove([storagePath]);
                    if (stErr) console.warn('Error removing file from storage bucket:', stErr.message);
                }
            } catch (err) {
                console.error('Supabase delete document error:', err);
            }
        }
    }

    // 2. Remove associated items from local userSavedInsights array
    if (typeof userSavedInsights !== 'undefined' && Array.isArray(userSavedInsights)) {
        userSavedInsights = userSavedInsights.filter(i => {
            if (fileHash && i.file_hash === fileHash) return false;
            if (docId && i.file_hash === docId) return false;
            return true;
        });
    }

    // 3. Remove document from hubDocuments array
    hubDocuments = hubDocuments.filter(d => d.id !== docId && (!fileHash || d.fileHash !== fileHash));

    // 4. If open in reader tabs, close the tab
    if (typeof openTabs !== 'undefined' && Array.isArray(openTabs)) {
        const matchingTab = openTabs.find(t => t.id === docId || (fileHash && t.fileHash === fileHash));
        if (matchingTab) {
            if (typeof closeReaderTab === 'function') {
                closeReaderTab(null, matchingTab.id);
            } else {
                openTabs = openTabs.filter(t => t.id !== matchingTab.id);
                if (activeTabId === matchingTab.id) {
                    closeSmartReader();
                }
            }
        }
    }

    // 5. Re-render UI views
    renderHubDocuments();
    if (typeof renderStarredInsightsView === 'function') {
        renderStarredInsightsView();
    }
    if (typeof updateStarButtonsUI === 'function') {
        updateStarButtonsUI();
    }

    closeDeleteConfirmModal();
    showHubToast('Paper and associated starred content removed.');
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
// FILE FINGERPRINTING & HIGH-FIDELITY PDF IMPORT
// =====================================================================
async function computeFileSha256(file) {
    if (!file) return null;
    try {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.warn('Crypto SHA-256 error:', e);
        return null;
    }
}

function processAndOpenPdf(file) {
    const cleanTitle = file.name.replace(/\.pdf$/i, '');
    const fileUrl = URL.createObjectURL(file);
    const docId = 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

    const newDoc = {
        id: docId,
        fileHash: null,
        title: cleanTitle.length > 36 ? cleanTitle.substring(0, 33) + '...' : cleanTitle,
        fullTitle: file.name,
        fileUrl: fileUrl,
        file: file,
        pageCount: 1,
        prebakeContext: null,
        storagePath: null
    };

    hubDocuments.unshift(newDoc);
    renderHubDocuments();

    openDocumentInTab(newDoc);
    showHubToast(`Loaded "${newDoc.title}" in Smart Reader`);

    // Asynchronously fingerprint file and resolve prebake
    computeFileSha256(file).then(hash => {
        if (hash) {
            newDoc.fileHash = hash;
            const tab = openTabs.find(t => t.id === newDoc.id);
            if (tab) tab.fileHash = hash;
            resolveDocumentPrebake(newDoc);
        }
    });
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
                            <span class="truncate">${escapeHtml(tab.title)}</span>
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
                 title="${escapeHtml(tab.fullTitle || tab.title)} (Drag left/right to reorder)">
                <span class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-readitGreen' : 'bg-white/30'} shrink-0 reader-tab-indicator pointer-events-none"></span>
                <span class="truncate max-w-[130px] sm:max-w-[170px] pointer-events-none">${escapeHtml(tab.title)}</span>
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
            fileHash: doc.fileHash || null,
            title: doc.title,
            fullTitle: doc.fullTitle || doc.title,
            fileUrl: doc.fileUrl,
            file: doc.file,
            pageCount: doc.pageCount || 1,
            prebakeContext: doc.prebakeContext || null,
            storagePath: doc.storagePath || null,
            isDemo: doc.isDemo || false
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

async function openSmartReader(docIdentifier) {
    let targetDoc = hubDocuments.find(d => d.id === docIdentifier || d.title.toLowerCase() === docIdentifier.toLowerCase());
    if (!targetDoc) return;

    // If document is stored in cloud and hasn't been downloaded locally yet
    const effectiveStoragePath = targetDoc.storagePath || (targetDoc.isDemo ? null : (currentUser && targetDoc.fileHash ? `${currentUser.id}/${targetDoc.fileHash}.pdf` : null));
    if (targetDoc.isCloudOnly && effectiveStoragePath && !targetDoc.fileUrl) {
        const sb = getSupabase();
        let downloadedBlob = null;
        if (sb) {
            showHubToast(targetDoc.isDemo ? 'Opening demo paper from Supabase...' : 'Downloading paper from cloud storage...');
            try {
                const { data: blob, error } = await sb.storage.from('papers').download(effectiveStoragePath);
                if (blob && !error) {
                    downloadedBlob = blob;
                } else if (error) {
                    console.warn('Storage download error:', error.message);
                }
            } catch (err) {
                console.warn('Storage download error:', err);
            }
        }

        // Offline or fallback to static asset for demo paper
        if (!downloadedBlob && targetDoc.demoFallbackUrl) {
            try {
                const res = await fetch(targetDoc.demoFallbackUrl);
                if (res.ok) {
                    downloadedBlob = await res.blob();
                }
            } catch (fetchErr) {
                console.warn('Demo fallback fetch error:', fetchErr);
            }
        }

        if (downloadedBlob) {
            targetDoc.file = downloadedBlob;
            targetDoc.fileUrl = URL.createObjectURL(downloadedBlob);
            targetDoc.isCloudOnly = false;
        } else {
            showHubToast('Could not load paper. Please check connection.');
            return;
        }
    }

    openDocumentInTab(targetDoc);
}

function closeSmartReader() {
    const readerView = document.getElementById('hub-reader-view');
    const dashView = document.getElementById('hub-dashboard-view');
    const mobileHeader = document.getElementById('hub-mobile-header');

    // 1. Record last read page on the active tab and sync to Supabase
    const activeTab = openTabs.find(t => t.id === activeTabId);
    if (activeTab && currentPdf) {
        activeTab.lastReadPage = currentPageNum;
        activeTab.progressPct = Math.round((currentPageNum / totalPages) * 100);

        const hubDoc = hubDocuments.find(d => d.id === activeTab.id || (activeTab.fileHash && d.fileHash === activeTab.fileHash));
        if (hubDoc) {
            hubDoc.lastReadPage = currentPageNum;
            hubDoc.progressPct = activeTab.progressPct;
        }
        renderHubDocuments();

        // If signed in, update user_documents on Supabase
        const sb = getSupabase();
        if (sb && isLoggedIn && currentUser && activeTab.fileHash) {
            sb.from('user_documents')
                .update({
                    last_read_page: currentPageNum,
                    progress_pct: activeTab.progressPct,
                    last_opened_at: new Date().toISOString()
                })
                .eq('user_id', currentUser.id)
                .eq('file_hash', activeTab.fileHash)
                .then(({ error }) => {
                    if (error) {
                        console.warn('Could not update last_read_page on Supabase:', error.message);
                    } else {
                        console.log(`✅ Synced last_read_page (${currentPageNum}) to Supabase user_documents`);
                    }
                });
        }
    }

    togglePaperSwitcherDrawer(false);
    closeExplanationBottomDrawer();
    dismissExplanationPeek();

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
    updateStarButtonsUI();
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
    currentLang: currentReaderLang,
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

// =====================================================================
// CLOUD STORAGE & PREBAKE CONTEXT RESOLUTION (PDF_PARSER + SUPABASE CACHE)
// =====================================================================

function isSuspiciousTitle(t) {
    if (!t || typeof t !== 'string' || t.trim().length < 4) return true;
    const clean = t.trim().toLowerCase();
    if (clean.startsWith('type ') || clean.startsWith('type:') || clean.startsWith('published')) return true;
    if (clean.startsWith('article type') || clean.startsWith('section:')) return true;
    return ['article', 'review', 'methods', 'untitled', 'untitled research paper', 'research article'].includes(clean);
}

async function loadUserLibraryFromSupabase() {
    const sb = getSupabase();
    if (!sb || !isLoggedIn || !currentUser) {
        await loadDemoPaper();
        return;
    }

    try {
        const { data, error } = await sb
            .from('user_documents')
            .select(`
                id,
                custom_title,
                last_read_page,
                progress_pct,
                last_opened_at,
                file_hash,
                documents (
                    file_hash,
                    title,
                    authors,
                    doi,
                    page_count,
                    prebake_context,
                    storage_path
                )
            `)
            .order('last_opened_at', { ascending: false });

        if (error) {
            console.warn('Could not load user library from Supabase:', error.message);
            return;
        }

        if (data && data.length > 0) {
            for (const item of data) {
                const docMeta = item.documents || {};
                const hash = item.file_hash;
                const existing = hubDocuments.find(d => d.fileHash === hash);
                let paperTitle = item.custom_title || docMeta.title || 'Cloud Paper';
                if (isSuspiciousTitle(paperTitle)) {
                    if (docMeta.prebake_context && docMeta.prebake_context.title && !isSuspiciousTitle(docMeta.prebake_context.title)) {
                        paperTitle = docMeta.prebake_context.title;
                    }
                }

                if (!existing) {
                    hubDocuments.push({
                        id: 'cloud-' + item.id,
                        fileHash: hash,
                        title: paperTitle,
                        fullTitle: docMeta.title || paperTitle,
                        pageCount: docMeta.page_count || 1,
                        lastReadPage: item.last_read_page || 1,
                        progressPct: item.progress_pct || 0,
                        storagePath: (docMeta.is_demo_file || (docMeta.storage_path && docMeta.storage_path.startsWith('demo/')))
                            ? docMeta.storage_path
                            : `${currentUser.id}/${hash}.pdf`,
                        prebakeContext: docMeta.prebake_context,
                        isCloudOnly: true
                    });
                } else {
                    existing.lastReadPage = item.last_read_page || existing.lastReadPage || 1;
                    existing.progressPct = item.progress_pct || existing.progressPct || 0;
                    if (isSuspiciousTitle(existing.title)) {
                        existing.title = paperTitle;
                        existing.fullTitle = paperTitle;
                    }
                }
            }
            renderHubDocuments();
        }
    } catch (e) {
        console.warn('loadUserLibraryFromSupabase error:', e);
    } finally {
        await loadDemoPaper();
    }
}

async function saveNewDocumentToCloud(doc, file, parsedData) {
    const sb = getSupabase();
    if (!sb || !isLoggedIn || !currentUser) return;

    const fileHash = doc.fileHash || parsedData.file_hash;
    if (!fileHash) return;
    const storagePath = `${currentUser.id}/${fileHash}.pdf`;

    const prebakeTitle = (parsedData.prebake_context && parsedData.prebake_context.title) || '';
    let finalTitle = parsedData.title || doc.title || 'Research Paper';
    if (isSuspiciousTitle(finalTitle) && prebakeTitle && !isSuspiciousTitle(prebakeTitle)) {
        finalTitle = prebakeTitle;
    } else if (isSuspiciousTitle(finalTitle) && doc.fullTitle) {
        finalTitle = doc.fullTitle.replace(/\.pdf$/i, '');
    }

    try {
        // 1. Upload PDF to Supabase Storage 'papers' bucket under user's private folder
        if (file) {
            console.log('Uploading PDF to Supabase Storage:', storagePath);
            const { error: uploadError } = await sb.storage
                .from('papers')
                .upload(storagePath, file, {
                    contentType: 'application/pdf',
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) {
                console.warn('Storage upload error:', uploadError.message);
            } else {
                console.log('✅ PDF uploaded to Supabase Storage!');
                doc.storagePath = storagePath;
            }
        }

        // 2. Upsert public.documents (prebake context cached for everyone!)
        const docRecord = {
            file_hash: fileHash,
            storage_path: doc.isDemo ? storagePath : null, // Prevent user UUID leakage in public catalog
            title: finalTitle,
            authors: parsedData.author ? [parsedData.author] : [],
            doi: parsedData.doi || null,
            page_count: parsedData.page_count || doc.pageCount || 1,
            prebake_context: parsedData.prebake_context || null,
            parsed_structure: {
                sentence_count: parsedData.sentence_count || 0
            },
            last_accessed_at: new Date().toISOString()
        };

        const { error: docError } = await sb
            .from('documents')
            .upsert(docRecord, { onConflict: 'file_hash' });

        if (docError) {
            console.warn('Error saving to public.documents:', docError.message);
        }

        // 3. Upsert user_documents (link to current user library)
        const userDocRecord = {
            user_id: currentUser.id,
            file_hash: fileHash,
            custom_title: finalTitle,
            last_read_page: doc.lastReadPage || 1,
            progress_pct: doc.progressPct || 0,
            last_opened_at: new Date().toISOString()
        };

        const { error: userDocError } = await sb
            .from('user_documents')
            .upsert(userDocRecord, { onConflict: 'user_id,file_hash' });

        if (userDocError) {
            console.warn('Error saving to user_documents:', userDocError.message);
        } else {
            showHubToast('Synced to your cloud library');
        }
    } catch (err) {
        console.warn('saveNewDocumentToCloud error:', err);
    }
}

async function syncUserDocumentToCloud(doc, fileHash, existingStoragePath) {
    const sb = getSupabase();
    if (!sb || !isLoggedIn || !currentUser) return;

    try {
        let storagePath = existingStoragePath;
        if (doc.file && (!storagePath || !storagePath.startsWith(currentUser.id))) {
            const userStoragePath = `${currentUser.id}/${fileHash}.pdf`;
            const { error: upErr } = await sb.storage
                .from('papers')
                .upload(userStoragePath, doc.file, {
                    contentType: 'application/pdf',
                    cacheControl: '3600',
                    upsert: true
                });
            if (!upErr) {
                storagePath = userStoragePath;
                doc.storagePath = storagePath;
            }
        }

        // Query existing user_documents record to retrieve user's saved last_read_page
        const { data: existingUserDoc } = await sb
            .from('user_documents')
            .select('last_read_page, progress_pct, custom_title')
            .eq('user_id', currentUser.id)
            .eq('file_hash', fileHash)
            .maybeSingle();

        if (existingUserDoc) {
            if (existingUserDoc.last_read_page && !doc.lastReadPage) {
                doc.lastReadPage = existingUserDoc.last_read_page;
                doc.progressPct = existingUserDoc.progress_pct || 0;
            }
            if (existingUserDoc.custom_title && !isSuspiciousTitle(existingUserDoc.custom_title)) {
                doc.title = existingUserDoc.custom_title;
                renderReaderTabs();
                renderHubDocuments();
            }
        } else {
            const finalTitle = !isSuspiciousTitle(doc.title) ? doc.title : (doc.fullTitle ? doc.fullTitle.replace(/\.pdf$/i, '') : 'Research Paper');
            await sb.from('user_documents').insert({
                user_id: currentUser.id,
                file_hash: fileHash,
                custom_title: finalTitle,
                last_read_page: doc.lastReadPage || 1,
                progress_pct: doc.progressPct || 0,
                last_opened_at: new Date().toISOString()
            });
        }
    } catch (err) {
        console.warn('syncUserDocumentToCloud error:', err);
    }
}

async function resolveDocumentPrebake(doc) {
    if (!doc) return;

    const pill = document.getElementById('paper-context-pill');
    const dot = document.getElementById('context-status-dot');
    const label = document.getElementById('context-status-label');

    if (pill) {
        pill.classList.remove('hidden');
        pill.classList.add('flex');
    }

    // If prebake already attached to this document object in memory:
    if (doc.prebakeContext) {
        window.READIT_SYSTEM.paperContext = doc.prebakeContext;
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-readitGreen shrink-0';
        if (label) label.textContent = 'Context: Ready';
        return;
    }

    if (doc.isResolvingPrebake) return;
    doc.isResolvingPrebake = true;

    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0';
    if (label) label.textContent = 'Context: Checking cache...';

    const file = doc.file;
    let fileHash = doc.fileHash;
    if (!fileHash && file) {
        fileHash = await computeFileSha256(file);
        doc.fileHash = fileHash;
    }

    const sb = getSupabase();

    // 1. Check Supabase database first for existing prebake!
    if (sb && fileHash) {
        try {
            let existingDoc = null;
            const { data: rpcData, error: rpcErr } = await sb.rpc('lookup_document_prebake', { hash_input: fileHash });
            if (!rpcErr && rpcData && rpcData.length > 0) {
                existingDoc = rpcData[0];
            } else {
                const { data, error } = await sb
                    .from('documents')
                    .select('file_hash, title, authors, doi, page_count, prebake_context, storage_path')
                    .eq('file_hash', fileHash)
                    .maybeSingle();
                if (!error && data) {
                    existingDoc = data;
                }
            }

            if (existingDoc && existingDoc.prebake_context) {
                console.log('⚡ Found existing prebake in Supabase for hash:', fileHash);
                window.READIT_SYSTEM.paperContext = existingDoc.prebake_context;
                doc.prebakeContext = existingDoc.prebake_context;

                const prebakeTitle = (existingDoc.prebake_context && existingDoc.prebake_context.title) || '';
                let effectiveTitle = existingDoc.title || '';
                if (isSuspiciousTitle(effectiveTitle) && prebakeTitle && !isSuspiciousTitle(prebakeTitle)) {
                    effectiveTitle = prebakeTitle;
                }
                if (effectiveTitle && !isSuspiciousTitle(effectiveTitle)) {
                    doc.title = effectiveTitle;
                    renderReaderTabs();
                    renderHubDocuments();
                }

                if (dot) dot.className = 'w-2 h-2 rounded-full bg-readitGreen shrink-0';
                if (label) {
                    label.textContent = 'Context: Ready (Cached)';
                    if (pill) {
                        const ctx = existingDoc.prebake_context;
                        pill.title = `Domain: ${ctx.domain || 'N/A'}\nCore Problem: ${ctx.core_problem || 'N/A'}\nMethod: ${ctx.core_method || 'N/A'}`;
                    }
                }

                if (isLoggedIn && currentUser && !doc.isDemo) {
                    await syncUserDocumentToCloud(doc, fileHash, existingDoc.storage_path);
                }
                doc.isResolvingPrebake = false;
                return;
            }
        } catch (sbErr) {
            console.warn('Supabase cache check warning:', sbErr);
        }
    }

    // 2. Not in Supabase cache — Send to backend pdf_parser + LLM prebake
    if (label) label.textContent = 'Context: Parsing PDF...';
    if (!file) {
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-white/40 shrink-0';
        if (label) label.textContent = 'Context: Local';
        doc.isResolvingPrebake = false;
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        const resp = await fetch('/api/documents/parse', {
            method: 'POST',
            body: formData
        });

        if (!resp.ok) {
            throw new Error(`Parse failed HTTP ${resp.status}`);
        }

        const parsedData = await resp.json();
        console.log('✅ PDF parsed via pdf_parser:', parsedData);

        if (parsedData.file_hash && !doc.fileHash) {
            doc.fileHash = parsedData.file_hash;
        }

        const prebake = parsedData.prebake_context;
        if (prebake) {
            window.READIT_SYSTEM.paperContext = prebake;
            doc.prebakeContext = prebake;
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-readitGreen shrink-0';
            if (label) {
                label.textContent = 'Context: Ready';
                if (pill) {
                    pill.title = `Domain: ${prebake.domain || 'N/A'}\nCore Problem: ${prebake.core_problem || 'N/A'}\nMethod: ${prebake.core_method || 'N/A'}`;
                }
            }
        }

        const prebakeTitle = (prebake && prebake.title) || '';
        let effectiveTitle = parsedData.title || '';
        if (isSuspiciousTitle(effectiveTitle) && prebakeTitle && !isSuspiciousTitle(prebakeTitle)) {
            effectiveTitle = prebakeTitle;
        } else if (isSuspiciousTitle(effectiveTitle) && doc.fullTitle) {
            effectiveTitle = doc.fullTitle.replace(/\.pdf$/i, '');
        }

        if (effectiveTitle && !isSuspiciousTitle(effectiveTitle)) {
            doc.title = effectiveTitle;
            renderReaderTabs();
            renderHubDocuments();
        }

        // 3. If logged in, upload PDF to Supabase Storage and cache prebake in Supabase DB
        if (isLoggedIn && currentUser && sb && !doc.isDemo) {
            await saveNewDocumentToCloud(doc, file, parsedData);
        }
    } catch (parseErr) {
        console.warn('pdf_parser prebake failed, fallback active:', parseErr);
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-white/40 shrink-0';
        if (label) label.textContent = 'Context: Local';
    } finally {
        doc.isResolvingPrebake = false;
    }
}

// Backwards compatibility alias
const prebakePaperContext = resolveDocumentPrebake;

async function loadPdfDocument(urlOrData) {
    try {
        const loadingTask = pdfjsLib.getDocument(urlOrData);
        currentPdf = await loadingTask.promise;
        totalPages = currentPdf.numPages;

        const activeTab = openTabs.find(t => t.id === activeTabId);
        if (activeTab) {
            activeTab.pageCount = totalPages;
            // Restore last read page if available
            if (activeTab.lastReadPage && activeTab.lastReadPage >= 1 && activeTab.lastReadPage <= totalPages) {
                currentPageNum = activeTab.lastReadPage;
            } else {
                currentPageNum = 1;
            }
            renderReaderTabs();
        } else {
            currentPageNum = 1;
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

        // Resolve prebake context from Supabase cache or backend pdf_parser
        if (activeTab) {
            resolveDocumentPrebake(activeTab);
        }

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

    closeExplanationBottomDrawer();
    dismissExplanationPeek();

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
    updateStarButtonsUI(window.READIT_SYSTEM.activeFeature);
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
function toggleReaderLang() {
    const nextLang = (currentReaderLang === 'en') ? 'id' : 'en';
    setReaderLang(nextLang, true);
    showHubToast(`Switched breakdown language to ${nextLang === 'id' ? 'Bahasa Indonesia' : 'Simple English'}`);
}

async function setReaderLang(lang, shouldPersist = true) {
    if (!['en', 'id'].includes(lang)) return;
    currentReaderLang = lang;
    if (window.READIT_SYSTEM) {
        window.READIT_SYSTEM.currentLang = lang;
    }
    localStorage.setItem('readit_target_language', lang);

    const floatEn = document.getElementById('floating-lang-en');
    const floatId = document.getElementById('floating-lang-id');
    const langBadge = document.getElementById('inspector-lang-badge');
    const ideaLangTag = document.getElementById('idea-lang-tag');
    const floatingLangLabel = document.getElementById('floating-lang-label');

    if (floatingLangLabel) {
        floatingLangLabel.textContent = lang.toUpperCase();
    }

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

    // Persist to Supabase public.user_preferences if requested and logged in
    if (shouldPersist && isLoggedIn && currentUser && currentUser.id) {
        const sb = getSupabase();
        if (sb) {
            try {
                sb.from('user_preferences')
                    .upsert({
                        user_id: currentUser.id,
                        target_language: lang,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' })
                    .then(({ error }) => {
                        if (error) console.warn('Failed to persist user_preferences:', error.message);
                        else console.log('✅ Language preference persisted to Supabase:', lang);
                    });
            } catch (err) {
                console.warn('Error in setReaderLang persistence:', err);
            }
        }
    }

    if (window.READIT_SYSTEM) {
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
        if (typeof updateStarButtonsUI === 'function') {
            updateStarButtonsUI(window.READIT_SYSTEM.activeFeature);
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
    updateStarButtonsUI(feature);
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
    const bottomDrawer = document.getElementById('bottom-explanation-drawer');
    const bottomContent = document.getElementById('bottom-drawer-content');
    if (isLoading && bottomDrawer && bottomDrawer.classList.contains('drawer-open') && bottomContent) {
        bottomContent.innerHTML = `
            <div class="space-y-3 p-2">
                <div class="h-4 bg-white/10 rounded-md w-3/4 animate-pulse"></div>
                <div class="h-20 bg-white/5 rounded-xl border border-white/10 animate-pulse"></div>
                <div class="h-20 bg-white/5 rounded-xl border border-white/10 animate-pulse"></div>
            </div>
        `;
    }

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

    updateStarButtonsUI(feature);
    renderBottomDrawerContent(feature, result);
    triggerExplanationBump(feature);
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

// =====================================================================
// SUPABASE SAVED INSIGHTS (STAR / BOOKMARK) CONTROLLER
// Persisted in public.user_saved_insights (with local fallback)
// =====================================================================
let userSavedInsights = [];

function updateStarButtonsVisibility(show) {
    const shouldShow = (typeof show === 'boolean') ? show : (isLoggedIn && !!currentUser);
    const btns = [
        document.getElementById('btn-star-translating_idea'),
        document.getElementById('btn-star-quick_reference'),
        document.getElementById('btn-star-easy_citation'),
        document.getElementById('btn-star-bottom-drawer')
    ];

    btns.forEach(btn => {
        if (!btn) return;
        if (shouldShow) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    });
}

function getCurrentDocumentFileHash() {
    const activeTab = (typeof openTabs !== 'undefined' && Array.isArray(openTabs))
        ? openTabs.find(t => t.id === activeTabId)
        : null;
    let hash = activeTab?.fileHash;
    if (!hash && activeTab?.id) {
        const hubDoc = (typeof hubDocuments !== 'undefined' && Array.isArray(hubDocuments))
            ? hubDocuments.find(d => d.id === activeTab.id)
            : null;
        hash = hubDoc?.fileHash;
    }
    if (!hash && activeTab && (activeTab.isDemo || activeTab.id === 'demo-paper')) {
        hash = DEMO_PAPER_CONFIG.fileHash;
    }
    if (!hash && window.READIT_SYSTEM?.activeDocHash) {
        hash = window.READIT_SYSTEM.activeDocHash;
    }
    return hash || null;
}

async function loadUserSavedInsightsFromSupabase() {
    if (!isLoggedIn || !currentUser) {
        userSavedInsights = [];
        updateStarButtonsVisibility(false);
        updateStarButtonsUI();
        return;
    }

    updateStarButtonsVisibility(true);

    const sb = getSupabase();
    if (!sb) return;

    try {
        const { data, error } = await sb
            .from('user_saved_insights')
            .select('*')
            .eq('user_id', currentUser.id);

        if (error) {
            console.warn('Error loading user_saved_insights from Supabase:', error.message);
            return;
        }

        userSavedInsights = data || [];
        updateStarButtonsUI();
        if (typeof currentHubTab !== 'undefined' && currentHubTab === 'starred') {
            renderStarredInsightsView();
        }
    } catch (err) {
        console.warn('Failed to load user_saved_insights:', err);
    }
}

function isExplanationStarred(feature) {
    if (!isLoggedIn || !currentUser) return false;
    const feat = feature || window.READIT_SYSTEM?.activeFeature || 'translating_idea';
    const text = (window.READIT_SYSTEM?.selectedText || window.READIT_SYSTEM?.activeCardData?.text || '').trim();
    if (!text) return false;

    const fileHash = getCurrentDocumentFileHash();
    if (!fileHash) return false;

    const normText = text.replace(/\s+/g, ' ');
    return userSavedInsights.some(item =>
        item.user_id === currentUser.id &&
        item.file_hash === fileHash &&
        item.lens_type === feat &&
        (item.selected_text || '').trim().replace(/\s+/g, ' ') === normText
    );
}

async function toggleStarExplanation(feature, event) {
    if (event) {
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (typeof event.preventDefault === 'function') event.preventDefault();
    }

    if (!isLoggedIn || !currentUser) {
        updateStarButtonsVisibility(false);
        openAuthModal('signin');
        return;
    }

    const sb = getSupabase();
    if (!sb) {
        showHubToast('Database connection unavailable');
        return;
    }

    const feat = feature || window.READIT_SYSTEM?.activeFeature || 'translating_idea';
    const lang = window.READIT_SYSTEM?.currentLang || 'en';
    const isID = lang === 'id';
    const selectedText = (window.READIT_SYSTEM?.selectedText || window.READIT_SYSTEM?.activeCardData?.text || '').trim();

    if (!selectedText) {
        showHubToast(isID ? 'Pilih teks terlebih dahulu untuk menyimpan penjelasan' : 'Select text first to star explanation');
        return;
    }

    let fileHash = getCurrentDocumentFileHash();
    const activeTab = (typeof openTabs !== 'undefined' && Array.isArray(openTabs))
        ? openTabs.find(t => t.id === activeTabId)
        : null;

    if (!fileHash && activeTab?.file) {
        fileHash = await computeFileSha256(activeTab.file);
        activeTab.fileHash = fileHash;
    }

    if (!fileHash) {
        showHubToast(isID ? 'Hash berkas tidak ditemukan' : 'Document file hash not found');
        return;
    }

    const pageNum = (typeof currentPageNum === 'number' && currentPageNum > 0)
        ? currentPageNum
        : (activeTab?.lastReadPage || 1);

    const normText = selectedText.replace(/\s+/g, ' ');
    const existingIndex = userSavedInsights.findIndex(item =>
        item.user_id === currentUser.id &&
        item.file_hash === fileHash &&
        item.lens_type === feat &&
        (item.selected_text || '').trim().replace(/\s+/g, ' ') === normText
    );

    if (existingIndex >= 0) {
        // DELETE FROM SUPABASE
        const existingItem = userSavedInsights[existingIndex];
        // Optimistic UI update
        userSavedInsights.splice(existingIndex, 1);
        updateStarButtonsUI(feat);
        if (typeof currentHubTab !== 'undefined' && currentHubTab === 'starred') {
            renderStarredInsightsView();
        }
        showHubToast(isID ? 'Dihapus dari Bintang' : 'Removed from Starred');

        try {
            let deleteQuery = sb.from('user_saved_insights').delete();
            if (existingItem.id && typeof existingItem.id === 'string' && !existingItem.id.startsWith('temp-')) {
                deleteQuery = deleteQuery.eq('id', existingItem.id);
            } else {
                deleteQuery = deleteQuery
                    .eq('user_id', currentUser.id)
                    .eq('file_hash', fileHash)
                    .eq('lens_type', feat)
                    .eq('selected_text', selectedText);
            }

            const { error: deleteError } = await deleteQuery;
            if (deleteError) {
                console.warn('Failed to delete saved insight from Supabase:', deleteError.message);
                // Rollback optimistic update
                userSavedInsights.splice(existingIndex, 0, existingItem);
                updateStarButtonsUI(feat);
                if (typeof currentHubTab !== 'undefined' && currentHubTab === 'starred') {
                    renderStarredInsightsView();
                }
                showHubToast('Error removing insight: ' + deleteError.message);
            }
        } catch (err) {
            console.error('Delete insight error:', err);
            userSavedInsights.splice(existingIndex, 0, existingItem);
            updateStarButtonsUI(feat);
            if (typeof currentHubTab !== 'undefined' && currentHubTab === 'starred') {
                renderStarredInsightsView();
            }
        }
    } else {
        // INSERT INTO SUPABASE
        const cacheKey = `${feat}_${lang}`;
        const cachedResult = window.READIT_SYSTEM?.featureCache?.[cacheKey] || {};
        const formattedCopy = window.READIT_SYSTEM?.copyPayloads?.[feat] || '';
        const docTitle = activeTab?.title || 'Document';

        const insightData = {
            feature: feat,
            language: lang,
            doc_title: docTitle,
            formatted_text: formattedCopy,
            result: cachedResult,
            saved_at: new Date().toISOString()
        };

        const newRecord = {
            user_id: currentUser.id,
            file_hash: fileHash,
            page_number: pageNum,
            selected_text: selectedText,
            lens_type: feat,
            insight_data: insightData
        };

        // Temporary optimistic entry
        const tempId = 'temp-' + Date.now();
        const optimisticItem = { ...newRecord, id: tempId, created_at: new Date().toISOString() };
        userSavedInsights.unshift(optimisticItem);
        updateStarButtonsUI(feat);
        if (typeof currentHubTab !== 'undefined' && currentHubTab === 'starred') {
            renderStarredInsightsView();
        }
        showHubToast(isID ? '⭐ Penjelasan disimpan ke Bintang!' : '⭐ Explanation saved to Starred!');

        try {
            // Defensive: ensure documents table has an entry for file_hash to satisfy foreign key constraint
            const { data: docExists } = await sb
                .from('documents')
                .select('file_hash')
                .eq('file_hash', fileHash)
                .maybeSingle();

            if (!docExists) {
                await sb.from('documents').upsert({
                    file_hash: fileHash,
                    title: docTitle,
                    page_count: totalPages || 1,
                    last_accessed_at: new Date().toISOString()
                }, { onConflict: 'file_hash' });
            }

            const { data: insertedData, error: insertError } = await sb
                .from('user_saved_insights')
                .insert(newRecord)
                .select()
                .single();

            if (insertError) {
                console.warn('Failed to insert saved insight to Supabase:', insertError.message);
                const idx = userSavedInsights.findIndex(i => i.id === tempId);
                if (idx >= 0) userSavedInsights.splice(idx, 1);
                updateStarButtonsUI(feat);
                showHubToast('Error saving insight: ' + insertError.message);
            } else if (insertedData) {
                const idx = userSavedInsights.findIndex(i => i.id === tempId);
                if (idx >= 0) {
                    userSavedInsights[idx] = insertedData;
                }
            }
        } catch (err) {
            console.error('Insert insight error:', err);
            const idx = userSavedInsights.findIndex(i => i.id === tempId);
            if (idx >= 0) userSavedInsights.splice(idx, 1);
            updateStarButtonsUI(feat);
        }
    }
}

function updateStarButtonsUI(feature) {
    if (!isLoggedIn || !currentUser) {
        updateStarButtonsVisibility(false);
        return;
    }

    updateStarButtonsVisibility(true);

    const feat = feature || window.READIT_SYSTEM?.activeFeature || 'translating_idea';
    const isID = window.READIT_SYSTEM?.currentLang === 'id';
    const currentActiveFeatureStarred = isExplanationStarred(feat);

    const btnMap = {
        'translating_idea': { btn: 'btn-star-translating_idea', label: 'star-idea-label' },
        'quick_reference': { btn: 'btn-star-quick_reference', label: 'star-quickref-label' },
        'easy_citation': { btn: 'btn-star-easy_citation', label: 'star-citation-label' }
    };

    // Update desktop buttons
    Object.keys(btnMap).forEach(f => {
        const item = btnMap[f];
        const btn = document.getElementById(item.btn);
        const lbl = document.getElementById(item.label);
        const starred = isExplanationStarred(f);

        if (btn) {
            if (starred) {
                btn.classList.add('star-btn-active');
                btn.setAttribute('title', isID ? 'Hapus dari Bintang' : 'Remove from Starred');
            } else {
                btn.classList.remove('star-btn-active');
                btn.setAttribute('title', isID ? 'Simpan ke Bintang' : 'Save / Star this breakdown');
            }
        }
        if (lbl) {
            lbl.textContent = starred ? (isID ? 'Tersimpan' : 'Saved') : (isID ? 'Bintang' : 'Star');
        }
    });

    // Update mobile drawer star button
    const mobileBtn = document.getElementById('btn-star-bottom-drawer');
    const mobileLbl = document.getElementById('star-bottom-drawer-label');
    if (mobileBtn) {
        if (currentActiveFeatureStarred) {
            mobileBtn.classList.add('star-btn-active');
            mobileBtn.setAttribute('title', isID ? 'Hapus dari Bintang' : 'Remove from Starred');
        } else {
            mobileBtn.classList.remove('star-btn-active');
            mobileBtn.setAttribute('title', isID ? 'Simpan ke Bintang' : 'Save / Star this breakdown');
        }
    }
    if (mobileLbl) {
        mobileLbl.textContent = currentActiveFeatureStarred ? (isID ? 'Tersimpan' : 'Saved') : (isID ? 'Bintang' : 'Star');
    }
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

// =====================================================================
// MOBILE BOTTOM EXPLANATION DRAWER & BUMP ANIMATION CONTROLLER
// =====================================================================
function triggerExplanationBump(feature) {
    if (window.innerWidth >= 1024) return;
    const isID = window.READIT_SYSTEM.currentLang === 'id';
    const peek = document.getElementById('bottom-explanation-peek');
    const peekBtn = document.getElementById('peek-capsule-btn');
    const pulseDot = document.getElementById('peek-pulse-dot');
    const solidDot = document.getElementById('peek-solid-dot');
    const iconEl = document.getElementById('peek-feature-icon');
    const labelEl = document.getElementById('peek-feature-label');
    const actionLabel = document.getElementById('peek-action-label');
    const drawer = document.getElementById('bottom-explanation-drawer');

    // If bottom drawer is already open, keep peek capsule hidden
    if (drawer && drawer.classList.contains('drawer-open')) {
        if (peek) peek.classList.add('hidden');
        return;
    }

    if (!peek) return;

    let icon = '⚡';
    let title = isID ? 'Ide Inti Siap' : 'Core Idea Ready';
    let dotColor = 'bg-readitGreen';
    let borderClass = 'border-readitGreen/40 hover:border-readitGreen shadow-[0_12px_36px_rgba(0,0,0,0.85),0_0_20px_rgba(74,222,128,0.25)]';

    if (feature === 'quick_reference') {
        icon = '🔍';
        title = isID ? 'Rujukan Cepat Siap' : 'Quick Ref Ready';
        dotColor = 'bg-amber-400';
        borderClass = 'border-amber-400/40 hover:border-amber-400 shadow-[0_12px_36px_rgba(0,0,0,0.85),0_0_20px_rgba(251,191,36,0.25)]';
    } else if (feature === 'easy_citation') {
        icon = '📚';
        title = isID ? 'Sitasi Mudah Siap' : 'Easy Citation Ready';
        dotColor = 'bg-sky-400';
        borderClass = 'border-sky-400/40 hover:border-sky-400 shadow-[0_12px_36px_rgba(0,0,0,0.85),0_0_20px_rgba(56,189,248,0.25)]';
    }

    if (iconEl) iconEl.textContent = icon;
    if (labelEl) labelEl.textContent = title;
    if (actionLabel) actionLabel.textContent = isID ? 'Ketuk buka' : 'Tap to open';

    if (pulseDot) pulseDot.className = `absolute w-3 h-3 rounded-full ${dotColor} animate-ping opacity-75`;
    if (solidDot) solidDot.className = `relative w-2 h-2 rounded-full ${dotColor}`;

    if (peekBtn) {
        peekBtn.className = `flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#1A1A1A]/95 backdrop-blur-xl border ${borderClass} text-white cursor-pointer select-none group transition-all active:scale-95 touch-manipulation min-h-[44px]`;
    }

    // Trigger bump animation from bottom (spring physics)
    peek.classList.remove('hidden');
    peek.classList.remove('animate-explanation-bump');
    void peek.offsetWidth; // Force DOM reflow to replay CSS keyframe
    peek.classList.add('animate-explanation-bump');
}

function openExplanationBottomDrawer() {
    if (window.innerWidth >= 1024) return;
    const drawer = document.getElementById('bottom-explanation-drawer');
    const backdrop = document.getElementById('bottom-explanation-backdrop');
    const peek = document.getElementById('bottom-explanation-peek');

    if (peek) peek.classList.add('hidden');
    if (backdrop) {
        backdrop.classList.remove('hidden');
        void backdrop.offsetWidth;
        backdrop.classList.add('backdrop-active');
    }
    if (drawer) {
        drawer.classList.add('drawer-open');
    }

    setDrawerSnapState(currentDrawerSnap || 'medium');
    syncBottomDrawerTabs(window.READIT_SYSTEM.activeFeature || 'translating_idea');
}

function closeExplanationBottomDrawer() {
    const drawer = document.getElementById('bottom-explanation-drawer');
    const backdrop = document.getElementById('bottom-explanation-backdrop');
    const peek = document.getElementById('bottom-explanation-peek');

    if (drawer) drawer.classList.remove('drawer-open');
    if (backdrop) {
        backdrop.classList.remove('backdrop-active');
        setTimeout(() => {
            if (!drawer || !drawer.classList.contains('drawer-open')) {
                backdrop.classList.add('hidden');
            }
        }, 300);
    }

    // If an active explanation card exists, restore peek capsule so user can easily re-open (mobile only)
    if (window.READIT_SYSTEM.activeCard && window.READIT_SYSTEM.activeCardData && window.innerWidth < 1024) {
        if (peek) {
            peek.classList.remove('hidden');
            peek.classList.remove('animate-explanation-bump');
        }
    }
}

function dismissExplanationPeek(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const peek = document.getElementById('bottom-explanation-peek');
    if (peek) {
        peek.classList.add('hidden');
        peek.classList.remove('animate-explanation-bump');
    }
}

function syncBottomDrawerTabs(activeFeature) {
    const tabs = ['translating_idea', 'quick_reference', 'easy_citation'];
    tabs.forEach(t => {
        const btn = document.getElementById(`bottom-tab-${t}`);
        if (!btn) return;
        if (t === activeFeature) {
            btn.className = 'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 bg-readitGreen text-black shadow-sm touch-manipulation min-h-[36px]';
        } else {
            const isCitation = t === 'easy_citation';
            const textClass = isCitation ? 'text-sky-300' : 'text-white/70';
            btn.className = `flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 ${textClass} hover:text-white bg-transparent touch-manipulation min-h-[36px]`;
        }
    });

    const hasCitations = window.READIT_SYSTEM.activeCardData?.citations?.length > 0;
    const tabCitation = document.getElementById('bottom-tab-easy_citation');
    if (tabCitation) {
        if (hasCitations) {
            tabCitation.classList.remove('hidden');
        } else {
            tabCitation.classList.add('hidden');
        }
    }
}

function switchBottomDrawerFeature(feature) {
    syncBottomDrawerTabs(feature);
    switchFeatureDrawer(feature);
}

function copyBottomDrawerContent() {
    const feature = window.READIT_SYSTEM.activeFeature || 'translating_idea';
    const text = window.READIT_SYSTEM.copyPayloads[feature];
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const label = document.getElementById('copy-bottom-drawer-label');
        if (label) {
            const original = label.textContent;
            label.textContent = 'Copied!';
            setTimeout(() => { label.textContent = original; }, 1500);
        }
    });
}

function renderBottomDrawerContent(feature, result) {
    const isID = window.READIT_SYSTEM.currentLang === 'id';
    const contentEl = document.getElementById('bottom-drawer-content');
    const headerTitle = document.getElementById('drawer-feature-title');
    const headerIcon = document.getElementById('drawer-feature-icon');
    const langBadge = document.getElementById('drawer-lang-badge');

    if (langBadge) {
        langBadge.textContent = isID ? 'ID' : 'EN';
        langBadge.className = isID
            ? 'font-monoFeature text-[10px] px-2 py-0.5 rounded bg-readitGreen/15 text-readitGreen border border-readitGreen/30'
            : 'font-monoFeature text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-readitGreen border border-white/10';
    }

    syncBottomDrawerTabs(feature);

    const selectedSentence = window.READIT_SYSTEM.selectedText || window.READIT_SYSTEM.activeCardData?.text || '';

    let quoteHtml = '';
    if (selectedSentence) {
        quoteHtml = `
            <div class="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white/80 leading-relaxed font-sans">
                <span class="text-[10px] uppercase font-monoFeature tracking-wider text-white/40 block mb-1">${isID ? 'Teks Terpilih' : 'Selected Passage'}</span>
                “${escapeHtml(selectedSentence)}”
            </div>
        `;
    }

    if (feature === 'translating_idea') {
        if (headerTitle) headerTitle.textContent = isID ? 'Ide & Tindakan Inti' : 'Core Idea Deconstruction';
        if (headerIcon) headerIcon.textContent = '⚡';

        let coreAction = (result.core_action || '').trim();
        let plainMeaning = (result.plain_meaning || '').trim();
        let takeaway = (result.takeaway || '').trim();
        let contextLink = (result.context_link || '').trim();

        if (!coreAction && result.explanation) {
            const raw = result.explanation;
            const actionMatch = raw.match(/\\*\\*⚡?\\s*(?:CORE ACTION|TINDAKAN INTI)\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*📖|\\*\\*PLAIN|\\*\\*BAHASA|$)/i);
            const plainMatch = raw.match(/\\*\\*📖?\\s*(?:PLAIN ENGLISH|PLAIN LANGUAGE|BAHASA SEDERHANA)\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*🎯|\\*\\*WHY|\\*\\*MENGAPA|$)/i);
            const takeMatch = raw.match(/\\*\\*🎯?\\s*(?:WHY IT MATTERS|MENGAPA INI PENTING)\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*🔒|\\*\\*CONTEXT|\\*\\*KONTEKS|$)/i);
            const anchorMatch = raw.match(/\\*\\*🔒?\\s*(?:CONTEXT ANCHOR|JANGKAR KONTEKS)\\*\\*\\s*([\\s\\S]*?)$/i);

            if (actionMatch) coreAction = actionMatch[1].trim();
            if (plainMatch) plainMeaning = plainMatch[1].trim();
            if (takeMatch) takeaway = takeMatch[1].replace(/^[•\\-\\*]\\s*/, '').trim();
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

        if (contentEl) {
            contentEl.innerHTML = `
                ${quoteHtml}
                <!-- Core Action -->
                <div class="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/25 space-y-1">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <span>⚡</span>
                        <span>${isID ? 'Tindakan Inti (Aktor → Aksi → Hasil)' : 'Core Action (Actor → Action → Outcome)'}</span>
                    </div>
                    <p class="text-xs sm:text-sm font-medium text-emerald-100 leading-snug select-text">${escapeHtml(coreAction)}</p>
                </div>
                <!-- Plain Meaning -->
                <div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                        <span>📖</span>
                        <span>${isID ? 'Bahasa Sederhana (Tanpa Pangkas Batasan)' : 'Plain Language (0 Dropped Constraints)'}</span>
                    </div>
                    <p class="text-xs sm:text-sm text-white/90 leading-relaxed select-text font-sans">${escapeHtml(plainMeaning)}</p>
                </div>
                <!-- Why It Matters -->
                <div class="p-3.5 rounded-xl bg-sky-950/25 border border-sky-500/25 space-y-1">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                        <span>🎯</span>
                        <span>${isID ? 'Mengapa Ini Penting?' : 'Why It Matters'}</span>
                    </div>
                    <p class="text-xs sm:text-sm text-sky-100 leading-snug select-text">${escapeHtml(takeaway)}</p>
                </div>
                <!-- Context Anchor -->
                <div class="p-3.5 rounded-xl bg-purple-950/25 border border-purple-500/25 space-y-1">
                    <div class="flex items-center justify-between">
                        <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                            <span>🔒</span>
                            <span>${isID ? 'Jangkar Konteks' : 'Context Anchor'}</span>
                        </div>
                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-200 border border-purple-500/20 font-monoFeature">${isID ? 'Pondasi Makalah' : 'Paper Grounding'}</span>
                    </div>
                    <p class="text-xs sm:text-sm text-purple-100/90 leading-relaxed font-sans select-text">${escapeHtml(contextLink)}</p>
                </div>
            `;
        }

    } else if (feature === 'quick_reference') {
        if (headerTitle) headerTitle.textContent = isID ? 'Rujukan Cepat (Pelaku & Rujukan)' : 'Quick Reference (Actor & Referents)';
        if (headerIcon) headerIcon.textContent = '🔍';

        let realSubject = typeof result.real_subject === 'string' ? result.real_subject : JSON.stringify(result.real_subject || '');
        let activeRewrite = typeof result.active_rewrite === 'string' ? result.active_rewrite : JSON.stringify(result.active_rewrite || '');
        let passiveList = Array.isArray(result.passive_phrases) ? result.passive_phrases : [];
        let antecedents = Array.isArray(result.antecedents) ? result.antecedents : [];

        const passiveHtml = passiveList.length > 0
            ? passiveList.map(phrase => `<span class="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[11px] font-monoFeature">"${escapeHtml(String(phrase))}"</span>`).join('')
            : `<span class="text-white/50 text-[11px] italic">${isID ? 'Tidak ada frasa pasif yang kabur' : 'No ambiguous passive phrases detected'}</span>`;

        const antecedentsHtml = antecedents.length > 0
            ? antecedents.map(item => {
                const term = typeof item === 'object' ? (item.term || item.referent || Object.keys(item)[0]) : String(item);
                const meaning = typeof item === 'object' ? (item.refers_to || item.meaning || item.antecedent || Object.values(item)[0]) : '';
                return `<div class="p-2 rounded-lg bg-white/[0.03] border border-white/08 flex items-start gap-2">
                    <span class="font-monoFeature font-semibold text-readitGreen shrink-0">${escapeHtml(term)}</span>
                    <span class="text-white/40">→</span>
                    <span class="text-white/90 leading-snug">${escapeHtml(meaning)}</span>
                </div>`;
            }).join('')
            : `<span class="text-white/50 text-[11px] italic">${isID ? 'Semua rujukan kata ganti jelas' : 'All referents and pronouns are clear'}</span>`;

        if (contentEl) {
            contentEl.innerHTML = `
                ${quoteHtml}
                <!-- Real Subject / Actor -->
                <div class="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/25 space-y-1">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <span>🎯</span>
                        <span>${isID ? 'Siapa Pelaku Sebenarnya? (Subjek Nyata)' : 'Who Actually Did This? (Real Subject)'}</span>
                    </div>
                    <p class="text-xs sm:text-sm font-medium text-amber-100 leading-snug select-text">${escapeHtml(realSubject || (isID ? 'Penulis / Peneliti studi ini' : 'The study authors / researchers'))}</p>
                </div>
                <!-- Active Rewrite -->
                <div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
                        <span>⚡</span>
                        <span>${isID ? 'Tulis Ulang Kalimat Aktif Langsung' : 'Direct Active Voice Rewrite'}</span>
                    </div>
                    <p class="text-xs sm:text-sm text-white/90 leading-relaxed select-text font-sans">${escapeHtml(activeRewrite || (isID ? 'Penulis melakukan aksi secara langsung.' : 'The authors performed the action directly.'))}</p>
                </div>
                <!-- Passive Phrases -->
                <div class="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                        <span>🧩</span>
                        <span>${isID ? 'Frasa Pasif yang Dideteksi & Diterjemahkan' : 'Passive Phrases Resolved'}</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5">${passiveHtml}</div>
                </div>
                <!-- Antecedents & Referents -->
                <div class="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-1.5">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                        <span>🔗</span>
                        <span>${isID ? 'Rujukan Kata Ganti & Objek Ambigu' : 'Ambiguous Referents & Antecedents'}</span>
                    </div>
                    <div class="space-y-1.5 text-xs">${antecedentsHtml}</div>
                </div>
            `;
        }

    } else if (feature === 'easy_citation') {
        if (headerTitle) headerTitle.textContent = isID ? 'Sitasi Mudah' : 'Easy Citation Context';
        if (headerIcon) headerIcon.textContent = '📚';

        const citLabel = result.citation_label || (window.READIT_SYSTEM.activeCardData?.citations?.[0] || '[1]');
        const refTitle = result.reference_title || (isID ? 'Daftar Pustaka Makalah (Rujukan Terindeks)' : 'Paper Reference Bibliography');
        const supportingClaim = result.supporting_claim || (isID ? 'Klaim utama kalimat ini didasarkan pada rujukan tersebut.' : 'Sentence claim is substantiated by this literature.');
        const whyCited = result.why_cited || (isID ? 'Dikutip untuk memperkuat bukti empiris dari premis penelitian.' : 'Cited to substantiate the empirical claim in this study.');

        if (contentEl) {
            contentEl.innerHTML = `
                ${quoteHtml}
                <!-- Reference Title -->
                <div class="p-3.5 rounded-xl bg-sky-950/25 border border-sky-500/25 space-y-1">
                    <div class="flex items-center justify-between">
                        <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                            <span>🏷️</span>
                            <span>${isID ? 'Karya Ilmiah yang Dikutip' : 'Cited Work / Foundation'}</span>
                        </div>
                        <span class="text-[10px] font-monoFeature px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-200 border border-sky-400/25">${escapeHtml(citLabel)}</span>
                    </div>
                    <p class="text-xs sm:text-sm font-medium text-sky-100 leading-snug select-text">${escapeHtml(refTitle)}</p>
                </div>
                <!-- Supporting Claim -->
                <div class="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
                        <span>📌</span>
                        <span>${isID ? 'Klaim Makalah yang Didukung Sitasi' : 'Supporting Claim Grounded on Citation'}</span>
                    </div>
                    <p class="text-xs sm:text-sm text-white/90 leading-relaxed select-text font-sans">${escapeHtml(supportingClaim)}</p>
                </div>
                <!-- Why Authors Cited This -->
                <div class="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 space-y-1">
                    <div class="text-[10px] font-monoFeature font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <span>💡</span>
                        <span>${isID ? 'Alasan Penulis Mengutip Rujukan Ini' : 'Why the Authors Cited This'}</span>
                    </div>
                    <p class="text-xs sm:text-sm text-emerald-100/90 leading-relaxed select-text font-sans">${escapeHtml(whyCited)}</p>
                </div>
            `;
        }
    }
    updateStarButtonsUI(feature);
}

let isDraggingDrawer = false;
let drawerDragStartY = 0;
let drawerInitialHeight = 0;
let currentDrawerSnap = 'medium'; // 'small' | 'medium' | 'full'

function setDrawerSnapState(snap) {
    if (!['small', 'medium', 'full'].includes(snap)) snap = 'medium';
    currentDrawerSnap = snap;
    const sheet = document.getElementById('bottom-drawer-sheet');
    const icon = document.getElementById('drawer-size-icon');
    const toggleBtn = document.getElementById('btn-toggle-drawer-snap');
    if (!sheet) return;

    sheet.style.height = ''; // clear any inline height from dragging
    sheet.classList.remove('drawer-snap-small', 'drawer-snap-medium', 'drawer-snap-full');
    sheet.classList.add(`drawer-snap-${snap}`);

    if (icon) {
        icon.textContent = snap === 'full' ? '⤡' : '⤢';
    }
    if (toggleBtn) {
        toggleBtn.title = snap === 'full' ? 'Make smaller' : 'Cover whole screen';
    }
}

function toggleDrawerSnapSize() {
    if (currentDrawerSnap === 'full') {
        setDrawerSnapState('small');
    } else {
        setDrawerSnapState('full');
    }
}

function setupDrawerTouchGestures() {
    const header = document.getElementById('bottom-drawer-header');
    const sheet = document.getElementById('bottom-drawer-sheet');
    if (!header || !sheet) return;

    const onDragStart = (clientY) => {
        isDraggingDrawer = true;
        drawerDragStartY = clientY;
        drawerInitialHeight = sheet.getBoundingClientRect().height;
        sheet.style.transition = 'none';
    };

    const onDragMove = (clientY) => {
        if (!isDraggingDrawer) return;
        const deltaY = drawerDragStartY - clientY; // dragging up = positive
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.96, drawerInitialHeight + deltaY));
        sheet.style.height = `${newHeight}px`;

        const backdrop = document.getElementById('bottom-explanation-backdrop');
        if (backdrop && newHeight < 200) {
            backdrop.style.opacity = String(Math.max(0.1, newHeight / 200));
        }
    };

    const onDragEnd = () => {
        if (!isDraggingDrawer) return;
        isDraggingDrawer = false;

        sheet.style.transition = 'height 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
        const finalHeight = sheet.getBoundingClientRect().height;
        const vh = window.innerHeight;

        const backdrop = document.getElementById('bottom-explanation-backdrop');
        if (backdrop) backdrop.style.opacity = '';

        if (finalHeight <= vh * 0.22) {
            closeExplanationBottomDrawer();
        } else if (finalHeight >= vh * 0.74) {
            setDrawerSnapState('full');
        } else if (finalHeight <= vh * 0.48) {
            setDrawerSnapState('small');
        } else {
            setDrawerSnapState('medium');
        }
    };

    // Mobile Touch Drag
    header.addEventListener('touchstart', (e) => {
        if (e.target.closest('button, #bottom-drawer-content, input')) return;
        if (e.touches && e.touches[0]) {
            onDragStart(e.touches[0].clientY);
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (isDraggingDrawer && e.touches && e.touches[0]) {
            onDragMove(e.touches[0].clientY);
        }
    }, { passive: true });

    window.addEventListener('touchend', onDragEnd, { passive: true });

    // Desktop Pointer Drag
    header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, #bottom-drawer-content, input')) return;
        onDragStart(e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
        if (isDraggingDrawer) {
            onDragMove(e.clientY);
        }
    });

    window.addEventListener('pointerup', onDragEnd);
}

// =====================================================================
// PAPER PAGE TURN ON SLIDE UP / SLIDE DOWN CONTROLLER
// =====================================================================
let paperTouchStartY = 0;
let paperTouchStartX = 0;
let paperTouchStartTime = 0;
let isPaperSwiping = false;

function setupPaperSlideGestures() {
    const viewport = document.getElementById('reader-viewport');
    if (!viewport) return;

    viewport.addEventListener('touchstart', (e) => {
        if (!currentPdf || totalPages <= 1) return;
        if (e.target.closest('#bottom-explanation-drawer, #bottom-explanation-peek, #reader-floating-action-bar, #floating-actions-bar, button, a, input')) {
            isPaperSwiping = false;
            return;
        }

        if (e.touches && e.touches.length === 1) {
            paperTouchStartY = e.touches[0].clientY;
            paperTouchStartX = e.touches[0].clientX;
            paperTouchStartTime = Date.now();
            isPaperSwiping = true;
        }
    }, { passive: true });

    viewport.addEventListener('touchend', (e) => {
        if (!isPaperSwiping || !currentPdf) return;
        isPaperSwiping = false;

        // Skip if user was selecting text
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return;

        const touch = e.changedTouches && e.changedTouches[0];
        if (!touch) return;

        const deltaY = paperTouchStartY - touch.clientY; // positive = dragged UP, negative = dragged DOWN
        const deltaX = Math.abs(paperTouchStartX - touch.clientX);
        const timeElapsed = Date.now() - paperTouchStartTime;

        // Require dominant vertical gesture and at least 40px drag
        if (Math.abs(deltaY) < 40 || Math.abs(deltaY) < deltaX * 1.2 || timeElapsed > 1200) {
            return;
        }

        const isAtTop = viewport.scrollTop <= 25;
        const isAtBottom = (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 30);
        const fitsScreen = (viewport.scrollHeight <= viewport.clientHeight + 40);

        if (deltaY > 40) {
            // Slide UP -> Next Page
            if (fitsScreen || isAtBottom) {
                if (currentPageNum < totalPages) {
                    triggerPaperPageTurn(1, 'up');
                }
            }
        } else if (deltaY < -40) {
            // Slide DOWN -> Previous Page
            if (fitsScreen || isAtTop) {
                if (currentPageNum > 1) {
                    triggerPaperPageTurn(-1, 'down');
                }
            }
        }
    }, { passive: true });

    // Also support mouse wheel past edges for desktop users
    let wheelCooldown = false;
    viewport.addEventListener('wheel', (e) => {
        if (!currentPdf || wheelCooldown || totalPages <= 1) return;
        const isAtTop = viewport.scrollTop <= 10;
        const isAtBottom = (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 20);
        const fitsScreen = (viewport.scrollHeight <= viewport.clientHeight + 40);

        if (e.deltaY > 50 && (fitsScreen || isAtBottom)) {
            if (currentPageNum < totalPages) {
                wheelCooldown = true;
                triggerPaperPageTurn(1, 'up');
                setTimeout(() => { wheelCooldown = false; }, 400);
            }
        } else if (e.deltaY < -50 && (fitsScreen || isAtTop)) {
            if (currentPageNum > 1) {
                wheelCooldown = true;
                triggerPaperPageTurn(-1, 'down');
                setTimeout(() => { wheelCooldown = false; }, 400);
            }
        }
    }, { passive: true });
}

function triggerPaperPageTurn(delta, direction) {
    const paperCard = document.getElementById('paper-card');
    const viewport = document.getElementById('reader-viewport');

    if (paperCard) {
        const animClass = direction === 'up' ? 'animate-paper-slide-up' : 'animate-paper-slide-down';
        paperCard.classList.remove('animate-paper-slide-up', 'animate-paper-slide-down');
        void paperCard.offsetWidth; // trigger reflow
        paperCard.classList.add(animClass);
        setTimeout(() => {
            paperCard.classList.remove(animClass);
        }, 320);
    }

    if (viewport) {
        viewport.scrollTop = 0;
    }

    changePage(delta);
}

// Left Sidebar Tab Switcher
let currentHubTab = 'my-docs';

function switchHubTab(tab) {
    if (tab === 'shared-docs' && !isLoggedIn) {
        openAuthModal('signin', 'Sign in to access shared research documents.');
        return;
    }

    currentHubTab = tab || 'my-docs';

    const tabs = ['my-docs', 'shared-docs', 'starred'];
    tabs.forEach(t => {
        const btn = document.getElementById(`hub-nav-${t}`);
        if (!btn) return;
        if (t === currentHubTab) {
            btn.className = "sidebar-nav-btn w-full py-2.5 px-4 rounded-full text-[13.5px] font-medium border border-white/70 text-white bg-white/[0.05] transition flex items-center gap-3 focus:outline-none min-h-[44px] touch-manipulation";
            const icon = btn.querySelector('svg');
            if (icon) {
                if (t === 'starred') icon.className = "w-4 h-4 shrink-0 text-amber-400";
                else icon.className = "w-4 h-4 shrink-0 text-readitGreen";
            }
        } else {
            btn.className = "sidebar-nav-btn w-full py-2.5 px-4 rounded-full text-[13.5px] font-normal border border-white/[0.12] text-white/40 hover:text-white/80 hover:border-white/30 transition flex items-center gap-3 focus:outline-none min-h-[44px] touch-manipulation";
            const icon = btn.querySelector('svg');
            if (icon) icon.className = "w-4 h-4 shrink-0 text-white/50";
        }
    });

    closeSmartReader();

    const recentSection = document.getElementById('hub-recent-section');
    const starredSection = document.getElementById('hub-starred-section');
    const heading = document.getElementById('hub-section-heading');

    if (currentHubTab === 'starred') {
        if (recentSection) recentSection.classList.add('hidden');
        if (starredSection) starredSection.classList.remove('hidden');
        renderStarredInsightsView();
    } else {
        if (starredSection) starredSection.classList.add('hidden');
        if (recentSection) recentSection.classList.remove('hidden');

        if (heading) {
            if (currentHubTab === 'my-docs') {
                heading.textContent = 'Recent Document';
            } else if (currentHubTab === 'shared-docs') {
                heading.textContent = 'Shared Document';
            }
        }
    }
}

function renderStarredInsightsView() {
    const grid = document.getElementById('hub-starred-grid');
    const badge = document.getElementById('starred-count-badge');
    if (!grid) return;

    if (!isLoggedIn || !currentUser) {
        if (badge) badge.textContent = '0';
        grid.innerHTML = `
            <div class="col-span-full py-16 px-4 flex flex-col items-center justify-center text-center">
                <div class="w-14 h-14 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center mb-4 text-2xl">
                    🔒
                </div>
                <h3 class="text-sm sm:text-base font-semibold text-white mb-1.5">Sign In to View Starred Insights</h3>
                <p class="text-xs text-white/50 max-w-sm mb-5 leading-relaxed">
                    Bookmark key sentence breakdowns, core ideas, and cited references across your papers and sync them to your account.
                </p>
                <button onclick="openAuthModal('signin')" class="px-5 py-2.5 rounded-full bg-readitGreen text-black text-xs font-semibold shadow-md hover:bg-emerald-400 transition active:scale-95">
                    Sign in to READit
                </button>
            </div>
        `;
        return;
    }

    if (badge) badge.textContent = String(userSavedInsights.length);

    if (userSavedInsights.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-16 px-4 flex flex-col items-center justify-center text-center">
                <div class="w-14 h-14 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-4 text-2xl">
                    ⭐
                </div>
                <h3 class="text-sm sm:text-base font-semibold text-white mb-1.5">No Starred Insights Yet</h3>
                <p class="text-xs text-white/50 max-w-sm mb-5 leading-relaxed">
                    While reading papers in the Smart Reader, click the Star (★) button on any Core Idea, Quick Reference, or Easy Citation breakdown to save it here.
                </p>
                <button onclick="switchHubTab('my-docs')" class="px-4 py-2 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold border border-white/15 transition">
                    Browse My Documents
                </button>
            </div>
        `;
        return;
    }

    grid.innerHTML = userSavedInsights.map(item => {
        const feat = item.lens_type || 'translating_idea';
        let badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
        let lensIcon = '⚡';
        let lensLabel = 'Core Idea';

        if (feat === 'quick_reference') {
            badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
            lensIcon = '🔍';
            lensLabel = 'Quick Ref';
        } else if (feat === 'easy_citation') {
            badgeClass = 'bg-sky-500/15 text-sky-300 border-sky-500/30';
            lensIcon = '📚';
            lensLabel = 'Easy Citation';
        }

        const data = item.insight_data || {};
        const docTitle = data.doc_title || 'Research Document';
        const pageNum = item.page_number || 1;
        const selectedText = item.selected_text || '';
        const createdDate = item.created_at
            ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Saved';

        let explanationHtml = '';
        if (data.result) {
            const res = data.result;
            if (feat === 'translating_idea') {
                const action = res.core_action || '';
                const meaning = res.plain_meaning || '';
                explanationHtml = `
                    ${action ? `<div class="text-[11px] font-medium text-emerald-300 leading-snug"><span class="text-white/40">Action:</span> ${escapeHtml(action)}</div>` : ''}
                    ${meaning ? `<div class="text-xs text-white/85 leading-relaxed font-sans line-clamp-3">${escapeHtml(meaning)}</div>` : ''}
                `;
            } else if (feat === 'quick_reference') {
                const subject = res.real_subject || '';
                const rewrite = res.active_rewrite || '';
                explanationHtml = `
                    ${subject ? `<div class="text-[11px] font-medium text-amber-300 leading-snug"><span class="text-white/40">Subject:</span> ${escapeHtml(subject)}</div>` : ''}
                    ${rewrite ? `<div class="text-xs text-white/85 leading-relaxed font-sans line-clamp-3">${escapeHtml(rewrite)}</div>` : ''}
                `;
            } else if (feat === 'easy_citation') {
                const title = res.reference_title || '';
                const claim = res.supporting_claim || '';
                explanationHtml = `
                    ${title ? `<div class="text-[11px] font-medium text-sky-300 leading-snug"><span class="text-white/40">Ref:</span> ${escapeHtml(title)}</div>` : ''}
                    ${claim ? `<div class="text-xs text-white/85 leading-relaxed font-sans line-clamp-3">${escapeHtml(claim)}</div>` : ''}
                `;
            }
        }
        if (!explanationHtml && data.formatted_text) {
            explanationHtml = `<div class="text-xs text-white/85 leading-relaxed font-sans line-clamp-4 whitespace-pre-line">${escapeHtml(data.formatted_text)}</div>`;
        }

        return `
            <div class="rounded-2xl bg-[#1C1C1C] border border-white/10 hover:border-amber-400/40 p-4 transition-all duration-200 flex flex-col justify-between space-y-3 shadow-lg group">
                <div class="space-y-2.5">
                    <!-- Top Bar: Badge, Document & Actions -->
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="px-2 py-0.5 rounded-md text-[10px] font-monoFeature font-semibold uppercase tracking-wider border ${badgeClass} shrink-0">
                                ${lensIcon} ${lensLabel}
                            </span>
                            <span class="text-[11px] text-white/50 truncate" title="${escapeHtml(docTitle)}">
                                ${escapeHtml(docTitle)} • p.${pageNum}
                            </span>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                            <button onclick="copySingleStarredInsight('${item.id}', event)" class="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition" title="Copy breakdown">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                </svg>
                            </button>
                            <button onclick="removeSingleStarredInsight('${item.id}', event)" class="p-1.5 rounded-lg text-amber-400 hover:text-red-400 hover:bg-white/[0.08] transition" title="Remove from Starred">
                                <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Selected Passage (Quote) -->
                    <div class="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-white/80 italic font-sans line-clamp-3">
                        “${escapeHtml(selectedText)}”
                    </div>

                    <!-- Breakdown Output -->
                    <div class="space-y-1.5">
                        ${explanationHtml}
                    </div>
                </div>

                <!-- Footer / Open Paper Action -->
                <div class="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-white/40">
                    <span>${createdDate}</span>
                    <button onclick="openPaperAtInsight('${item.file_hash}', ${pageNum}, event)" class="inline-flex items-center gap-1.5 text-readitGreen hover:text-white font-medium transition focus:outline-none">
                        <span>Read on Page ${pageNum}</span>
                        <span>→</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function copySingleStarredInsight(insightId, event) {
    if (event) event.stopPropagation();
    const item = userSavedInsights.find(i => i.id === insightId);
    if (!item) return;
    const data = item.insight_data || {};
    const textToCopy = data.formatted_text || (data.result ? JSON.stringify(data.result, null, 2) : item.selected_text);
    navigator.clipboard.writeText(textToCopy).then(() => {
        showHubToast('Copied insight to clipboard!');
    });
}

async function removeSingleStarredInsight(insightId, event) {
    if (event) event.stopPropagation();
    const existingIndex = userSavedInsights.findIndex(i => i.id === insightId);
    if (existingIndex < 0) return;

    const existingItem = userSavedInsights[existingIndex];
    userSavedInsights.splice(existingIndex, 1);
    renderStarredInsightsView();
    updateStarButtonsUI();
    showHubToast('Removed from Starred');

    const sb = getSupabase();
    if (sb) {
        try {
            await sb.from('user_saved_insights').delete().eq('id', insightId);
        } catch (err) {
            console.warn('Failed to delete insight:', err);
        }
    }
}

async function openPaperAtInsight(fileHash, pageNum, event) {
    if (event) event.stopPropagation();
    let targetDoc = hubDocuments.find(d => d.fileHash === fileHash || d.id === fileHash);
    if (!targetDoc && fileHash === DEMO_PAPER_CONFIG.fileHash) {
        targetDoc = hubDocuments.find(d => d.isDemo);
    }
    const sb = getSupabase();
    if (!targetDoc && sb && isLoggedIn && currentUser) {
        showHubToast('Opening paper from cloud library...');
        await loadUserLibraryFromSupabase();
        targetDoc = hubDocuments.find(d => d.fileHash === fileHash);
    }
    if (!targetDoc) {
        showHubToast('Document not found in current library');
        return;
    }
    targetDoc.lastReadPage = pageNum || 1;
    await openSmartReader(targetDoc.id);
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
    const saveBtn = document.getElementById('btn-save-account-modal');
    if (!modal || !title || !body) return;

    const currentName = currentUser ? (currentUser.name || '') : (localStorage.getItem('readit_guest_name') || 'Guest Scholar');
    const currentLang = currentReaderLang || 'en';

    if (type === 'settings') {
        title.textContent = 'Account Settings';
        if (saveBtn) {
            saveBtn.textContent = 'Save Changes';
            saveBtn.onclick = saveAccountModal;
            saveBtn.classList.remove('hidden');
        }
        body.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-[11px] font-medium text-white/70 mb-1.5">Display Name</label>
                    <input type="text" id="setting-display-name" value="${escapeHtml(currentName)}" class="w-full px-3.5 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/15 text-white text-xs placeholder-white/30 focus:outline-none focus:border-readitGreen transition-colors" placeholder="Enter your display name" />
                    <p class="text-[10px] text-white/40 mt-1">This name will be displayed in your profile and remembered across devices.</p>
                </div>
                <div>
                    <label class="block text-[11px] font-medium text-white/70 mb-1.5">Default Breakdown Language</label>
                    <select id="setting-target-language" class="w-full px-3.5 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/15 text-white text-xs focus:outline-none focus:border-readitGreen transition-colors">
                        <option value="en" ${currentLang === 'en' ? 'selected' : ''}>Simple English (EN)</option>
                        <option value="id" ${currentLang === 'id' ? 'selected' : ''}>Bahasa Indonesia (ID)</option>
                    </select>
                    <p class="text-[10px] text-white/40 mt-1">All new papers and sentence breakdowns will generate in this language by default.</p>
                </div>
                <div class="flex items-center justify-between p-3.5 rounded-xl bg-[#1A1A1A] border border-white/10">
                    <div>
                        <div class="font-medium text-white text-xs">Current Plan</div>
                        <div class="text-[11px] text-white/50">${isLoggedIn ? 'Academic Community (Unlimited Local Lookups)' : 'Guest Mode (Client-Side Only)'}</div>
                    </div>
                    <span class="px-2.5 py-0.5 rounded-full bg-readitGreen/20 text-readitGreen font-semibold text-[10px]">${isLoggedIn ? 'Active' : 'Local'}</span>
                </div>
            </div>
        `;
        setTimeout(() => {
            const input = document.getElementById('setting-display-name');
            if (input) {
                input.focus();
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveAccountModal();
                    }
                });
            }
        }, 50);
    } else if (type === 'preference') {
        title.textContent = 'Reading Preference';
        if (saveBtn) {
            saveBtn.textContent = 'Save Changes';
            saveBtn.onclick = saveAccountModal;
            saveBtn.classList.remove('hidden');
        }
        body.innerHTML = `
            <div class="space-y-4">
                <div>
                    <label class="block text-[11px] font-medium text-white/70 mb-1.5">Default Breakdown Language</label>
                    <select id="setting-target-language" class="w-full px-3.5 py-2.5 rounded-xl bg-[#1A1A1A] border border-white/15 text-white text-xs focus:outline-none focus:border-readitGreen transition-colors">
                        <option value="en" ${currentLang === 'en' ? 'selected' : ''}>Simple English (EN)</option>
                        <option value="id" ${currentLang === 'id' ? 'selected' : ''}>Bahasa Indonesia (ID)</option>
                    </select>
                    <p class="text-[10px] text-white/40 mt-1">All sentence translations, core actions, and syntax breakdowns will generate in this language.</p>
                </div>
                <div class="p-3.5 rounded-xl bg-[#1A1A1A] border border-white/10 text-white/60 text-[11px] leading-relaxed">
                    ${isLoggedIn
                        ? '✨ Preferences automatically sync to your Supabase account and follow you across devices.'
                        : '💡 Sign in to sync your preferred language and reading library across devices.'}
                </div>
            </div>
        `;
    } else {
        title.textContent = 'Privacy and Policy';
        if (saveBtn) {
            saveBtn.textContent = 'Close';
            saveBtn.onclick = closeAccountModal;
        }
        body.innerHTML = `
            <div class="space-y-3 leading-relaxed text-white/70">
                <p>
                    READit processes uploaded academic PDFs locally in your browser session and only sends individual inspected sentences (plus background context anchors) to generate plain-language breakdowns.
                </p>
                <p>
                    When signed in, your uploaded papers are saved privately to your personal storage bucket so you can resume reading across devices. Your manuscripts are never used to train external models.
                </p>
            </div>
        `;
    }

    modal.classList.remove('hidden');
}

function closeAccountModal() {
    const modal = document.getElementById('hub-account-modal');
    if (modal) modal.classList.add('hidden');
}

async function saveAccountModal() {
    const nameInput = document.getElementById('setting-display-name');
    const langSelect = document.getElementById('setting-target-language');
    const saveBtn = document.getElementById('btn-save-account-modal');

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="inline-block animate-spin mr-1">↻</span> Saving...';
    }

    let nameUpdated = false;
    let langUpdated = false;
    const sb = getSupabase();

    // 1. Handle Display Name Update
    if (nameInput) {
        const newName = nameInput.value.trim();
        if (newName && (!currentUser || currentUser.name !== newName)) {
            nameUpdated = true;
            if (currentUser) {
                currentUser.name = newName;
                currentUser.displayName = newName;
                localStorage.setItem('readit_user', JSON.stringify(currentUser));
            } else {
                localStorage.setItem('readit_guest_name', newName);
            }
            updateAccountUI();

            if (isLoggedIn && currentUser && currentUser.id && sb) {
                try {
                    // Update Supabase Auth user metadata
                    await sb.auth.updateUser({
                        data: {
                            full_name: newName,
                            name: newName,
                            display_name: newName
                        }
                    });

                    // Update public.users record
                    await sb.from('users')
                        .update({ display_name: newName })
                        .eq('id', currentUser.id);

                    console.log('✅ Display name updated in Supabase auth and public.users:', newName);
                } catch (err) {
                    console.warn('Error saving display name to Supabase:', err);
                }
            }
        }
    }

    // 2. Handle Default Language Preference Update
    if (langSelect) {
        const newLang = langSelect.value;
        if (['en', 'id'].includes(newLang)) {
            if (currentReaderLang !== newLang) {
                langUpdated = true;
            }
            await setReaderLang(newLang, true);
        }
    }

    closeAccountModal();

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }

    if (nameUpdated && langUpdated) {
        showHubToast('Name and language preferences saved');
    } else if (nameUpdated) {
        showHubToast('Display name updated');
    } else if (langUpdated) {
        showHubToast(`Default language set to ${currentReaderLang === 'id' ? 'Bahasa Indonesia' : 'Simple English'}`);
    } else {
        showHubToast('Preferences saved');
    }
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
    setReaderLang(currentReaderLang, false);
    initAccountState();
    initSidebarState();
    initGlobalDragAndDrop();
    loadDemoPaper();
    renderHubDocuments();
    setTimeout(initGoogleIdentity, 600);
    setupDrawerTouchGestures();
    setupPaperSlideGestures();

    // Register selection change listeners for floating actions bar on PDF TextLayer
    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('mouseup', handleSelectionChange);
});

// Debounced window resize handler for PDF Canvas & Responsive UI State
window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
        closeExplanationBottomDrawer();
        dismissExplanationPeek();
    }
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
window.triggerExplanationBump = triggerExplanationBump;
window.openExplanationBottomDrawer = openExplanationBottomDrawer;
window.closeExplanationBottomDrawer = closeExplanationBottomDrawer;
window.dismissExplanationPeek = dismissExplanationPeek;
window.switchBottomDrawerFeature = switchBottomDrawerFeature;
window.copyBottomDrawerContent = copyBottomDrawerContent;
window.toggleReaderLang = toggleReaderLang;
window.setDrawerSnapState = setDrawerSnapState;
window.toggleDrawerSnapSize = toggleDrawerSnapSize;
window.triggerPaperPageTurn = triggerPaperPageTurn;
window.setupPaperSlideGestures = setupPaperSlideGestures;
window.resolveDocumentPrebake = resolveDocumentPrebake;
window.saveNewDocumentToCloud = saveNewDocumentToCloud;
window.syncUserDocumentToCloud = syncUserDocumentToCloud;
window.loadUserLibraryFromSupabase = loadUserLibraryFromSupabase;
window.computeFileSha256 = computeFileSha256;
window.loadDemoPaper = loadDemoPaper;
window.toggleStarExplanation = toggleStarExplanation;
window.updateStarButtonsUI = updateStarButtonsUI;
window.isExplanationStarred = isExplanationStarred;
window.updateStarButtonsVisibility = updateStarButtonsVisibility;
window.loadUserSavedInsightsFromSupabase = loadUserSavedInsightsFromSupabase;
window.getCurrentDocumentFileHash = getCurrentDocumentFileHash;
window.renderStarredInsightsView = renderStarredInsightsView;
window.copySingleStarredInsight = copySingleStarredInsight;
window.removeSingleStarredInsight = removeSingleStarredInsight;
window.openPaperAtInsight = openPaperAtInsight;
window.promptDeleteDocument = promptDeleteDocument;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.confirmDeleteDocument = confirmDeleteDocument;
