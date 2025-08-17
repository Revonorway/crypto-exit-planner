// Global variables
let portfolio = [];
// Make portfolio available globally
window.portfolio = portfolio;
let currentCurrency = (JSON.parse(localStorage.getItem('cep_user_prefs')||'{}').currency) || 'NOK';
let searchTimeout;
let currentPrices = {};
let priceChanges24h = {}; // Store 24h price changes
let currentUser = null;
let currentSortPreference = 'name';
let syncStatus = 'local'; // 'local', 'syncing', 'synced', 'error'
let lastSyncTime = null;
let bulkEditMode = false;
let selectedAssets = new Set();

// Authentication state
let isAuthenticated = false;
let isOfflineMode = false;

// Global helper function for image error handling
function handleImageError(imgElement, letter) {
    // Create a simple colored background with letter
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d');
    
    // Purple background
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(0, 0, 24, 24);
    
    // White letter
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter.toUpperCase(), 12, 12);
    
    // Set the canvas as the image source
    imgElement.src = canvas.toDataURL();
    
    // Remove the onerror to prevent infinite loop
    imgElement.onerror = null;
}

// Authentication functions
async function checkAuthenticationStatus() {
    // Check if in offline mode
    isOfflineMode = localStorage.getItem('cep_offline_mode') === 'true';
    
    if (isOfflineMode) {
        console.log('Running in offline mode');
        isAuthenticated = false;
        updateUserInterface();
        return;
    }
    
    // Check if Supabase is available
    if (typeof window.supabase === 'undefined') {
        console.log('Supabase not available, running in offline mode');
        isOfflineMode = true;
        isAuthenticated = false;
        updateUserInterface();
        return;
    }
    
    try {
        const { data: { session } } = await window.supabase.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            isAuthenticated = true;
            console.log('User authenticated:', currentUser.email);
        } else {
            // No session - show auth page OR continue offline
            console.log('No session found - user can choose auth or offline mode');
            currentUser = null;
            isAuthenticated = false;
            // Don't auto-redirect - let user choose
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        // Fall back to offline mode on error
        isOfflineMode = true;
        isAuthenticated = false;
    }
    
    updateUserInterface();
}

function updateUserInterface() {
    const userNameLabel = document.getElementById('userNameLabel');
    const userMenuBtn = document.getElementById('userMenuBtn');
    
    if (isAuthenticated && currentUser) {
        // Show user info
        const displayName = currentUser.user_metadata?.full_name || 
                           currentUser.email.split('@')[0];
        userNameLabel.textContent = displayName;
        
        // Update avatar
        const userAvatar = document.getElementById('userAvatar');
        const userInitials = document.getElementById('userAvatarInitials');
        
        if (currentUser.user_metadata?.avatar_url) {
            userAvatar.src = currentUser.user_metadata.avatar_url;
            userAvatar.style.display = 'block';
            userInitials.style.display = 'none';
        } else {
            userAvatar.style.display = 'none';
            userInitials.style.display = 'flex';
            userInitials.textContent = displayName.charAt(0).toUpperCase();
        }
        
        // Show sync status
        updateSyncStatus();
        
    } else if (isOfflineMode) {
        // Show offline mode
        userNameLabel.textContent = 'Offline Mode';
        const userInitials = document.getElementById('userAvatarInitials');
        userInitials.textContent = 'O';
        userInitials.style.display = 'flex';
        document.getElementById('userAvatar').style.display = 'none';
    } else {
        // Not authenticated - show sign in option
        userNameLabel.textContent = 'Sign In';
        const userInitials = document.getElementById('userAvatarInitials');
        userInitials.textContent = '?';
        userInitials.style.display = 'flex';
        document.getElementById('userAvatar').style.display = 'none';
        
        // Add sign in option to dropdown instead of overriding the click
        updateDropdownForUnauthenticated();
    }
}

function updateSyncStatus() {
    // This will be used to show sync status to the user
    const statusIndicator = document.querySelector('.sync-status');
    if (statusIndicator) {
        if (isAuthenticated) {
            statusIndicator.textContent = 'Synced';
            statusIndicator.className = 'sync-status synced';
        } else {
            statusIndicator.textContent = 'Local Only';
            statusIndicator.className = 'sync-status local';
        }
    }
}

function updateDropdownForUnauthenticated() {
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    if (userMenuDropdown) {
        // Update dropdown content for unauthenticated users
        userMenuDropdown.innerHTML = `
            <div class="dropdown-card">
                <a href="auth.html" class="dropdown-item">
                    <i class="fas fa-sign-in-alt"></i>
                    <span>Sign In</span>
                </a>
                <button onclick="localStorage.setItem('cep_offline_mode', 'true'); location.reload()" class="dropdown-item">
                    <i class="fas fa-wifi-slash"></i>
                    <span>Continue Offline</span>
                </button>
            </div>
        `;
    }
}

function handleUserMenuClick(e) {
    e.stopPropagation();
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    const userMenuBtn = document.getElementById('userMenuBtn');
    
    if (userMenuDropdown && userMenuBtn) {
        const visible = userMenuDropdown.style.display === 'block';
        userMenuDropdown.style.display = visible ? 'none' : 'block';
        userMenuBtn.setAttribute('aria-expanded', String(!visible));
    }
}

function setupAssetTableEventHandlers() {
    // Re-ensure button event handlers are working
    console.log('🔧 Setting up asset table event handlers...');
    
    // Test buttons exist
    const editBtns = document.querySelectorAll('.edit-asset-btn');
    const deleteBtns = document.querySelectorAll('.delete-asset-btn');
    const strategyBtns = document.querySelectorAll('.strategy-btn');
    const assetRows = document.querySelectorAll('.asset-row');
    
    console.log(`Found ${editBtns.length} edit buttons, ${deleteBtns.length} delete buttons, ${strategyBtns.length} strategy buttons, ${assetRows.length} asset rows`);
    
    // Re-setup theme toggle if needed
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn && !themeBtn.onclick) {
        console.log('🎨 Re-setting up theme toggle...');
        const prefs = JSON.parse(localStorage.getItem('cep_user_prefs')||'{}');
        let theme = prefs.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
        applyTheme(theme);
        themeBtn.setAttribute('aria-pressed', String(theme==='dark'));
        
        themeBtn.addEventListener('click', () => {
            theme = (theme === 'dark') ? 'light' : 'dark';
            applyTheme(theme);
            persistUserPrefs({ theme });
            themeBtn.setAttribute('aria-pressed', String(theme==='dark'));
            themeBtn.innerHTML = theme==='dark' ? '<i class="fas fa-sun" aria-hidden="true"></i>' : '<i class="fas fa-moon" aria-hidden="true"></i>';
        });
    }
    
    // Force re-setup user dropdown
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    if (userMenuBtn && userMenuDropdown) {
        console.log('🔧 Re-setting up user menu dropdown...');
        // Remove any existing handlers and re-add
        userMenuBtn.replaceWith(userMenuBtn.cloneNode(true));
        const newUserMenuBtn = document.getElementById('userMenuBtn');
        newUserMenuBtn.addEventListener('click', handleUserMenuClick);
    }
}

async function handleLogout() {
    try {
        if (!isOfflineMode && typeof window.supabase !== 'undefined') {
            const { error } = await window.supabase.auth.signOut();
            if (error) throw error;
        }
        
        // Clear offline mode flag
        localStorage.removeItem('cep_offline_mode');
        
        // Clear user state
        currentUser = null;
        isAuthenticated = false;
        isOfflineMode = false;
        
        // Redirect to auth page
        window.location.href = 'auth.html';
        
    } catch (error) {
        console.error('Logout failed:', error);
        // Force logout on error
        localStorage.removeItem('cep_offline_mode');
        window.location.href = 'auth.html';
    }
}

// Currency conversion rates (simplified - in real app, you'd fetch from API)
const exchangeRates = {
    USD: 1,
    NOK: 10.5 // Approximate USD to NOK rate
};

// Popular cryptocurrencies for search
const popularCryptos = [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', icon: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
    { id: 'binancecoin', symbol: 'BNB', name: 'BNB', icon: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png' },
    { id: 'solana', symbol: 'SOL', name: 'Solana', icon: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
    { id: 'cardano', symbol: 'ADA', name: 'Cardano', icon: 'https://assets.coingecko.com/coins/images/975/large/cardano.png' },
    { id: 'ripple', symbol: 'XRP', name: 'XRP', icon: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png' },
    { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', icon: 'https://assets.coingecko.com/coins/images/12171/large/polkadot_new_logo.png' },
    { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', icon: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png' },
    { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', icon: 'https://assets.coingecko.com/coins/images/12559/large/avalanche.png' },
    { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', icon: 'https://assets.coingecko.com/coins/images/877/large/chainlink.png' },
    { id: 'polygon', symbol: 'MATIC', name: 'Polygon', icon: 'https://assets.coingecko.com/coins/images/4713/large/matic.png' },
    { id: 'litecoin', symbol: 'LTC', name: 'Litecoin', icon: 'https://assets.coingecko.com/coins/images/2/large/litecoin.png' },
    { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', icon: 'https://assets.coingecko.com/coins/images/12504/large/uniswap.png' },
    { id: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash', icon: 'https://assets.coingecko.com/coins/images/780/large/bitcoin-cash.png' },
    { id: 'stellar', symbol: 'XLM', name: 'Stellar', icon: 'https://assets.coingecko.com/coins/images/100/large/stellar.png' },
    { id: 'crypto-com-chain', symbol: 'CRO', name: 'Cronos', icon: 'https://assets.coingecko.com/coins/images/7310/large/cro_token_logo.png' },
    { id: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu', icon: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png' },
    { id: 'tron', symbol: 'TRX', name: 'TRON', icon: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png' },
    { id: 'cosmos', symbol: 'ATOM', name: 'Cosmos', icon: 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png' },
    { id: 'monero', symbol: 'XMR', name: 'Monero', icon: 'https://assets.coingecko.com/coins/images/69/large/monero_logo.png' },
    { id: 'algorand', symbol: 'ALGO', name: 'Algorand', icon: 'https://assets.coingecko.com/coins/images/4380/large/download.png' },
    { id: 'vechain', symbol: 'VET', name: 'VeChain', icon: 'https://assets.coingecko.com/coins/images/1167/large/VeChain-Logo-768x725.png' },
    { id: 'filecoin', symbol: 'FIL', name: 'Filecoin', icon: 'https://assets.coingecko.com/coins/images/12817/large/filecoin.png' },
    { id: 'tezos', symbol: 'XTZ', name: 'Tezos', icon: 'https://assets.coingecko.com/coins/images/976/large/Tezos-logo.png' },
    { id: 'neo', symbol: 'NEO', name: 'NEO', icon: 'https://assets.coingecko.com/coins/images/480/large/NEO_512_512.png' },
    { id: 'dash', symbol: 'DASH', name: 'Dash', icon: 'https://assets.coingecko.com/coins/images/19/large/dash-logo.png' },
    { id: 'zcash', symbol: 'ZEC', name: 'Zcash', icon: 'https://assets.coingecko.com/coins/images/486/large/circle-zcash-color.png' },
    { id: 'decred', symbol: 'DCR', name: 'Decred', icon: 'https://assets.coingecko.com/coins/images/670/large/decred.png' },
    { id: 'ravencoin', symbol: 'RVN', name: 'Ravencoin', icon: 'https://assets.coingecko.com/coins/images/3412/large/ravencoin.png' },
    { id: 'digibyte', symbol: 'DGB', name: 'DigiByte', icon: 'https://assets.coingecko.com/coins/images/63/large/digibyte.png' },
    { id: 'verge', symbol: 'XVG', name: 'Verge', icon: 'https://assets.coingecko.com/coins/images/203/large/verge-symbol-color_logo.png' },
    { id: 'pivx', symbol: 'PIVX', name: 'PIVX', icon: 'https://assets.coingecko.com/coins/images/548/large/pivx.png' },
    { id: 'nav-coin', symbol: 'NAV', name: 'NAV Coin', icon: 'https://assets.coingecko.com/coins/images/233/large/nav-coin.png' },
    { id: 'groestlcoin', symbol: 'GRS', name: 'Groestlcoin', icon: 'https://assets.coingecko.com/coins/images/71/large/groestlcoin.png' },
    { id: 'vertcoin', symbol: 'VTC', name: 'Vertcoin', icon: 'https://assets.coingecko.com/coins/images/16/large/vertcoin.png' },
    { id: 'feathercoin', symbol: 'FTC', name: 'Feathercoin', icon: 'https://assets.coingecko.com/coins/images/8/large/feathercoin.png' },
    { id: 'novacoin', symbol: 'NVC', name: 'NovaCoin', icon: 'https://assets.coingecko.com/coins/images/9/large/novacoin.png' },
    { id: 'peercoin', symbol: 'PPC', name: 'Peercoin', icon: 'https://assets.coingecko.com/coins/images/4/large/peercoin.png' },
    { id: 'namecoin', symbol: 'NMC', name: 'Namecoin', icon: 'https://assets.coingecko.com/coins/images/6/large/namecoin.png' },
    { id: 'primecoin', symbol: 'XPM', name: 'Primecoin', icon: 'https://assets.coingecko.com/coins/images/7/large/primecoin.png' },
    { id: 'auroracoin', symbol: 'AUR', name: 'Auroracoin', icon: 'https://assets.coingecko.com/coins/images/10/large/auroracoin.png' },
    { id: 'worldcoin', symbol: 'WDC', name: 'WorldCoin', icon: 'https://assets.coingecko.com/coins/images/11/large/worldcoin.png' },
    { id: 'megacoin', symbol: 'MEC', name: 'MegaCoin', icon: 'https://assets.coingecko.com/coins/images/12/large/megacoin.png' },
    { id: 'infinitecoin', symbol: 'IFC', name: 'Infinitecoin', icon: 'https://assets.coingecko.com/coins/images/13/large/infinitecoin.png' },
    { id: 'phoenixcoin', symbol: 'PXC', name: 'Phoenixcoin', icon: 'https://assets.coingecko.com/coins/images/14/large/phoenixcoin.png' },
    { id: 'crown', symbol: 'CRW', name: 'Crown', icon: 'https://assets.coingecko.com/coins/images/15/large/crown.png' }
];

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    // Clear only corrupted price cache, keep real API prices
    clearCorruptedPriceCache();
    
    // Run data migration first to clean up any corrupted data
    migrateCorruptedData();
    
    // Check authentication first
    await checkAuthenticationStatus();
    
    // Initialize Supabase auth listener if available
    if (typeof initializeAuthListener === 'function') {
        initializeAuthListener();
    }
    
    setupEventListeners();
    
    // Load portfolio from localStorage immediately as fallback
    const localPortfolio = JSON.parse(localStorage.getItem('portfolio') || '[]');
    portfolio = localPortfolio;
    window.portfolio = portfolio;
    console.log('🔧 Loaded initial portfolio from localStorage:', portfolio.length, 'assets');
    console.log('🔧 Full portfolio loaded on main page:', localPortfolio);
    
    // Add debugging to track portfolio changes
    let originalPortfolio = [...portfolio];
    setInterval(() => {
        if (portfolio.length !== originalPortfolio.length) {
            console.log('🚨 Portfolio length changed!', {
                was: originalPortfolio.length,
                now: portfolio.length,
                timestamp: new Date().toISOString()
            });
            
            // If portfolio was unexpectedly cleared, try to restore from localStorage
            if (portfolio.length === 0 && originalPortfolio.length > 0) {
                console.log('🔧 Portfolio was cleared! Attempting to restore...');
                const backup = JSON.parse(localStorage.getItem('portfolio') || '[]');
                if (backup.length > 0) {
                    portfolio.splice(0, 0, ...backup);
                    window.portfolio = portfolio;
                    console.log('✅ Portfolio restored from localStorage backup');
                    updatePortfolioDisplay();
                }
            }
            
            originalPortfolio = [...portfolio];
        }
    }, 1000);
    
    // Supabase auth listener will override this if user is authenticated
    migrateCronosIdIfNeeded();
    loadSortPreference();
    updatePortfolioDisplay();
    
    // Add small delay to ensure DOM is fully ready
    setTimeout(() => {
        console.log('🔧 Setting up event handlers...');
        setupAssetTableEventHandlers();
    }, 100);
    
    await fetchCurrentPrices();
    // Initialize timeframe & compact mode
    initTimeframeToggle();
    initCompactToggle();
    initRefreshControls();
    

    
    // Initialize market ticker if present
    if (document.getElementById('btcPrice')) {
        updateMarketTicker();
        setInterval(updateMarketTicker, 60000); // Update every minute
    }
    

    
    // Initialize all currency displays with proper formatting
    initializeCurrencyDisplays();
    

    
    // Fetch prices every 30 seconds
    setInterval(fetchCurrentPrices, 30000);
}

function initTimeframeToggle() {
    const tfEl = document.getElementById('timeframeToggle');
    if (!tfEl) return;
    const key = currentUser ? `cep_tf_${currentUser.username}` : 'cep_tf';
    const saved = localStorage.getItem(key) || 'baseline';
    [...tfEl.querySelectorAll('.seg-btn')].forEach(btn => {
        btn.classList.toggle('active', btn.dataset.timeframe === saved);
        btn.addEventListener('click', () => {
            [...tfEl.querySelectorAll('.seg-btn')].forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            localStorage.setItem(key, btn.dataset.timeframe);
            updatePortfolioOverview();
        });
    });
}

function initCompactToggle() {
    const btn = document.getElementById('compactToggleBtn');
    if (!btn) return;
    const key = currentUser ? `cep_compact_${currentUser.username}` : 'cep_compact';
    const saved = localStorage.getItem(key) === '1';
    const grid = document.querySelector('.overview-grid');
    if (saved && grid) grid.classList.add('compact');
    btn.addEventListener('click', () => {
        if (!grid) return;
        grid.classList.toggle('compact');
        localStorage.setItem(key, grid.classList.contains('compact') ? '1' : '0');
    });
}

function initRefreshControls() {
    const lbl = document.getElementById('lastUpdatedLabel');
    const btn = document.getElementById('refreshBtn');
    if (lbl) lbl.textContent = new Date().toLocaleTimeString('en-GB');
    if (btn) btn.addEventListener('click', async () => {
        await fetchCurrentPrices();
        if (lbl) lbl.textContent = new Date().toLocaleTimeString('en-GB');
    });
}

function initializeAuth() {
    // Basic local-only auth with salted hash stored in localStorage
    const savedUser = localStorage.getItem('cep_current_user');
    currentUser = savedUser ? JSON.parse(savedUser) : null;
    const overlay = document.getElementById('authOverlay');
    const loginHeaderBtn = document.getElementById('loginHeaderBtn');
    if (loginHeaderBtn) {
        loginHeaderBtn.style.display = currentUser ? 'none' : 'inline-flex';
        loginHeaderBtn.addEventListener('click', ()=> { if (overlay) overlay.style.display='flex'; });
    }
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await handleLogout();
        });
    }
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(tab => tab.addEventListener('click', function() {
        tabs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        const isLogin = this.dataset.tab === 'login';
        document.getElementById('loginForm').style.display = isLogin ? 'block' : 'none';
        document.getElementById('registerForm').style.display = isLogin ? 'none' : 'block';
    }));
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', handleRegister);
    }
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }
    if (!currentUser && overlay) {
        overlay.style.display = 'none'; // don't auto-open; header button can open it
    }
}

function handleRegister() {
    const username = (document.getElementById('registerUsername').value || '').trim();
    const password = (document.getElementById('registerPassword').value || '').trim();
    const err = document.getElementById('registerError');
    if (!username || !password) {
        err.textContent = 'Enter username and password';
        err.style.display = 'block';
        return;
    }
    const users = JSON.parse(localStorage.getItem('cep_users') || '{}');
    if (users[username]) {
        err.textContent = 'Username already exists';
        err.style.display = 'block';
        return;
    }
    const salt = generateSalt();
    const hash = hashPassword(password, salt);
    users[username] = { salt, hash };
    localStorage.setItem('cep_users', JSON.stringify(users));
    // Auto-login
    currentUser = { username };
    localStorage.setItem('cep_current_user', JSON.stringify(currentUser));
    // Create per-user portfolio namespace
    if (!localStorage.getItem(storageKeyForPortfolio())) {
        localStorage.setItem(storageKeyForPortfolio(), JSON.stringify([]));
    }
    loadUserPortfolio();
    document.getElementById('authOverlay').style.display = 'none';
}

function handleLogin() {
    const username = (document.getElementById('loginUsername').value || '').trim();
    const password = (document.getElementById('loginPassword').value || '').trim();
    const err = document.getElementById('loginError');
    const users = JSON.parse(localStorage.getItem('cep_users') || '{}');
    const rec = users[username];
    if (!rec) {
        err.textContent = 'Invalid username or password';
        err.style.display = 'block';
        return;
    }
    const calc = hashPassword(password, rec.salt);
    if (calc !== rec.hash) {
        err.textContent = 'Invalid username or password';
        err.style.display = 'block';
        return;
    }
    currentUser = { username };
    localStorage.setItem('cep_current_user', JSON.stringify(currentUser));
    loadUserPortfolio();
    document.getElementById('authOverlay').style.display = 'none';
}

function storageKeyForPortfolio() {
    // Always use unified 'portfolio' key for consistency
    return 'portfolio';
}

// loadUserPortfolio() function moved to supabase-config.js

// Use the enhanced savePortfolio from supabase-config.js if available
function savePortfolio() {
    // Update global reference
    window.portfolio = portfolio;
    
    // Always save to localStorage as backup
    localStorage.setItem('portfolio', JSON.stringify(portfolio));
    
    // Call Supabase save function if available
    if (typeof window.savePortfolioToSupabase === 'function') {
        window.savePortfolioToSupabase();
    }
}

function generateSalt() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function hashPassword(password, salt) {
    // Simple SHA-256 via SubtleCrypto if available; fallback to naive hash
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + ':' + salt);
        // Note: SubtleCrypto is async; here we use a synchronous fallback for simplicity
    } catch {}
    // Fallback: djb2-like
    let hash = 5381;
    const str = password + ':' + salt;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return String(hash >>> 0);
}

// Migrate any saved Cronos entries using old id 'cronos' to CoinGecko id 'crypto-com-chain'
function migrateCronosIdIfNeeded() {
    let changed = false;
    portfolio = portfolio.map(asset => {
        if (asset.id === 'cronos') {
            changed = true;
            return { ...asset, id: 'crypto-com-chain' };
        }
        return asset;
    });
    if (changed) {
        savePortfolio();
    }
}

function setupEventListeners() {
    // Currency toggle
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCurrency = this.dataset.currency;
            persistUserPrefs({ currency: currentCurrency });
            
            // Update all displays that show currency
            updatePortfolioDisplay();
            updatePortfolioOverview();
            updateExitProjections();
            updateMarketOverview();
            updateMarketTicker(); // Update BTC/ETH prices in ticker
            initializeCurrencyDisplays(); // Re-initialize any remaining currency displays
            
            console.log('Currency changed to:', currentCurrency);
        });
    });

    // Asset search
    const searchInput = document.getElementById('assetSearch');
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('focus', showSearchResults);
    
    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            hideSearchResults();
        }
    });

    // Add asset button
    document.getElementById('addAssetBtn').addEventListener('click', addAssetToPortfolio);

    // Toggle Add Asset modal
    const toggleBtn = document.getElementById('toggleAddAsset');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            openAddAssetModal();
        });
    }
    
    // Add asset modal controls
    const closeModalBtn = document.getElementById('closeAddAssetModal');
    const cancelBtn = document.getElementById('cancelAddAssetBtn');
    const modal = document.getElementById('addAssetModal');
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeAddAssetModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeAddAssetModal);
    }
    
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeAddAssetModal();
            }
        });
    }



    // User menu dropdown basic wiring (profile/settings/switch)
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenuDropdown = document.getElementById('userMenuDropdown');
    if (userMenuBtn && userMenuDropdown) {
        // Ensure we don't have duplicate event listeners
        userMenuBtn.removeEventListener('click', handleUserMenuClick);
        // Populate avatar/name
        const avatarImg = document.getElementById('userAvatar');
        const avatarInitials = document.getElementById('userAvatarInitials');
        const nameLabel = document.getElementById('userNameLabel');
        const prof = currentUser ? JSON.parse(localStorage.getItem(`user_profile_${currentUser.username}`)||'{}') : null;
        if (prof && prof.avatarUrl) {
            avatarImg.src = prof.avatarUrl;
            avatarImg.style.display = 'inline-block';
            avatarInitials.style.display = 'none';
        } else {
            // Show initials fallback
            const displayText = (prof && prof.displayName) ? prof.displayName : 
                               (currentUser && currentUser.email) ? currentUser.email.split('@')[0] : 'User';
            const initials = displayText.split(/\s+/).map(s=>s[0]).join('').slice(0,2).toUpperCase();
            avatarInitials.textContent = initials || 'U';
            avatarImg.style.display = 'none';
            avatarInitials.style.display = 'inline-flex';
        }
        if (nameLabel) {
            nameLabel.textContent = (prof && prof.displayName) ? prof.displayName : 
                                   (currentUser && currentUser.email) ? currentUser.email.split('@')[0] : 'Profile';
        }
        userMenuBtn.addEventListener('click', handleUserMenuClick);
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu')) {
                userMenuDropdown.style.display = 'none';
                userMenuBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        const prefs = JSON.parse(localStorage.getItem('cep_user_prefs')||'{}');
        let theme = prefs.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
        applyTheme(theme);
        themeBtn.setAttribute('aria-pressed', String(theme==='dark'));
        themeBtn.addEventListener('click', () => {
            theme = (theme === 'dark') ? 'light' : 'dark';
            applyTheme(theme);
            persistUserPrefs({ theme });
            themeBtn.setAttribute('aria-pressed', String(theme==='dark'));
            themeBtn.innerHTML = theme==='dark' ? '<i class="fas fa-sun" aria-hidden="true"></i>' : '<i class="fas fa-moon" aria-hidden="true"></i>';
        });
    }
    // Asset row navigation - use event delegation for dynamic content
    document.addEventListener('click', function(e) {

        
        // Handle individual button clicks with delegation FIRST (before asset row)
        if (e.target.closest('.edit-asset-btn')) {
            e.stopPropagation();
            const assetId = e.target.closest('.edit-asset-btn').dataset.assetId;
            console.log('Edit button clicked via delegation - assetId:', assetId);
            toggleEditAsset(assetId, true);
            return;
        }
        
        if (e.target.closest('.delete-asset-btn')) {
            e.stopPropagation();
            const assetId = e.target.closest('.delete-asset-btn').dataset.assetId;
            deleteAsset(assetId);
            return;
        }
        
        if (e.target.closest('.strategy-btn')) {
            e.stopPropagation();
            const assetId = e.target.closest('.strategy-btn').dataset.assetId;
            console.log('Strategy button clicked via delegation - assetId:', assetId);
            window.location.href = `strategy.html?asset=${assetId}`;
            return;
        }
        
        // Check if click is on an asset row (AFTER checking for buttons)
        const assetRow = e.target.closest('.asset-row');
        if (assetRow) {
            // Ignore clicks on action buttons
            if (e.target.closest('.asset-actions') || e.target.closest('.btn-icon')) {
                console.log('Asset row click ignored - button area');
                return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            
            const assetId = assetRow.dataset.assetId;
            console.log('Asset row clicked - navigating to strategy for:', assetId);
            
            if (!assetId) {
                console.error('No asset ID found in dataset');
                return;
            }
            
            const strategyUrl = `strategy.html?asset=${assetId}`;
            window.location.href = strategyUrl;
            return;
        }
    });

}

async function handleSearchInput(e) {
    const query = e.target.value.toLowerCase().trim();
    
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        hideSearchResults();
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        // First search in popular cryptos
        const popularResults = popularCryptos.filter(crypto => 
            crypto.name.toLowerCase().includes(query) || 
            crypto.symbol.toLowerCase().includes(query)
        );
        
        // If we have good results from popular cryptos, show them
        if (popularResults.length >= 3) {
            displaySearchResults(popularResults);
            return;
        }
        
        // Show loading state for API search
        showSearchLoading();
        
        // If not enough results, search CoinGecko API
        try {
            const response = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                const apiResults = data.coins.slice(0, 10).map(coin => ({
                    id: coin.id,
                    symbol: coin.symbol.toUpperCase(),
                    name: coin.name,
                    icon: coin.large
                }));
                
                // Combine popular results with API results, removing duplicates
                const combinedResults = [...popularResults];
                apiResults.forEach(apiCoin => {
                    if (!combinedResults.find(popular => popular.symbol === apiCoin.symbol)) {
                        combinedResults.push(apiCoin);
                    }
                });
                
                displaySearchResults(combinedResults.slice(0, 10));
            } else {
                // Fallback to popular cryptos only
                displaySearchResults(popularResults);
            }
        } catch (error) {
            console.log('Search API error, using popular cryptos only:', error);
            displaySearchResults(popularResults);
        }
    }, 300);
}

function displaySearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item">No results found</div>';
    } else {
        searchResults.innerHTML = results.map(crypto => `
            <div class="search-result-item" data-crypto='${JSON.stringify(crypto)}'>
                <img src="${crypto.icon}" alt="${crypto.name}" onerror="handleImageError(this, '${crypto.symbol.charAt(0)}')">
                <div class="asset-info">
                    <div class="asset-name">${crypto.name}</div>
                    <div class="asset-symbol">${crypto.symbol}</div>
                </div>
            </div>
        `).join('');
        
        // Add click listeners to results
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            if (item.dataset.crypto) {
                item.addEventListener('click', function() {
                    const crypto = JSON.parse(this.dataset.crypto);
                    selectAsset(crypto);
                });
            }
        });
    }
    
    searchResults.style.display = 'block';
}

function showSearchLoading() {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = `
        <div class="search-loading">
            <div class="loading-spinner small"></div>
            <span>Searching...</span>
        </div>
    `;
    searchResults.style.display = 'block';
}

function hideSearchResults() {
    document.getElementById('searchResults').style.display = 'none';
}

function showSearchResults() {
    const searchInput = document.getElementById('assetSearch');
    if (searchInput.value.trim().length >= 2) {
        const query = searchInput.value.toLowerCase().trim();
        const results = popularCryptos.filter(crypto => 
            crypto.name.toLowerCase().includes(query) || 
            crypto.symbol.toLowerCase().includes(query)
        );
        displaySearchResults(results);
    }
}

async function selectAsset(crypto) {
    const selectedAsset = document.getElementById('selectedAsset');
    const assetIcon = document.getElementById('assetIcon');
    const assetName = document.getElementById('assetName');
    const assetSymbol = document.getElementById('assetSymbol');
    
    assetIcon.src = crypto.icon;
    assetIcon.alt = crypto.name;
    assetName.textContent = crypto.name;
    assetSymbol.textContent = crypto.symbol;
    
    selectedAsset.style.display = 'block';
    hideSearchResults();
    
    // Store selected crypto for later use
    selectedAsset.dataset.crypto = JSON.stringify(crypto);
    
    // Fetch current price for this asset
    await fetchAssetPrice(crypto.id);
}

async function fetchAssetPrice(assetId) {
    try {
        const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=usd&include_24hr_change=true`;
        const response = await fetch(apiUrl, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data[assetId]) {
            const price = data[assetId].usd;
            const change24h = data[assetId].usd_24h_change;
            
            // Update the current prices object
            currentPrices[assetId] = price;
            priceChanges24h[assetId] = change24h;
            
            // Update the UI to show current price
            const avgPriceInput = document.getElementById('assetAvgPrice');
            if (avgPriceInput && !avgPriceInput.value) {
                avgPriceInput.value = price.toFixed(price > 1 ? 2 : 6);
                avgPriceInput.placeholder = `Current: $${formatPrice(price)}`;
            }
            
            console.log(`✅ Fetched price for ${assetId}: $${price}`);
        }
    } catch (error) {
        console.warn(`Failed to fetch price for ${assetId}:`, error);
        // Don't throw error, just log it
    }
}

function addAssetToPortfolio() {
    const selectedAsset = document.getElementById('selectedAsset');
    const amount = parseFloat(document.getElementById('assetAmount').value);
    const avgPrice = parseFloat(document.getElementById('assetAvgPrice').value);
    
    if (!selectedAsset.dataset.crypto || !amount || !avgPrice) {
        alert('Please fill in all fields');
        return;
    }
    
    const crypto = JSON.parse(selectedAsset.dataset.crypto);
    
    // Check if asset already exists
    const existingIndex = portfolio.findIndex(asset => asset.id === crypto.id);
    
    if (existingIndex !== -1) {
        // Update existing asset
        const existing = portfolio[existingIndex];
        const totalAmount = existing.amount + amount;
        const totalInvested = (existing.amount * existing.avgPrice) + (amount * avgPrice);
        const newAvgPrice = totalInvested / totalAmount;
        
        portfolio[existingIndex] = {
            ...existing,
            amount: totalAmount,
            avgPrice: newAvgPrice
        };
    } else {
        // Add new asset
        portfolio.push({
            id: crypto.id,
            symbol: crypto.symbol,
            name: crypto.name,
            icon: crypto.icon,
            amount: amount,
            avgPrice: avgPrice,
            exitStrategy: []
        });
    }
    
    savePortfolio();
    updatePortfolioDisplay();
    closeAddAssetModal();
}

function openAddAssetModal() {
    const modal = document.getElementById('addAssetModal');
    if (modal) {
        modal.style.display = 'flex';
        // Reset form and focus on search
    resetAssetForm();
        setTimeout(() => {
            document.getElementById('assetSearch').focus();
        }, 100);
    }
}

function closeAddAssetModal() {
    const modal = document.getElementById('addAssetModal');
    if (modal) {
        modal.style.display = 'none';
        resetAssetForm();
        hideSearchResults();
    }
}

function resetAssetForm() {
    document.getElementById('assetSearch').value = '';
    document.getElementById('assetAmount').value = '';
    document.getElementById('assetAvgPrice').value = '';
    document.getElementById('selectedAsset').style.display = 'none';
    delete document.getElementById('selectedAsset').dataset.crypto;
    hideSearchResults();
}

function toggleEditAsset(assetId, show) {
    const row = document.querySelector(`tr[data-asset-id="${assetId}"]`);
    if (!row) return;
    
    if (show) {
        // Switch to edit mode
        const asset = portfolio.find(a => a.id === assetId);
        if (!asset) return;
        
        const amountCell = row.querySelector('.asset-amount-cell');
        const priceCell = row.querySelector('.asset-price-cell');
        
        if (amountCell && priceCell) {
            // Store original content
            amountCell.dataset.originalContent = amountCell.innerHTML;
            priceCell.dataset.originalContent = priceCell.innerHTML;
            
            // Create edit inputs
            amountCell.innerHTML = `
                <input type="number" 
                       class="edit-input" 
                       value="${asset.amount}" 
                       step="0.000001" 
                       min="0" 
                       style="width: 80px; text-align: right;">
            `;
            priceCell.innerHTML = `
                <input type="number" 
                       class="edit-input" 
                       value="${asset.avgPrice}" 
                       step="0.01" 
                       min="0" 
                       style="width: 80px; text-align: right;">
            `;
            
            // Update action buttons
            const actionsCell = row.querySelector('.asset-actions-cell');
            if (actionsCell) {
                actionsCell.innerHTML = `
                    <div class="asset-actions">
                        <button class="btn-icon save-asset-btn" data-asset-id="${assetId}" title="Save changes">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-icon cancel-edit-btn" data-asset-id="${assetId}" title="Cancel">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
                
                // Add event listeners to the new buttons
                const saveBtn = actionsCell.querySelector('.save-asset-btn');
                const cancelBtn = actionsCell.querySelector('.cancel-edit-btn');
                
                if (saveBtn) {
                    saveBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        saveAssetEdits(assetId);
                    });
                }
                
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        toggleEditAsset(assetId, false);
                    });
                }
            }
            
            // Focus on first input
            const firstInput = amountCell.querySelector('input');
            if (firstInput) firstInput.focus();
            
            // Add keyboard support for edit inputs
            const inputs = row.querySelectorAll('.edit-input');
            inputs.forEach(input => {
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveAssetEdits(assetId);
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        toggleEditAsset(assetId, false);
                    }
                });
            });
        }
    } else {
        // Switch back to view mode
        const amountCell = row.querySelector('.asset-amount-cell');
        const priceCell = row.querySelector('.asset-price-cell');
        
        if (amountCell && priceCell) {
            // Restore original content
            if (amountCell.dataset.originalContent) {
                amountCell.innerHTML = amountCell.dataset.originalContent;
                delete amountCell.dataset.originalContent;
            }
            if (priceCell.dataset.originalContent) {
                priceCell.innerHTML = priceCell.dataset.originalContent;
                delete priceCell.dataset.originalContent;
            }
        }
        
        // Restore action buttons
        const actionsCell = row.querySelector('.asset-actions-cell');
        if (actionsCell) {
            actionsCell.innerHTML = `
                <div class="asset-actions">
                    <button class="btn-icon edit-asset-btn" data-asset-id="${assetId}" title="Edit holdings">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-icon danger delete-asset-btn" data-asset-id="${assetId}" title="Delete asset">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
    }
}

function saveAssetEdits(assetId) {
    const row = document.querySelector(`tr[data-asset-id="${assetId}"]`);
    if (!row) return;
    
    const amountInput = row.querySelector('.asset-amount-cell input');
    const priceInput = row.querySelector('.asset-price-cell input');
    
    if (!amountInput || !priceInput) return;
    
    const newAmount = parseFloat(amountInput.value);
    const newAvgPrice = parseFloat(priceInput.value);
    
    if (isNaN(newAmount) || isNaN(newAvgPrice) || newAmount < 0 || newAvgPrice < 0) {
        alert('Please enter valid positive numbers');
        return;
    }
    
    const idx = portfolio.findIndex(a => a.id === assetId);
    if (idx === -1) return;
    
    portfolio[idx].amount = newAmount;
    portfolio[idx].avgPrice = newAvgPrice;
    savePortfolio();
    updatePortfolioDisplay();
}

function deleteAsset(assetId) {
    const idx = portfolio.findIndex(a => a.id === assetId);
    if (idx === -1) return;
    const confirmDelete = confirm('Delete this asset from your portfolio?');
    if (!confirmDelete) return;
    portfolio.splice(idx, 1);
    savePortfolio();
    updatePortfolioDisplay();
}

function showSkeletonLoading(container) {
    const skeletonRows = Array(3).fill().map(() => `
        <tr class="skeleton-table-row">
            <td><div class="skeleton skeleton-circle"></div></td>
            <td><div class="skeleton skeleton-text short"></div></td>
            <td><div class="skeleton skeleton-text short"></div></td>
            <td><div class="skeleton skeleton-text short"></div></td>
            <td><div class="skeleton skeleton-text short"></div></td>
            <td><div class="skeleton skeleton-text short"></div></td>
            <td><div class="skeleton skeleton-text short"></div></td>
            <td><div class="skeleton skeleton-text short"></div></td>
            <td><div class="skeleton skeleton-rectangle" style="width: 60px;"></div></td>
        </tr>
    `).join('');
    
    container.innerHTML = `
        <table class="assets-table">
            <thead>
                <tr>
                    <th>Asset</th>
                    <th class="amount">Holdings</th>
                    <th class="price">Price</th>
                    <th class="24h-change">24h %</th>
                    <th class="value">Value</th>
                    <th class="pnl">PnL %</th>
                    <th class="next-target">Next Target</th>
                    <th class="target-distance">Distance</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${skeletonRows}
            </tbody>
        </table>
    `;
}

function updatePortfolioDisplay() {
    const assetsList = document.getElementById('assetsList');
    if (!assetsList) return;
    
    // Show skeleton loading
    showSkeletonLoading(assetsList);
    
    // Simulate loading delay for better UX
    setTimeout(() => {
        if (portfolio.length === 0) {
            assetsList.innerHTML = `
                <div class="empty-state fade-in">
                    <i class="fas fa-coins"></i>
                    <p>No assets added yet. Search and add your first crypto asset above.</p>
                </div>
            `;
            return;
        }
                // Prepare assets data with exit target information
        const assetsWithTargets = portfolio.map(asset => {
            const currentPrice = currentPrices[asset.id] || 0;
            const currentValue = asset.amount * currentPrice;
            const investedValue = asset.amount * asset.avgPrice;
            const pnl = currentValue - investedValue;
            const pnlPercent = investedValue > 0 ? (pnl / investedValue) * 100 : 0;
            
            // Find next exit target and check for passed levels
            let nextTarget = null;
            let targetDistance = null;
            let passedUnexecutedLevels = 0;
            let nextTargetStatus = 'normal'; // 'normal', 'passed', 'urgent'
            
            if (asset.exitStrategy && asset.exitStrategy.length > 0) {
                const ladders = [...asset.exitStrategy]
                    .filter(l => !l.executed)
                    .map(l => ({ 
                        price: parseFloat(l.price), 
                        percentage: parseFloat(l.percentage),
                        originalIndex: asset.exitStrategy.indexOf(l)
                    }))
                    .filter(l => !isNaN(l.price) && !isNaN(l.percentage));
                
                // Count passed but unexecuted levels
                passedUnexecutedLevels = ladders.filter(l => l.price <= currentPrice).length;
                
                // Find next target above current price
                nextTarget = ladders
                    .filter(l => l.price > currentPrice)
                    .sort((a, b) => a.price - b.price)[0] || null;
                
                // If we have passed levels, prioritize showing the highest passed level as "urgent"
                if (passedUnexecutedLevels > 0) {
                    const highestPassedLevel = ladders
                        .filter(l => l.price <= currentPrice)
                        .sort((a, b) => b.price - a.price)[0];
                    
                    if (highestPassedLevel) {
                        nextTarget = highestPassedLevel;
                        nextTargetStatus = 'passed';
                        const distance = ((currentPrice - highestPassedLevel.price) / highestPassedLevel.price) * 100;
                        targetDistance = distance; // Positive value showing how much we've passed it
                    }
                } else if (nextTarget) {
                    // Normal future target
                    targetDistance = currentPrice > 0 ? ((nextTarget.price - currentPrice) / currentPrice) * 100 : Infinity;
                    nextTargetStatus = 'normal';
                }
            }
            
            return {
                ...asset,
                currentPrice,
                currentValue,
                investedValue,
                pnl,
                pnlPercent,
                nextTarget,
                targetDistance,
                passedUnexecutedLevels,
                nextTargetStatus
            };
        });
        
        // Find the asset closest to its next exit target
        const assetsWithValidTargets = assetsWithTargets.filter(asset => asset.targetDistance !== null);
        let closestAssetId = null;
        if (assetsWithValidTargets.length > 0) {
            const closestAsset = assetsWithValidTargets.reduce((closest, current) => {
                if (!closest || current.targetDistance < closest.targetDistance) {
                    return current;
                }
                return closest;
            });
            closestAssetId = closestAsset.id;
        }
        
        // Sort assets based on saved preference
        const sortedAssets = [...assetsWithTargets].sort((a, b) => {
            switch (currentSortPreference) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'value':
                    return b.currentValue - a.currentValue;
                case '24h-change':
                    const changeA = priceChanges24h[a.id] || 0;
                    const changeB = priceChanges24h[b.id] || 0;
                    return changeB - changeA;
                case 'pnl':
                    return b.pnlPercent - a.pnlPercent;
                case 'next-target':
                    if (!a.nextTarget && !b.nextTarget) return 0;
                    if (!a.nextTarget) return 1;
                    if (!b.nextTarget) return -1;
                    return a.nextTarget.price - b.nextTarget.price;
                case 'target-distance':
                    if (!a.targetDistance && !b.targetDistance) return 0;
                    if (!a.targetDistance) return 1;
                    if (!b.targetDistance) return -1;
                    return a.targetDistance - b.targetDistance;
                default:
                    return 0;
            }
        });
        
        assetsList.innerHTML = `
            <table class="assets-table">
                <thead>
                    <tr>
                        <th>Asset</th>
                        <th class="amount">Holdings</th>
                        <th class="price">Price</th>
                        <th class="24h-change">24h %</th>
                        <th class="value">Value</th>
                        <th class="pnl">PnL %</th>
                        <th class="next-target">Next Target</th>
                        <th class="target-distance">Distance</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedAssets.map(asset => {

                        const pnlClass = asset.pnl >= 0 ? 'positive' : 'negative';
                        const pnlSign = asset.pnl >= 0 ? '+' : '';
                        
                        // Format 24h change
                        const change24h = priceChanges24h[asset.id] || 0;
                        const change24hClass = change24h >= 0 ? 'positive' : 'negative';
                        const change24hSign = change24h >= 0 ? '+' : '';
                        
                        // Add highlight class if this is the closest asset or has passed levels
                        let highlightClass = '';
                        if (asset.id === closestAssetId) {
                            highlightClass = ' closest-exit';
                        }
                        if (asset.passedUnexecutedLevels > 0) {
                            highlightClass += ' passed-levels';
                        }
                        
                        return `
                            <tr class="asset-row${highlightClass}" data-asset-id="${asset.id}" title="Click to view ${asset.name} strategy">
                                <!-- Debug: Asset ID is ${asset.id} -->
                                <td class="asset-name-cell">
                                    <img src="${asset.icon}" alt="${asset.name}" class="asset-icon" onerror="handleImageError(this, '${asset.symbol.charAt(0)}')">
                                    <div class="asset-name-info">
                                        <span class="asset-name-text">${asset.name}</span>
                                        ${asset.passedUnexecutedLevels > 0 ? `<span class="passed-indicator">${asset.passedUnexecutedLevels} level${asset.passedUnexecutedLevels > 1 ? 's' : ''} passed!</span>` : ''}
                                    </div>
                                </td>
                                <td class="asset-amount-cell">${formatAssetAmount(asset.amount)}</td>
                                <td class="asset-price-cell">${formatPrice(asset.currentPrice)}</td>
                                <td class="asset-24h-change-cell ${change24hClass}">${change24hSign}${formatPercentage(change24h)}</td>
                                <td class="asset-value-cell">${formatCurrency(asset.currentValue)}</td>
                                <td class="asset-pnl-cell ${pnlClass}">${pnlSign}${formatPercentage(asset.pnlPercent)}</td>
                                <td class="asset-target-cell">
                                    ${asset.nextTarget ? 
                                        `<span class="target-price ${asset.nextTargetStatus === 'passed' ? 'passed-target' : ''}">${formatPrice(asset.nextTarget.price)}</span>
                                         ${asset.nextTargetStatus === 'passed' ? '<br><span class="target-status">PASSED</span>' : ''}` : 
                                        '-'
                                    }
                                </td>
                                <td class="asset-distance-cell">
                                    ${asset.targetDistance !== null ? 
                                        `<span class="distance-value ${asset.nextTargetStatus === 'passed' ? 'passed-distance' : ''}">${asset.nextTargetStatus === 'passed' ? '+' : ''}${formatPercentage(Math.abs(asset.targetDistance))}</span>` : 
                                        '-'
                                    }
                                </td>
                                <td class="asset-actions-cell">
                                    <div class="asset-actions">
                                        <button class="btn-icon edit-asset-btn" data-asset-id="${asset.id}" title="Edit holdings"><i class="fas fa-pen"></i></button>
                                        <button class="btn-icon danger delete-asset-btn" data-asset-id="${asset.id}" title="Delete asset"><i class="fas fa-trash"></i></button>
                                        <button class="btn-icon strategy-btn" data-asset-id="${asset.id}" title="View strategy"><i class="fas fa-chart-line"></i></button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        
        // Add sort change listener
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', function() {
                currentSortPreference = this.value;
                saveSortPreference();
                updatePortfolioDisplay();
            });
        }


    }, 300); // End of setTimeout
    
    // Event listeners will be handled by delegation - no need for setTimeout
    
    updatePortfolioOverview();
}

function updatePortfolioOverview() {
    let totalValue = 0;
    let totalInvested = 0;
    let totalPnL = 0;
    let totalPlannedExitValue = 0;
    let totalRealizedValue = 0;
    
    // Calculate portfolio totals
    portfolio.forEach(asset => {
        const currentPrice = currentPrices[asset.id] || 0;
        const currentValue = asset.amount * currentPrice;
        const investedValue = asset.amount * asset.avgPrice;
        const pnl = currentValue - investedValue;
        
        totalValue += currentValue;
        totalInvested += investedValue;
        totalPnL += pnl;
        
        // Calculate planned exit value for this asset
        if (asset.exitStrategy && asset.exitStrategy.length > 0) {
            let remaining = parseFloat(asset.amount) || 0;
            let assetPlannedExitValue = 0;
            
            asset.exitStrategy.forEach(ladder => {
                const percentage = parseFloat(ladder.percentage) || 0;
                const price = parseFloat(ladder.price) || 0;
                if (percentage > 0 && price > 0) {
                    const sellAmount = remaining * (percentage / 100);
                    assetPlannedExitValue += sellAmount * price;
                    remaining -= sellAmount;
                }
            });
            
            totalPlannedExitValue += assetPlannedExitValue;
        }
        
        // Calculate realized value for this asset
        let assetRealizedValue = 0;
        
        // Add executed ladder sales
        if (asset.exitStrategy) {
            asset.exitStrategy.forEach(ladder => {
                if (ladder.executed) {
                    const executedAmount = typeof ladder.executedAmount === 'number' ? ladder.executedAmount : 0;
                    const price = parseFloat(ladder.price) || 0;
                    assetRealizedValue += executedAmount * price;
                }
            });
        }
        
        // Add manual sales
        if (Array.isArray(asset.sales)) {
            asset.sales.forEach(sale => {
                const amount = parseFloat(sale.amount) || 0;
                const price = parseFloat(sale.price) || 0;
                assetRealizedValue += amount * price;
            });
        }
        
        totalRealizedValue += assetRealizedValue;
    });
    
    // Calculate overall exit progress
    const overallExitProgress = totalPlannedExitValue > 0 ? (totalRealizedValue / totalPlannedExitValue) * 100 : 0;
    
    const totalValueEl = document.getElementById('totalValue');
    if (totalValueEl) {
        if (totalValueEl.firstChild) {
            totalValueEl.firstChild.nodeValue = formatCurrency(totalValue) + ' ';
        } else {
            totalValueEl.textContent = formatCurrency(totalValue);
        }
    }
    const totalValueMetric = document.getElementById('totalValueMetric');
    if (totalValueMetric) totalValueMetric.childNodes[0].nodeValue = formatCurrency(totalValue) + ' ';
    const investedChip = document.getElementById('investedChip');
    if (investedChip) investedChip.textContent = `Invested ${formatCurrency(totalInvested)}`;
    const pnlValueEl = document.getElementById('totalPnL');
    if (pnlValueEl) pnlValueEl.textContent = formatCurrency(totalPnL);
    const pnlChip = document.getElementById('pnlChip');
    if (pnlChip) pnlChip.firstChild && (pnlChip.firstChild.nodeValue = `P&L ${formatCurrency(totalPnL)} `);
    const pnlBadge = document.getElementById('totalPnlBadge');
    if (pnlBadge) {
        const userKey = currentUser ? currentUser.username : 'guest';
        const lastKey = `pnl_last_total_${userKey}`;
        const lastPnL = parseFloat(localStorage.getItem(lastKey) || '0');
        const deltaAbs = totalPnL - lastPnL;
        const deltaPct = Math.abs(lastPnL) > 0 ? (deltaAbs / Math.abs(lastPnL)) * 100 : 0;
        localStorage.setItem(lastKey, String(totalPnL));
        const deltaText = `${deltaAbs >= 0 ? '+' : ''}${formatCurrency(Math.abs(deltaAbs))}`;
        const deltaPctText = Math.abs(deltaPct) >= 0.01 ? ` (${formatPercentage(deltaPct)})` : '';
        if (Math.abs(totalPnL) < 1e-8) {
            pnlBadge.className = 'summary-badge';
            pnlBadge.innerHTML = '';
        } else if (totalPnL >= 0) {
            pnlBadge.className = 'summary-badge positive';
            pnlBadge.innerHTML = `<i class="fas fa-arrow-up"></i> Up ${deltaText}${deltaPctText}`;
        } else {
            pnlBadge.className = 'summary-badge negative';
            pnlBadge.innerHTML = `<i class="fas fa-arrow-down"></i> Down ${deltaText}${deltaPctText}`;
        }
    }
    const exitProgressEl = document.getElementById('exitProgress');
    if (exitProgressEl) exitProgressEl.textContent = formatPercentage(overallExitProgress);
    
    // Update progress bar with animation
    const progressBar = document.getElementById('exitProgressBar');
    if (progressBar) {
        progressBar.style.width = `${overallExitProgress}%`;
    }
    
    // Add color to P&L (if element exists)
    const pnlElement = document.getElementById('totalPnL');
    if (pnlElement) {
    pnlElement.className = totalPnL >= 0 ? 'stat-value positive' : 'stat-value negative';
    }

    // Baseline trend chip for Total Value and portfolio sparkline
    try {
        const tfKey = currentUser ? `cep_tf_${currentUser.username}` : 'cep_tf';
        const timeframe = localStorage.getItem(tfKey) || 'baseline';
        const trendEl = document.getElementById('totalValueTrend');
        const baseKey = currentUser ? `base_total_${currentUser.username}` : 'base_total';
        const last = parseFloat(localStorage.getItem(baseKey)||'');
        if (trendEl && !isNaN(last) && last>0) {
            const delta = totalValue - last;
            const pct = (delta/last)*100;
            trendEl.textContent = `${delta>=0?'+':''}${formatPercentage(pct)}`;
            trendEl.className = `trend-chip ${delta>=0?'positive':'negative'}`;
        }
        if (timeframe==='baseline') localStorage.setItem(baseKey, String(totalValue));
        // Sparkline history
        const histKey = currentUser ? `spark_port_${currentUser.username}` : 'spark_port';
        const hist = JSON.parse(localStorage.getItem(histKey)||'[]');
        hist.push({ t: Date.now(), v: totalValue });
        while (hist.length>30) hist.shift();
        localStorage.setItem(histKey, JSON.stringify(hist));
        renderSparkline('portfolioSpark', hist.map(p=>p.v));
    } catch {}
    
    // Update exit projections
    updateExitProjections();
    // Re-apply currency toggle active state from prefs
    const prefs = JSON.parse(localStorage.getItem('cep_user_prefs')||'{}');
    if (prefs.currency) {
        document.querySelectorAll('.currency-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.currency === prefs.currency);
        });
    }

    // Update market overview section
    try {
        updateMarketOverview(totalValue, totalInvested, totalPnL, portfolio.length);
    } catch (error) {
        console.log('Error updating market overview:', error);
    }
}



function updateMarketOverview(totalValue, totalInvested, totalPnL, assetsCount) {
            try {
        // Update portfolio value
        const marketPortfolioValue = document.getElementById('marketPortfolioValue');
        if (marketPortfolioValue) {
            marketPortfolioValue.textContent = formatCurrency(totalValue);
        }
        
        // Calculate 24h portfolio change from stored data
        const currentUser = JSON.parse(localStorage.getItem('cep_current_user'));
        const username = currentUser?.username || 'guest';
        const pnlKey = `pnl_last_total_${username}`;
        const lastPnL = parseFloat(localStorage.getItem(pnlKey)) || 0;
        const pnlDelta = totalPnL - lastPnL;
        const pnlPercentage = lastPnL !== 0 ? (pnlDelta / Math.abs(lastPnL)) * 100 : 0;
        
        const marketPortfolioTrend = document.getElementById('marketPortfolioTrend');
        if (marketPortfolioTrend) {
            const arrow = pnlDelta >= 0 ? '↗' : '↘';
            const sign = pnlDelta >= 0 ? '+' : '';
            marketPortfolioTrend.textContent = `${arrow} ${sign}${formatPercentage(pnlPercentage)}`;
            marketPortfolioTrend.className = `trend-indicator ${pnlDelta >= 0 ? 'positive' : 'negative'}`;
        }
        
        // Calculate exit strategy data
        const exitData = calculateExitData();
        
        // Update exit value and progress
        const marketExitValue = document.getElementById('marketExitValue');
        const marketExitProgress = document.getElementById('marketExitProgress');
        const marketRealizedValue = document.getElementById('marketRealizedValue');
        if (marketExitValue) marketExitValue.textContent = formatCurrency(exitData.totalExitValue);
        if (marketExitProgress) marketExitProgress.textContent = formatPercentage(exitData.exitProgress);
        if (marketRealizedValue) marketRealizedValue.textContent = formatCurrency(exitData.totalRealizedValue);
        
        // Update financial breakdown
        updateFinancialBreakdown(exitData);
        
        // Update closest to exit list
        updateMarketClosestExits();
        
        // Update P&L indicator in portfolio section
        updatePortfolioPnLIndicator(totalPnL);
        
        // Update performance widgets
        updatePerformanceWidgets(totalPnL, exitData);
        
        // Render charts
        renderMarketCharts(totalValue);
        
    } catch (error) {
        console.log('Error updating market overview:', error);
    }
}

function calculateExitData() {
    let totalExitValue = 0;
    let totalRealizedValue = 0;
    let activeLadders = 0;
    let nextTargetPrice = 0;
    let closestDistance = Infinity;
    
    portfolio.forEach(asset => {
        const currentPrice = currentPrices[asset.id] || 0;
        
        // Calculate planned exit value
        if (asset.exitStrategy && asset.exitStrategy.length > 0) {
            let remaining = parseFloat(asset.amount) || 0;
            
            asset.exitStrategy.forEach(ladder => {
                const percentage = parseFloat(ladder.percentage) || 0;
                const price = parseFloat(ladder.price) || 0;
                
                if (!ladder.executed && percentage > 0 && price > 0) {
                    activeLadders++;
                    const sellAmount = remaining * (percentage / 100);
                    totalExitValue += sellAmount * price;
                    remaining -= sellAmount;
                    
                    // Find closest target
                    if (currentPrice > 0 && price > currentPrice) {
                        const distance = ((price - currentPrice) / currentPrice) * 100;
                        if (distance < closestDistance) {
                            closestDistance = distance;
                            nextTargetPrice = price;
                        }
                    }
                } else if (ladder.executed) {
                    const executedAmount = typeof ladder.executedAmount === 'number' ? ladder.executedAmount : 0;
                    totalRealizedValue += executedAmount * price;
                }
            });
        }
        
        // Add manual sales to realized value
        if (Array.isArray(asset.sales)) {
            asset.sales.forEach(sale => {
                const amount = parseFloat(sale.amount) || 0;
                const price = parseFloat(sale.price) || 0;
                totalRealizedValue += amount * price;
            });
        }
    });
    
    const exitProgress = totalExitValue > 0 ? (totalRealizedValue / totalExitValue) * 100 : 0;
    
    return {
        totalExitValue,
        totalRealizedValue,
        exitProgress,
        activeLadders,
        nextTargetPrice,
        taxDue: totalRealizedValue * 0.22, // 22% tax
        tithe: totalRealizedValue * 0.10,   // 10% tithe
        netAmount: totalRealizedValue * 0.68 // After tax and tithe
    };
}

function updateFinancialBreakdown(exitData) {
    const marketNetAmount = document.getElementById('marketNetAmount');
    const marketTaxDue = document.getElementById('marketTaxDue');
    const marketTithe = document.getElementById('marketTithe');
    
    if (marketNetAmount) marketNetAmount.textContent = formatCurrency(exitData.netAmount);
    if (marketTaxDue) marketTaxDue.textContent = formatCurrency(exitData.taxDue);
    if (marketTithe) marketTithe.textContent = formatCurrency(exitData.tithe);
}

function updateMarketClosestExits() {
    const container = document.getElementById('marketClosestExits');
    if (!container) return;
    
    // Get assets with passed levels and upcoming targets
    const urgentAssets = [];
    const upcomingAssets = [];
    
    portfolio.forEach(asset => {
        const currentPrice = currentPrices[asset.id] || 0;
        if (asset.exitStrategy && asset.exitStrategy.length > 0 && currentPrice > 0) {
            const unexecutedLadders = asset.exitStrategy.filter(ladder => !ladder.executed);
            
            // Check for passed levels (urgent!)
            const passedLevels = unexecutedLadders.filter(ladder => ladder.price <= currentPrice);
            if (passedLevels.length > 0) {
                const highestPassedLevel = passedLevels.sort((a, b) => b.price - a.price)[0];
                const passedBy = ((currentPrice - highestPassedLevel.price) / highestPassedLevel.price) * 100;
                
                urgentAssets.push({
                    id: asset.id,
                    name: asset.name,
                    icon: asset.icon,
                    currentPrice,
                    targetPrice: highestPassedLevel.price,
                    distance: passedBy,
                    change24h: priceChanges24h[asset.id] || 0,
                    status: 'passed',
                    passedCount: passedLevels.length
                });
            } else {
                // Look for upcoming targets
                const nextTarget = unexecutedLadders
                    .filter(ladder => ladder.price > currentPrice)
                    .sort((a, b) => a.price - b.price)[0];
                
                if (nextTarget) {
                    const distance = ((nextTarget.price - currentPrice) / currentPrice) * 100;
                    upcomingAssets.push({
                        id: asset.id,
                        name: asset.name,
                        icon: asset.icon,
                        currentPrice,
                        targetPrice: nextTarget.price,
                        distance,
                        change24h: priceChanges24h[asset.id] || 0,
                        status: 'upcoming'
                    });
                }
            }
        }
    });
    
    // Sort: urgent (passed) first, then by distance
    urgentAssets.sort((a, b) => b.distance - a.distance); // Most passed first
    upcomingAssets.sort((a, b) => a.distance - b.distance); // Closest first
    
    // Combine: urgent assets first, then upcoming
    const allAssets = [...urgentAssets, ...upcomingAssets];
    
    container.innerHTML = allAssets.slice(0, 3).map(asset => `
        <div class="trending-item ${asset.status === 'passed' ? 'urgent-item' : ''}" data-id="${asset.id}">
            <div class="coin-info">
                <img class="coin-icon" src="${asset.icon || ''}" alt="">
                <div class="coin-name-container">
                    <span class="coin-name">${asset.name}</span>
                    ${asset.status === 'passed' ? 
                        `<span class="urgent-badge">${asset.passedCount} LEVEL${asset.passedCount > 1 ? 'S' : ''} PASSED!</span>` : 
                        ''
                    }
                </div>
            </div>
            <div class="coin-metrics">
                <span class="coin-price tabular ${asset.status === 'passed' ? 'passed-price' : ''}">${formatPrice(asset.targetPrice)}</span>
                <span class="coin-change ${asset.status === 'passed' ? 'passed-change' : 'positive'}">${asset.status === 'passed' ? '+' : ''}${formatPercentage(asset.distance)}</span>
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.trending-item').forEach(item => {
        item.addEventListener('click', () => {
            const assetId = item.getAttribute('data-id');
            if (assetId) {
                window.location.href = `strategy.html?asset=${encodeURIComponent(assetId)}`;
            }
        });
    });
}

function updatePortfolioPnLIndicator(totalPnL) {
    const pnlIndicator = document.getElementById('marketPnLIndicator');
    if (pnlIndicator) {
        pnlIndicator.textContent = `P&L ${formatCurrency(totalPnL)}`;
        pnlIndicator.className = `pnl-indicator ${totalPnL >= 0 ? 'positive' : 'negative'}`;
    }
}

function updatePerformanceWidgets(totalPnL, exitData) {
    // Update exit strategy widget
    const marketActiveLadders = document.getElementById('marketActiveLadders');
    const marketNextTarget = document.getElementById('marketNextTarget');
    const marketStrategyProgress = document.getElementById('marketStrategyProgress');
    
    if (marketActiveLadders) marketActiveLadders.textContent = exitData.activeLadders;
    if (marketNextTarget) marketNextTarget.textContent = formatPrice(exitData.nextTargetPrice);
    if (marketStrategyProgress) marketStrategyProgress.style.width = `${exitData.exitProgress}%`;
}



function renderMarketCharts(totalValue) {
    // Render sparklines for market overview
    const currentUser = JSON.parse(localStorage.getItem('cep_current_user'));
    const username = currentUser?.username || 'guest';
    
    // Portfolio chart
    const portfolioKey = `spark_port_${username}`;
    const portfolioHistory = JSON.parse(localStorage.getItem(portfolioKey) || '[]');
    if (portfolioHistory.length > 0) {
        renderSparkline('marketPortfolioChart', portfolioHistory.map(p => p.v));
    }
    
    // Volume chart (using invested amount as proxy)
    const volumeHistory = portfolioHistory.map(p => p.v * 0.1); // Simple proxy
    renderSparkline('marketVolumeChart', volumeHistory);
}

function updateExitProjections() {
    let totalExitValue = 0;
    let totalRealized = 0;
    let totalTaxDue = 0;
    let totalTithe = 0;
    let totalNetAfterTaxTithe = 0;
    let totalLadders = 0;
    let remainingLadders = 0;
    
    // Track closest asset to its next exit
    let closestAsset = null; // { name, id, targetDistance }
    
    portfolio.forEach(asset => {
        if (!asset.exitStrategy || asset.exitStrategy.length === 0) return;
        // Planned exit value from remaining (non-executed) ladders using sequential remaining logic
        let remaining = parseFloat(asset.amount) || 0;
        let assetPlannedExitValue = 0;
        asset.exitStrategy.forEach(ladder => {
            const pct = (parseFloat(ladder.percentage) || 0) / 100;
            const price = parseFloat(ladder.price) || 0;
            if (pct <= 0 || price <= 0) return;
            if (ladder.executed) {
                // skip executed legs for planned value; holdings already reduced elsewhere
                return;
            }
            const sellAmount = remaining * pct;
            assetPlannedExitValue += sellAmount * price;
            remaining -= sellAmount;
        });

        // Realized value from executed ladders and manual sales records if any
        let assetRealized = 0;
        let assetTaxDue = 0;
        let assetTithe = 0;
        let assetNetAfterTaxTithe = 0;
        
        asset.exitStrategy.forEach(ladder => {
            totalLadders++;
            if (!ladder.executed) remainingLadders++;
            if (ladder.executed) {
                const amt = typeof ladder.executedAmount === 'number' ? ladder.executedAmount : 0;
                const price = parseFloat(ladder.price) || 0;
                const value = amt * price;
                assetRealized += value;
                
                // Calculate tax and tithing for executed sales
                const costBasis = amt * (parseFloat(asset.avgPrice) || 0);
                const gain = value - costBasis;
                const taxAmount = Math.max(0, gain * 0.22);
                const titheAmount = value * 0.10; // 10% tithing on total sale amount
                const netAmount = value - taxAmount - titheAmount;
                
                assetTaxDue += taxAmount;
                assetTithe += titheAmount;
                assetNetAfterTaxTithe += netAmount;
            }
        });
        
        if (Array.isArray(asset.sales)) {
            // Include only manual sales here to avoid double-counting ladder executions
            asset.sales.filter(s => s.source !== 'ladder').forEach(s => {
                const amt = parseFloat(s.amount) || 0;
                const price = parseFloat(s.price) || 0;
                const value = amt * price;
                assetRealized += value;
                
                // Calculate tax and tithing for manual sales
                const costBasis = amt * (parseFloat(asset.avgPrice) || 0);
                const gain = value - costBasis;
                const taxAmount = Math.max(0, gain * 0.22);
                const titheAmount = value * 0.10; // 10% tithing on total sale amount
                const netAmount = value - taxAmount - titheAmount;
                
                assetTaxDue += taxAmount;
                assetTithe += titheAmount;
                assetNetAfterTaxTithe += netAmount;
            });
        }

        totalExitValue += assetPlannedExitValue;
        totalRealized += assetRealized;
        totalTaxDue += assetTaxDue;
        totalTithe += assetTithe;
        totalNetAfterTaxTithe += assetNetAfterTaxTithe;
        
        // Compute next target distance for this asset to determine closest
        // Use currentPrices if available
        const currentPrice = currentPrices[asset.id] || 0;
        let targetDistance = null;
        const upcoming = [...asset.exitStrategy]
            .map(l => ({ price: parseFloat(l.price), executed: !!l.executed }))
            .filter(l => !l.executed && l.price > currentPrice)
            .sort((a, b) => a.price - b.price)[0];
        if (upcoming && currentPrice > 0) {
            targetDistance = ((upcoming.price - currentPrice) / currentPrice) * 100;
        }
        if (targetDistance !== null && isFinite(targetDistance)) {
            if (!closestAsset || targetDistance < closestAsset.targetDistance) {
                closestAsset = { name: asset.name, id: asset.id, targetDistance };
            }
        }
    });
    
    // Update main dashboard projections
    const totalExitEl = document.getElementById('totalExitValueMain');
    if (totalExitEl) totalExitEl.textContent = formatCurrency(totalExitValue);
    const realizedChip = document.getElementById('realizedChip');
    if (realizedChip) realizedChip.textContent = `Realized ${formatCurrency(totalRealized)}`;
    
    // Update tax and tithing summary if elements exist
    const taxElement = document.getElementById('totalTaxDue');
    const titheElement = document.getElementById('totalTithe');
    const netElement = document.getElementById('totalNetAfterTaxTithe');
    
    if (taxElement) taxElement.textContent = formatCurrency(totalTaxDue);
    const taxChip = document.getElementById('taxChip');
    if (taxChip) taxChip.textContent = `Tax ${formatCurrency(totalTaxDue)}`;
    if (titheElement) titheElement.textContent = formatCurrency(totalTithe);
    const titheChip = document.getElementById('titheChip');
    if (titheChip) titheChip.textContent = `Tithe ${formatCurrency(totalTithe)}`;
    if (netElement) netElement.textContent = formatCurrency(totalNetAfterTaxTithe);
    // Update remaining sells and ticks
    const remainingEl = document.getElementById('remainingSells');
    if (remainingEl) {
        const pct = totalLadders>0 ? (remainingLadders/totalLadders)*100 : 0;
        remainingEl.textContent = `${remainingLadders}/${totalLadders} (${formatPercentage(pct)})`;
    }
    const ticksEl = document.getElementById('exitTicks');
    if (ticksEl) {
        ticksEl.innerHTML = '';
        // simple 5 ticks as placeholders
        for (let i=1;i<5;i++) {
            const tick = document.createElement('div');
            tick.className = 'tick';
            tick.style.left = `${i*20}%`;
            tick.title = `${i*20}% milestone`;
            ticksEl.appendChild(tick);
        }
    }

    // Exit sparkline history
    try {
        const histKey = currentUser ? `spark_exit_${currentUser.username}` : 'spark_exit';
        const hist = JSON.parse(localStorage.getItem(histKey)||'[]');
        hist.push({ t: Date.now(), v: totalExitValue });
        while (hist.length>30) hist.shift();
        localStorage.setItem(histKey, JSON.stringify(hist));
        renderSparkline('exitSpark', hist.map(p=>p.v));
    } catch {}
    
    // Update Closest to Exit card (enriched)
    const closestCard = document.getElementById('closestExitCard');
    const closestNameEl = document.getElementById('closestExitName');
    const closestSymbolEl = document.getElementById('closestExitSymbol');
    const closestIconEl = document.getElementById('closestExitIcon');
    const closestPriceEl = document.getElementById('closestExitPrice');
    const closestTargetEl = document.getElementById('closestExitTarget');
    const closestDistanceEl = document.getElementById('closestExitDistance');
    const closestProgressBar = document.getElementById('closestExitProgressBar');
    const closestLink = document.getElementById('closestExitLink');
    if (closestCard && closestNameEl && closestDistanceEl) {
        if (closestAsset) {
            closestCard.style.display = 'block';
            const asset = portfolio.find(a => a.id === closestAsset.id);
            const price = currentPrices[closestAsset.id] || 0;
            // Find next ladder to show target
            let nextTargetPrice = null;
            if (asset && Array.isArray(asset.exitStrategy)) {
                let remaining = parseFloat(asset.amount) || 0;
                for (const ladder of asset.exitStrategy) {
                    const pct = parseFloat(ladder.percentage) || 0;
                    const ladderAmount = remaining * (pct / 100);
                    if (!ladder.executed && ladderAmount > 0) { nextTargetPrice = parseFloat(ladder.price) || null; break; }
                    remaining -= ladderAmount;
                }
            }
            if (closestIconEl && asset && asset.icon) closestIconEl.src = asset.icon;
            closestNameEl.textContent = closestAsset.name;
            if (closestSymbolEl && asset) closestSymbolEl.textContent = asset.symbol || '';
            if (closestPriceEl) closestPriceEl.textContent = formatPrice(price);
            if (closestTargetEl) closestTargetEl.textContent = nextTargetPrice != null ? formatPrice(nextTargetPrice) : '-';
            closestDistanceEl.textContent = `${formatPercentage(closestAsset.targetDistance)} from next target`;
            if (closestProgressBar) closestProgressBar.style.width = `${Math.max(0, Math.min(100, 100 - closestAsset.targetDistance))}%`;
            if (closestLink && asset) closestLink.href = `strategy.html?asset=${encodeURIComponent(asset.id)}`;
            // Make the whole card clickable
            closestCard.onclick = () => { if (asset) window.location.href = `strategy.html?asset=${encodeURIComponent(asset.id)}`; };
            // Trend chips (24h and 7d placeholder via 24h) - only if elements exist
            const c24 = priceChanges24h[closestAsset.id] || 0;
            const chip24 = document.getElementById('closestTrend24h');
            if (chip24) { 
                chip24.textContent = `${c24>=0?'+':''}${formatPercentage(c24)}`;
                chip24.className = `trend-chip ${c24>=0?'positive':'negative'}`;
            }
            const chip7d = document.getElementById('closestTrend7d');
            if (chip7d) { 
                chip7d.textContent = '';
                chip7d.className = 'trend-chip';
            }
            // Closest asset sparkline history (approx using price)
            try {
                const cHistKey = currentUser ? `spark_closest_${currentUser.username}` : 'spark_closest';
                const ch = JSON.parse(localStorage.getItem(cHistKey)||'[]');
                ch.push({ t: Date.now(), v: price });
                while (ch.length>30) ch.shift();
                localStorage.setItem(cHistKey, JSON.stringify(ch));
                renderSparkline('closestSpark', ch.map(p=>p.v));
            } catch {}

        } else {
            closestCard.style.display = 'none';
        }
    }

    // Net take-home sparkline history
    try {
        const histKey = currentUser ? `spark_net_${currentUser.username}` : 'spark_net';
        const hist = JSON.parse(localStorage.getItem(histKey)||'[]');
        hist.push({ t: Date.now(), v: totalNetAfterTaxTithe });
        while (hist.length>30) hist.shift();
        localStorage.setItem(histKey, JSON.stringify(hist));
        renderSparkline('netSpark', hist.map(p=>p.v));
    } catch {}
}

// Calculates proportional amount for a ladder index based on remaining coins logic
function calculateProportionalAmount(totalAmount, exitStrategy, ladderIndex) {
    let remaining = totalAmount;
    for (let i = 0; i < ladderIndex; i++) {
        const pct = parseFloat(exitStrategy[i].percentage) || 0;
        remaining -= totalAmount * (pct / 100);
    }
    const pctHere = parseFloat(exitStrategy[ladderIndex].percentage) || 0;
    return remaining * (pctHere / 100);
}



function calculateExitProgress(asset) {
    if (!asset.exitStrategy || asset.exitStrategy.length === 0) return 0;
    
    const totalPercentage = asset.exitStrategy.reduce((sum, ladder) => sum + parseFloat(ladder.percentage), 0);
    return Math.min(totalPercentage, 100);
}

function getUserPrefs() { try { return JSON.parse(localStorage.getItem('cep_user_prefs')||'{}'); } catch { return {}; } }
function getLocale() { const p = getUserPrefs(); return p.locale || 'en-GB'; }

function formatCurrency(amount) {
    const locale = getLocale();
    
    // Debug currency conversion issues
    if (amount !== 0 && amount !== null && amount !== undefined) {
        const exchangeRate = exchangeRates[currentCurrency];
        if (exchangeRate === undefined || exchangeRate === null) {
            console.warn('❌ Invalid exchange rate for currency:', currentCurrency, 'Available rates:', exchangeRates);
        }
        const convertedAmount = amount * exchangeRate;
        if (isNaN(convertedAmount) || convertedAmount === 1 || (convertedAmount > 0 && convertedAmount < 0.1 && amount > 1000)) {
            console.warn('🚨 Suspicious price conversion:', {
                originalAmount: amount,
                currency: currentCurrency,
                exchangeRate: exchangeRate,
                convertedAmount: convertedAmount
            });
        }
    }
    
    const convertedAmount = amount * (exchangeRates[currentCurrency] || 1);
    const maxFrac = currentCurrency === 'USD' ? 2 : 0;
    
    // Use proper currency formatting
    const isZero = Math.abs(convertedAmount) < 1e-8;
    
    // For NOK, we'll use manual formatting since Intl might not handle it well
    if (currentCurrency === 'NOK') {
        const formattedNumber = new Intl.NumberFormat(locale, {
            minimumFractionDigits: 0,
            maximumFractionDigits: isZero ? 0 : maxFrac
        }).format(convertedAmount);
        return `kr${formattedNumber}`;
    } else {
        // For USD, use standard currency formatting
        try {
            const options = isZero
                ? { style: 'currency', currency: currentCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0 }
                : { style: 'currency', currency: currentCurrency, minimumFractionDigits: 0, maximumFractionDigits: maxFrac };
            return new Intl.NumberFormat(locale, options).format(convertedAmount);
        } catch {
    const symbol = currentCurrency === 'USD' ? '$' : 'kr';
            const options = isZero
                ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
                : { minimumFractionDigits: 0, maximumFractionDigits: maxFrac };
            return symbol + new Intl.NumberFormat(locale, options).format(convertedAmount);
        }
    }
}

function persistUserPrefs(partial) {
    const key = 'cep_user_prefs';
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    const next = { ...current, ...partial };
    localStorage.setItem(key, JSON.stringify(next));
}

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.classList.add('theme-dark');
        root.classList.remove('theme-light');
    } else {
        root.classList.add('theme-light');
        root.classList.remove('theme-dark');
    }
}

function formatAssetAmount(num) {
    if (!isFinite(num)) return '0';
    const abs = Math.abs(num);
    const locale = getLocale();
    let decimals = 2;
    if (abs === 0) decimals = 2;
    else if (abs < 0.000001) decimals = 8;
    else if (abs < 0.001) decimals = 6;
    else if (abs < 1) decimals = 4;
    else decimals = 2;
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(num);
}

function formatPercentage(num, maxDecimals = 1) {
    if (!isFinite(num)) return '0%';
    const locale = getLocale();
    return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: maxDecimals }).format(num/100);
}

function formatPrice(price) {
    if (!isFinite(price) || price <= 0) return '-';
    const locale = getLocale();
    const abs = Math.abs(price);
    
    if (abs >= 1) {
        return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);
    }
    if (abs >= 0.01) {
        return new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(price);
    }
    if (abs >= 0.0001) {
        return new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(price);
    }
    if (abs >= 0.000001) {
        // Significant digits for tiny coins, CMC-like
        return new Intl.NumberFormat(locale, { minimumSignificantDigits: 3, maximumSignificantDigits: 7 }).format(price);
    }
    // For extremely small values, show with fixed decimal places instead of scientific notation
    if (abs >= 0.00000001) {
        return new Intl.NumberFormat(locale, { minimumFractionDigits: 8, maximumFractionDigits: 8 }).format(price);
    }
    // Last resort for truly tiny values - avoid scientific notation completely
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 10, maximumFractionDigits: 10 }).format(price);
}

// Price persistence functions
function savePricesToStorage() {
    try {
        // Validate prices before saving
        const validPrices = {};
        const validChanges = {};
        let invalidCount = 0;
        
        for (const [assetId, price] of Object.entries(currentPrices)) {
            if (isFinite(price) && price > 0 && price !== 1 && price < 1000000 && !isNaN(price)) {
                validPrices[assetId] = price;
                validChanges[assetId] = priceChanges24h[assetId] || 0;
            } else {
                invalidCount++;
                console.warn('🚨 Not saving invalid price for', assetId, ':', price);
            }
        }
        
        if (Object.keys(validPrices).length > 0) {
            const priceData = {
                prices: validPrices,
                changes: validChanges,
                timestamp: Date.now()
            };
            localStorage.setItem('cep_price_cache', JSON.stringify(priceData));
            console.log('💾 Saved', Object.keys(validPrices).length, 'valid prices to cache', 
                       invalidCount > 0 ? `(rejected ${invalidCount} invalid)` : '');
        } else {
            console.warn('🚨 No valid prices to save to cache');
        }
    } catch (error) {
        console.warn('Failed to save prices to storage:', error);
    }
}

function loadPricesFromStorage() {
    try {
        const stored = localStorage.getItem('cep_price_cache');
        if (stored) {
            const priceData = JSON.parse(stored);
            // Use cached prices as fallback (extended to 24 hours for better fallback)
            const cacheAge = Date.now() - priceData.timestamp;
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours for fallback purposes
            
            if (cacheAge < maxAge) {
                // Validate cached prices before using them
                const validPrices = {};
                const validChanges = {};
                
                for (const [assetId, price] of Object.entries(priceData.prices || {})) {
                    // More strict validation: reject suspicious prices
                    if (isFinite(price) && price > 0 && price !== 1 && price < 1000000 && !isNaN(price)) {
                        validPrices[assetId] = price;
                        validChanges[assetId] = priceData.changes[assetId] || 0;
                    } else {
                        console.warn('🚨 Rejecting suspicious cached price for', assetId, ':', price);
                    }
                }
                
                if (Object.keys(validPrices).length > 0) {
                    currentPrices = validPrices;
                    priceChanges24h = validChanges;
                    const ageHours = Math.round(cacheAge / (60 * 60 * 1000));
                    console.log(`📦 Loaded cached prices (${ageHours}h old):`, Object.keys(currentPrices).length, 'assets');
                    return true;
                }
            }
        }
    } catch (error) {
        console.warn('Failed to load prices from storage:', error);
    }
    return false;
}

// Data migration function to clean up corrupted legacy data
function migrateCorruptedData() {
    console.log('🔧 Checking for corrupted data to migrate...');
    
    try {
        // Clear corrupted price cache
        const priceCache = localStorage.getItem('cep_price_cache');
        if (priceCache) {
            const data = JSON.parse(priceCache);
            let hasCorruptedPrices = false;
            
            for (const [assetId, price] of Object.entries(data.prices || {})) {
                if (!isFinite(price) || price <= 0 || price === 1) {
                    hasCorruptedPrices = true;
                    break;
                }
            }
            
            if (hasCorruptedPrices) {
                console.log('🗑️ Clearing corrupted price cache');
                localStorage.removeItem('cep_price_cache');
            }
        }
        
        // Fix portfolio data if needed
        const portfolioKeys = [
            'cryptoPortfolio',
            'cep_portfolio'
        ];
        
        // Add user-specific keys
        const currentUser = JSON.parse(localStorage.getItem('cep_current_user') || 'null');
        if (currentUser) {
            portfolioKeys.push(`cryptoPortfolio_${currentUser.username}`);
        }
        
        portfolioKeys.forEach(key => {
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    const data = JSON.parse(stored);
                    let needsUpdate = false;
                    
                    data.forEach(asset => {
                        // Fix unrealistic holdings (likely corrupted)
                        if (asset.amount > 1000000 && ['ADA', 'CRO', 'DOGE', 'SHIB'].includes(asset.symbol)) {
                            console.log(`🔧 Fixing corrupted holdings for ${asset.symbol}: ${asset.amount} -> reasonable amount`);
                            // Reset to reasonable amounts for these coins
                            switch(asset.symbol) {
                                case 'ADA':
                                    asset.amount = Math.min(asset.amount, 100000); // Max 100k ADA
                                    break;
                                case 'CRO':
                                    asset.amount = Math.min(asset.amount, 500000); // Max 500k CRO
                                    break;
                                case 'DOGE':
                                    asset.amount = Math.min(asset.amount, 100000); // Max 100k DOGE
                                    break;
                                case 'SHIB':
                                    asset.amount = Math.min(asset.amount, 10000000); // Max 10M SHIB
                                    break;
                            }
                            needsUpdate = true;
                        }
                        
                        // Fix average price if it's clearly wrong
                        if (asset.avgPrice === 1 || asset.avgPrice === 100) {
                            const basePrice = getBasePrice(asset.symbol);
                            if (basePrice && basePrice !== 1) {
                                console.log(`🔧 Fixing corrupted avg price for ${asset.symbol}: ${asset.avgPrice} -> ${basePrice}`);
                                asset.avgPrice = basePrice;
                                needsUpdate = true;
                            }
                        }
                    });
                    
                    if (needsUpdate) {
                        localStorage.setItem(key, JSON.stringify(data));
                        console.log(`✅ Updated portfolio data in ${key}`);
                    }
                } catch (error) {
                    console.warn(`Failed to migrate data for key ${key}:`, error);
                }
            }
        });
        
        console.log('✅ Data migration completed');
        
    } catch (error) {
        console.error('❌ Data migration failed:', error);
    }
}

// ===== EVENTS SECTION FUNCTIONALITY =====

let currentEventsFilter = 'portfolio';
let currentEventsTimeframe = '24h';
let eventsCache = {};

function initializeEventsSection() {
    const eventsSection = document.getElementById('recentEventsSection');
    if (!eventsSection) return;
    
    // Show events section if user has assets
    if (portfolio.length > 0) {
        eventsSection.style.display = 'block';
        setupEventsEventListeners();
        fetchRecentEvents();
    }
}

function setupEventsEventListeners() {
    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentEventsFilter = tab.dataset.filter;
            filterAndDisplayEvents();
        });
    });
    
    // Timeframe selector
    const timeframeSelect = document.getElementById('eventsTimeframe');
    if (timeframeSelect) {
        timeframeSelect.addEventListener('change', () => {
            currentEventsTimeframe = timeframeSelect.value;
            fetchRecentEvents();
        });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshEventsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchRecentEvents(true);
        });
    }
    
    // Toggle button (now in main assets header)
    const toggleBtn = document.getElementById('toggleEventsBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const eventsSection = document.getElementById('recentEventsSection');
            const isVisible = eventsSection.style.display !== 'none';
            eventsSection.style.display = isVisible ? 'none' : 'block';
            
            // Update button text and style
            if (isVisible) {
                toggleBtn.innerHTML = '<i class="fas fa-newspaper"></i> Show Events';
                toggleBtn.className = 'btn btn-outline';
                toggleBtn.title = 'Show events section';
            } else {
                toggleBtn.innerHTML = '<i class="fas fa-newspaper"></i> Events';
                toggleBtn.className = 'btn btn-secondary';
                toggleBtn.title = 'Hide events section';
            }
            
            // Save preference
            localStorage.setItem('cep_events_visible', isVisible ? 'false' : 'true');
        });
    }
    
    // Load visibility preference and set initial button state
    const eventsVisible = localStorage.getItem('cep_events_visible') !== 'false';
    const eventsSection = document.getElementById('recentEventsSection');
    if (eventsSection) {
        eventsSection.style.display = eventsVisible ? 'block' : 'none';
    }
    
    if (toggleBtn) {
        if (eventsVisible) {
            toggleBtn.innerHTML = '<i class="fas fa-newspaper"></i> Events';
            toggleBtn.className = 'btn btn-secondary';
            toggleBtn.title = 'Hide events section';
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-newspaper"></i> Show Events';
            toggleBtn.className = 'btn btn-outline';
            toggleBtn.title = 'Show events section';
        }
    }
}

async function fetchRecentEvents(forceRefresh = false) {
    const cacheKey = `events_${currentEventsTimeframe}`;
    const now = Date.now();
    const cacheAge = 10 * 60 * 1000; // 10 minutes
    
    // Check cache first
    if (!forceRefresh && eventsCache[cacheKey] && (now - eventsCache[cacheKey].timestamp) < cacheAge) {
        console.log('📦 Using cached events data');
        displayEvents(eventsCache[cacheKey].data);
        return;
    }
    
    const feedContainer = document.getElementById('eventsFeed');
    if (!feedContainer) return;
    
    feedContainer.innerHTML = `
        <div class="events-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading recent events...</span>
        </div>
    `;
    
    try {
        // Fetch trending data and portfolio-specific events
        const [trendingData, portfolioEvents] = await Promise.all([
            fetchTrendingData(),
            generatePortfolioEvents()
        ]);
        
        const allEvents = [...portfolioEvents, ...trendingData];
        
        // Cache the results
        eventsCache[cacheKey] = {
            data: allEvents,
            timestamp: now
        };
        
        displayEvents(allEvents);
        
    } catch (error) {
        console.error('Failed to fetch events:', error);
        feedContainer.innerHTML = `
            <div class="events-error">
                <i class="fas fa-exclamation-triangle"></i>
                <div>Failed to load events. <button onclick="fetchRecentEvents(true)" class="btn-text">Try again</button></div>
            </div>
        `;
    }
}

async function fetchTrendingData() {
    try {
        // Fetch trending coins from CoinGecko
        const response = await fetch('https://api.coingecko.com/api/v3/search/trending');
        if (!response.ok) throw new Error('Trending API failed');
        
        const data = await response.json();
        const events = [];
        
        // Convert trending data to events format
        data.coins?.slice(0, 5).forEach((coin, index) => {
            events.push({
                id: `trending_${coin.item.id}`,
                assetId: coin.item.id,
                assetSymbol: coin.item.symbol,
                assetName: coin.item.name,
                assetIcon: coin.item.large,
                title: `${coin.item.name} is trending #${index + 1}`,
                description: `${coin.item.symbol} is currently one of the most searched cryptocurrencies on CoinGecko`,
                timestamp: Date.now() - (index * 30 * 60 * 1000), // Spread over last 30 mins
                source: 'CoinGecko Trending',
                impact: 'neutral',
                type: 'trending'
            });
        });
        
        return events;
        
    } catch (error) {
        console.warn('Failed to fetch trending data:', error);
        return [];
    }
}

async function generatePortfolioEvents() {
    const events = [];
    const now = Date.now();
    
    // Generate events based on portfolio asset price changes and fetch news
    const assetPromises = portfolio.map(async (asset) => {
        const assetEvents = [];
        const priceChange = priceChanges24h[asset.id] || 0;
        
        if (Math.abs(priceChange) > 5) { // Significant price movement
            const isPositive = priceChange > 0;
            const impact = isPositive ? 'positive' : 'negative';
            const direction = isPositive ? 'surged' : 'dropped';
            
            assetEvents.push({
                id: `price_${asset.id}`,
                assetId: asset.id,
                assetSymbol: asset.symbol,
                assetName: asset.name,
                assetIcon: asset.icon,
                title: `${asset.name} ${direction} ${Math.abs(priceChange).toFixed(1)}%`,
                description: `${asset.symbol} has experienced significant price movement in the last 24 hours, ${isPositive ? 'gaining' : 'losing'} ${Math.abs(priceChange).toFixed(1)}% in value.`,
                timestamp: now - Math.random() * 24 * 60 * 60 * 1000, // Random time in last 24h
                source: 'Price Movement',
                impact: impact,
                type: 'price_movement'
            });
        }
        
        // Fetch real news events for major assets
        if (['bitcoin', 'ethereum', 'cardano', 'solana', 'crypto-com-chain'].includes(asset.id)) {
            try {
                const newsEvents = await fetchRealCryptoNews(asset);
                assetEvents.push(...newsEvents);
            } catch (error) {
                console.warn(`Failed to fetch news for ${asset.name}:`, error);
                // Don't add static events as fallback - only use real dynamic content
            }
        }
        
        return assetEvents;
    });
    
    // Wait for all asset events to be fetched
    const allAssetEvents = await Promise.all(assetPromises);
    allAssetEvents.forEach(assetEvents => {
        events.push(...assetEvents);
    });
    
    return events;
}

async function fetchRealCryptoNews(asset) {
    const events = [];
    const now = Date.now();
    
    try {
        // Try multiple news sources for better coverage
        const newsPromises = [
            fetchCryptoPanicNews(asset),
            fetchCoinDeskRSS(asset),
            fetchRedditCrypto(asset)
        ];
        
        const newsResults = await Promise.allSettled(newsPromises);
        
        // Combine results from all sources
        newsResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                events.push(...result.value);
            }
        });
        
        // Sort by timestamp (newest first) and limit to 5 per asset
        events.sort((a, b) => b.timestamp - a.timestamp);
        return events.slice(0, 5);
        
    } catch (error) {
        console.warn(`Failed to fetch news for ${asset.name}:`, error);
        // Fallback to sample events if all APIs fail
        return generateFallbackEvents(asset);
    }
}

async function fetchCryptoPanicNews(asset) {
    try {
        // CryptoPanic free tier - no API key needed for basic requests
        const symbolMap = {
            'bitcoin': 'BTC',
            'ethereum': 'ETH', 
            'cardano': 'ADA',
            'solana': 'SOL',
            'crypto-com-chain': 'CRO'
        };
        
        const symbol = symbolMap[asset.id] || asset.symbol.toUpperCase();
        const response = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=free&filter=hot&currencies=${symbol}&format=json`);
        
        if (!response.ok) throw new Error('CryptoPanic API failed');
        
        const data = await response.json();
        const events = [];
        
        data.results?.slice(0, 3).forEach((article, index) => {
            const sentiment = article.votes?.positive > article.votes?.negative ? 'positive' : 
                             article.votes?.negative > article.votes?.positive ? 'negative' : 'neutral';
            
            events.push({
                id: `cryptopanic_${asset.id}_${article.id}`,
                assetId: asset.id,
                assetSymbol: asset.symbol,
                assetName: asset.name,
                assetIcon: asset.icon,
                title: `${asset.name}: ${article.title}`,
                description: `${article.title} - Latest news affecting ${asset.name} (${asset.symbol})`,
                timestamp: new Date(article.published_at).getTime(),
                source: article.source?.title || 'CryptoPanic',
                sourceUrl: article.url,
                impact: sentiment,
                type: 'news'
            });
        });
        
        return events;
    } catch (error) {
        console.warn('CryptoPanic API failed:', error);
        return [];
    }
}

async function fetchCoinDeskRSS(asset) {
    try {
        // Use RSS-to-JSON service for CoinDesk feed
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://www.coindesk.com/arc/outboundfeeds/rss/`);
        
        if (!response.ok) throw new Error('RSS feed failed');
        
        const data = await response.json();
        const events = [];
        
        // Filter articles related to the asset
        const keywords = [asset.name.toLowerCase(), asset.symbol.toLowerCase()];
        
        data.items?.filter(item => 
            keywords.some(keyword => 
                item.title.toLowerCase().includes(keyword) || 
                item.description.toLowerCase().includes(keyword)
            )
        ).slice(0, 2).forEach((article, index) => {
            events.push({
                id: `coindesk_${asset.id}_${index}`,
                assetId: asset.id,
                assetSymbol: asset.symbol,
                assetName: asset.name,
                assetIcon: asset.icon,
                title: `${asset.name}: ${article.title}`,
                description: `${article.description.replace(/<[^>]*>/g, '').substring(0, 150)}... (Related to ${asset.name})`,
                timestamp: new Date(article.pubDate).getTime(),
                source: 'CoinDesk',
                sourceUrl: article.link,
                impact: 'neutral',
                type: 'news'
            });
        });
        
        return events;
    } catch (error) {
        console.warn('CoinDesk RSS failed:', error);
        return [];
    }
}

async function fetchRedditCrypto(asset) {
    try {
        // Reddit API for crypto-related posts
        const response = await fetch(`https://www.reddit.com/r/cryptocurrency/hot.json?limit=25`);
        
        if (!response.ok) throw new Error('Reddit API failed');
        
        const data = await response.json();
        const events = [];
        
        // Filter posts related to the asset
        const keywords = [asset.name.toLowerCase(), asset.symbol.toLowerCase()];
        
        data.data?.children?.filter(post => 
            keywords.some(keyword => 
                post.data.title.toLowerCase().includes(keyword) ||
                post.data.selftext.toLowerCase().includes(keyword)
            )
        ).slice(0, 2).forEach((post, index) => {
            events.push({
                id: `reddit_${asset.id}_${index}`,
                assetId: asset.id,
                assetSymbol: asset.symbol,
                assetName: asset.name,
                assetIcon: asset.icon,
                title: `${asset.name} Discussion: ${post.data.title}`,
                description: `Community discussion about ${asset.name}: ${post.data.selftext.substring(0, 120)}...` || `Community discussion about ${asset.name}`,
                timestamp: post.data.created_utc * 1000,
                source: 'r/cryptocurrency',
                sourceUrl: `https://reddit.com${post.data.permalink}`,
                impact: 'neutral',
                type: 'community'
            });
        });
        
        return events;
    } catch (error) {
        console.warn('Reddit API failed:', error);
        return [];
    }
}

function generateFallbackEvents(asset) {
    // Simplified fallback events with Google search links
    const templates = {
        bitcoin: ['Bitcoin ETF news', 'Bitcoin institutional adoption'],
        ethereum: ['Ethereum network upgrade', 'Ethereum DeFi development'],
        cardano: ['Cardano ecosystem development', 'Cardano partnerships'],
        solana: ['Solana network performance', 'Solana ecosystem growth']
    };
    
    const assetTemplates = templates[asset.id] || [`${asset.name} news`];
    
    return assetTemplates.map((template, index) => ({
        id: `fallback_${asset.id}_${index}`,
        assetId: asset.id,
        assetSymbol: asset.symbol,
        assetName: asset.name,
        assetIcon: asset.icon,
        title: `${asset.name}: Latest ${template}`,
        description: `Search for recent developments and news specifically about ${asset.name} (${asset.symbol}) regarding ${template.toLowerCase()}.`,
        timestamp: Date.now() - (index * 3600000),
        source: 'Google Search',
        sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(template + ' ' + asset.name)}`,
        impact: 'neutral',
        type: 'search'
    }));
}

function generateSampleEvents(asset) {
    const events = [];
    const now = Date.now();
    
    // Sample event templates with real news source links
    const eventTemplates = {
        bitcoin: [
            {
                title: 'Bitcoin ETF Sees Record Inflows',
                description: 'Institutional investors continue to show strong interest in Bitcoin ETFs with record daily inflows.',
                impact: 'positive',
                sourceUrl: 'https://www.google.com/search?q=Bitcoin+ETF+record+inflows+institutional+investors',
                source: 'Google Search'
            },
            {
                title: 'MicroStrategy Adds More BTC to Treasury',
                description: 'MicroStrategy announces additional Bitcoin purchases for its corporate treasury.',
                impact: 'positive',
                sourceUrl: 'https://www.google.com/search?q=MicroStrategy+Bitcoin+treasury+purchase+announcement',
                source: 'Google Search'
            }
        ],
        ethereum: [
            {
                title: 'Ethereum Network Upgrade Completed',
                description: 'Latest network upgrade successfully deployed, improving transaction efficiency.',
                impact: 'positive',
                sourceUrl: 'https://www.google.com/search?q=Ethereum+network+upgrade+transaction+efficiency+completed',
                source: 'Google Search'
            },
            {
                title: 'DeFi TVL Reaches New Heights',
                description: 'Total Value Locked in Ethereum DeFi protocols continues to grow.',
                impact: 'positive',
                sourceUrl: 'https://www.google.com/search?q=Ethereum+DeFi+TVL+total+value+locked+new+heights',
                source: 'Google Search'
            }
        ],
        cardano: [
            {
                title: 'Cardano DeFi Ecosystem Expansion',
                description: 'New DeFi protocols launching on Cardano network, expanding ecosystem utility.',
                impact: 'positive',
                sourceUrl: 'https://www.google.com/search?q=Cardano+DeFi+ecosystem+expansion+new+protocols',
                source: 'Google Search'
            },
            {
                title: 'Grayscale Registers Cardano ETF Entity',
                description: 'Grayscale has registered Cardano Trust ETF entities in Delaware, signaling potential S-1 filings.',
                impact: 'positive',
                sourceUrl: 'https://www.google.com/search?q=Grayscale+Cardano+ETF+entity+Delaware+registration',
                source: 'Google Search'
            }
        ],
        solana: [
            {
                title: 'Solana Network Performance Improvements',
                description: 'Recent upgrades have enhanced network stability and transaction throughput.',
                impact: 'positive',
                sourceUrl: 'https://www.google.com/search?q=Solana+network+performance+improvements+upgrade',
                source: 'Google Search'
            },
            {
                title: 'Major Gaming Platform Chooses Solana',
                description: 'Leading gaming company selects Solana for NFT and gaming infrastructure.',
                impact: 'positive',
                sourceUrl: 'https://www.google.com/search?q=gaming+platform+Solana+NFT+infrastructure+adoption',
                source: 'Google Search'
            }
        ]
    };
    
    const templates = eventTemplates[asset.id] || [];
    
    templates.forEach((template, index) => {
        events.push({
            id: `sample_${asset.id}_${index}`,
            assetId: asset.id,
            assetSymbol: asset.symbol,
            assetName: asset.name,
            assetIcon: asset.icon,
            title: template.title,
            description: template.description,
            timestamp: now - Math.random() * 7 * 24 * 60 * 60 * 1000, // Random time in last 7 days
            source: template.source || 'Crypto News',
            sourceUrl: template.sourceUrl,
            impact: template.impact,
            type: 'news'
        });
    });
    
    return events;
}

function displayEvents(events) {
    const feedContainer = document.getElementById('eventsFeed');
    if (!feedContainer) return;
    
    // Filter events based on current filter
    const filteredEvents = filterEvents(events);
    
    if (filteredEvents.length === 0) {
        feedContainer.innerHTML = `
            <div class="events-empty">
                <i class="fas fa-newspaper"></i>
                <div>No recent events found for the selected filter.</div>
            </div>
        `;
        return;
    }
    
    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit to 10 events
    const limitedEvents = filteredEvents.slice(0, 10);
    
    feedContainer.innerHTML = limitedEvents.map(event => createEventHTML(event)).join('');
    
    // Add click handlers for external links only
    feedContainer.querySelectorAll('.event-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Only handle clicks if there's a source URL and not clicking on link elements
            if (!e.target.closest('a')) {
                const sourceUrl = item.dataset.sourceUrl;
                if (sourceUrl && sourceUrl !== 'null') {
                    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                }
            }
        });
    });
}

function filterEvents(events) {
    switch (currentEventsFilter) {
        case 'portfolio':
            return events.filter(event => 
                portfolio.some(asset => asset.id === event.assetId)
            );
        case 'trending':
            return events.filter(event => event.type === 'trending');
        case 'all':
        default:
            return events;
    }
}

function createEventHTML(event) {
    const timeAgo = formatTimeAgo(event.timestamp);
    const hasSourceUrl = event.sourceUrl && event.sourceUrl.startsWith('http');
    
    return `
        <div class="event-item" data-asset-id="${event.assetId}" ${hasSourceUrl ? `data-source-url="${event.sourceUrl}"` : ''}>
            <div class="event-asset">
                <img src="${event.assetIcon || ''}" alt="${event.assetName}" onerror="handleImageError(this, '${event.assetSymbol?.charAt(0) || '?'}')">
                <span class="event-asset-symbol">${event.assetSymbol}</span>
            </div>
            <div class="event-content">
                <div class="event-header">
                    <h4 class="event-title">${event.title}</h4>
                    ${hasSourceUrl ? `<a href="${event.sourceUrl}" target="_blank" rel="noopener noreferrer" class="event-link" onclick="event.stopPropagation()">
                        <i class="fas fa-external-link-alt"></i>
                    </a>` : ''}
                </div>
                <p class="event-description">${event.description}</p>
                <div class="event-meta">
                    <span class="event-time">
                        <i class="fas fa-clock"></i>
                        ${timeAgo}
                    </span>
                    <span class="event-impact ${event.impact}">
                        ${event.impact === 'positive' ? '📈' : event.impact === 'negative' ? '📉' : '📊'} 
                        ${event.impact}
                    </span>
                    ${hasSourceUrl ? 
                        `<a href="${event.sourceUrl}" target="_blank" rel="noopener noreferrer" class="event-source-link" onclick="event.stopPropagation()">${event.source}</a>` :
                        `<span class="event-source">${event.source}</span>`
                    }
                </div>
            </div>
        </div>
    `;
}

function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) {
        return `${minutes}m ago`;
    } else if (hours < 24) {
        return `${hours}h ago`;
    } else {
        return `${days}d ago`;
    }
}

function filterAndDisplayEvents() {
    const cachedData = Object.values(eventsCache).find(cache => cache.data);
    if (cachedData) {
        displayEvents(cachedData.data);
    }
}

// Global function to show events section (helpful for recovery)
window.showEventsSection = function() {
    const eventsSection = document.getElementById('recentEventsSection');
    const toggleBtn = document.getElementById('toggleEventsBtn');
    
    if (eventsSection) {
        eventsSection.style.display = 'block';
    }
    
    if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="fas fa-newspaper"></i> Events';
        toggleBtn.className = 'btn btn-secondary';
        toggleBtn.title = 'Hide events section';
    }
    
    localStorage.setItem('cep_events_visible', 'true');
    console.log('✅ Events section is now visible');
};

// Global function for manual data cleanup (can be called from browser console)
window.cleanupPortfolioData = function() {
    console.log('🧹 Manual portfolio data cleanup...');
    
    // Clear all price caches
    localStorage.removeItem('cep_price_cache');
    console.log('✅ Cleared price cache');
    
    // Reset currentPrices object
    currentPrices = {};
    priceChanges24h = {};
    console.log('✅ Reset current prices');
    
    // Refresh data
    migrateCorruptedData();
    updatePortfolioDisplay();
    fetchCurrentPrices();
    
    console.log('✅ Portfolio data cleanup completed! Please refresh the page.');
    
    // Show alert to user
    alert('Data cleanup completed! The page will refresh to apply changes.');
    window.location.reload();
};

// Clear only corrupted cached prices (not real API prices)
function clearCorruptedPriceCache() {
    try {
        const cached = localStorage.getItem('cep_price_cache');
        if (cached) {
            const data = JSON.parse(cached);
            // Only clear if cache contains obviously invalid prices
            let hasCorruptedPrices = false;
            for (const [assetId, price] of Object.entries(data.prices || {})) {
                if (!isFinite(price) || price <= 0 || price === 1) {
                    hasCorruptedPrices = true;
                    break;
                }
            }
            if (hasCorruptedPrices) {
                console.log('🗑️ Clearing corrupted price cache (contains invalid prices)');
                localStorage.removeItem('cep_price_cache');
                return true;
            }
        }
    } catch (error) {
        console.warn('Error checking price cache:', error);
        localStorage.removeItem('cep_price_cache');
        return true;
    }
    return false;
}

async function fetchCurrentPrices() {
    let usingRealPrices = false;
    
    // First try to load from cache (last known good prices)
    const hasCachedPrices = loadPricesFromStorage();
    
    try {
        // Try to fetch real prices from CoinGecko API
        if (portfolio.length > 0) {
            const assetIds = portfolio.map(asset => asset.id).join(',');
            const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${assetIds}&vs_currencies=usd&include_24hr_change=true`;
            
            const response = await fetch(apiUrl, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                let hasRealData = false;
                let newPrices = { ...currentPrices }; // Start with existing prices
                let newChanges = { ...priceChanges24h };
                
                portfolio.forEach(asset => {
                    if (data[asset.id]) {
                        const usdPrice = data[asset.id].usd || 0;
                        
                        // Validate API price before using it
                        if (isFinite(usdPrice) && usdPrice > 0 && usdPrice !== 1 && !isNaN(usdPrice)) {
                            newPrices[asset.id] = usdPrice;
                            newChanges[asset.id] = data[asset.id].usd_24h_change || 0;
                        hasRealData = true;
                            console.log('✅ Updated price for', asset.symbol, ':', usdPrice);
                        } else {
                            console.warn('🚨 Invalid API price for', asset.symbol, ':', usdPrice, '- keeping cached price');
                            // Keep existing cached price, don't update with invalid data
                        }
                    } else {
                        console.log('⚠️ No API data for', asset.symbol, '- keeping cached price');
                        // Keep existing cached price, don't fall back to hardcoded
                    }
                });
                
                // Only update if we got valid new data
                if (hasRealData) {
                    currentPrices = newPrices;
                    priceChanges24h = newChanges;
                    usingRealPrices = true;
                } else {
                    console.log('📦 No valid API data received, using cached prices');
                }
            } else {
                console.log('📦 API request failed, using cached prices');
                // Keep existing cached prices, don't replace with hardcoded
            }
        }
    } catch (error) {
        console.log('API error:', error);
        console.log('📦 Using cached prices due to API error');
        // Keep existing cached prices, don't replace with hardcoded
    }
    
    // Only use hardcoded base prices for assets that have NO price data at all
    portfolio.forEach(asset => {
        if (!currentPrices[asset.id]) {
            const basePrice = getBasePrice(asset.symbol);
            if (basePrice) {
                currentPrices[asset.id] = basePrice;
                priceChanges24h[asset.id] = 0; // No change data for hardcoded prices
                console.log('🆕 Using hardcoded price for new asset', asset.symbol, ':', basePrice);
            } else {
                console.warn('❌ No price data available for', asset.symbol);
            }
        }
    });
    
    // Update price source indicator (if it exists)
    const priceSourceElement = document.getElementById('priceSource');
    if (priceSourceElement) {
        priceSourceElement.textContent = usingRealPrices ? 'Live' : 'Offline';
        priceSourceElement.className = usingRealPrices ? 'stat-value positive' : 'stat-value negative';
    }
    
    // Save prices to storage for persistence
    if (Object.keys(currentPrices).length > 0) {
        savePricesToStorage();
    }
    
    updatePortfolioDisplay();
}

function getBasePrice(symbol) {
    const basePrices = {
        'BTC': 95000,   // Updated December 2024 price
        'ETH': 3600,    // Updated December 2024 price
        'BNB': 650,     // Updated December 2024 price
        'SOL': 200,     // Updated December 2024 price
        'ADA': 0.87,    // Updated Cardano price (December 2024)
        'XRP': 2.20,    // Updated December 2024 price
        'DOT': 7.50,    // Updated December 2024 price
        'DOGE': 0.32,   // Updated December 2024 price
        'AVAX': 40,     // Updated December 2024 price
        'LINK': 23,     // Updated December 2024 price
        'MATIC': 0.45,  // Updated December 2024 price
        'LTC': 100,     // Updated December 2024 price
        'UNI': 15,      // Updated December 2024 price
        'BCH': 450,     // Updated December 2024 price
        'XLM': 0.35,    // Updated December 2024 price
        'CRO': 0.18,    // Updated Cronos price (December 2024)
        'SHIB': 0.000025, // Updated December 2024 price
        'TRX': 0.25,    // Updated December 2024 price
        'ATOM': 8,
        'XMR': 150,
        'ALGO': 0.15,
        'VET': 0.02,
        'FIL': 5,
        'XTZ': 1,
        'NEO': 12,
        'DASH': 30,
        'ZEC': 25,
        'DCR': 20,
        'RVN': 0.02,
        'DGB': 0.01,
        'XVG': 0.005,
        'PIVX': 0.3,
        'NAV': 0.2,
        'GRS': 0.5,
        'VTC': 0.1,
        'FTC': 0.001,
        'NVC': 0.5,
        'PPC': 0.3,
        'NMC': 0.5,
        'XPM': 0.1,
        'AUR': 0.1,
        'WDC': 0.01,
        'MEC': 0.001,
        'IFC': 0.0001,
        'PXC': 0.01,
        'CRW': 0.1
    };
    
    const basePrice = basePrices[symbol];
    
    // If we have a base price, use it
    if (basePrice) {
        return basePrice;
    }
    
    // Final fallback - return null to indicate no price available
    console.warn('❌ No price available for symbol:', symbol, '- skipping price update');
    return null;
}



// savePortfolio function is now handled at the top of the file
// This duplicate function has been removed to prevent conflicts



function saveSortPreference() {
    const key = currentUser ? `sort_preference_${currentUser.username}` : 'sort_preference';
    localStorage.setItem(key, currentSortPreference);
}

function loadSortPreference() {
    const key = currentUser ? `sort_preference_${currentUser.username}` : 'sort_preference';
    const saved = localStorage.getItem(key);
    currentSortPreference = saved || 'name';
    
    // Update the select element if it exists
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.value = currentSortPreference;
    }
}







// Cloud Sync Functions
function initializeCloudSync() {
    // Check for existing sync data
    const syncData = localStorage.getItem('cep_sync_data');
    if (syncData) {
        try {
            const parsed = JSON.parse(syncData);
            lastSyncTime = parsed.lastSyncTime;
            syncStatus = parsed.syncStatus || 'local';
        } catch (e) {
            console.error('Error parsing sync data:', e);
        }
    }
    
    // Update sync status in UI
    updateSyncStatus();
}

function updateSyncStatus() {
    const syncIndicator = document.getElementById('syncIndicator');
    if (!syncIndicator) return;
    
    const statusText = document.getElementById('syncStatusText');
    const statusIcon = document.getElementById('syncStatusIcon');
    
    switch (syncStatus) {
        case 'local':
            statusText.textContent = 'Local Only';
            statusIcon.className = 'fas fa-laptop';
            syncIndicator.className = 'sync-indicator local';
            break;
        case 'syncing':
            statusText.textContent = 'Syncing...';
            statusIcon.className = 'fas fa-sync-alt fa-spin';
            syncIndicator.className = 'sync-indicator syncing';
            break;
        case 'synced':
            statusText.textContent = 'Synced';
            statusIcon.className = 'fas fa-cloud';
            syncIndicator.className = 'sync-indicator synced';
            break;
        case 'error':
            statusText.textContent = 'Sync Error';
            statusIcon.className = 'fas fa-exclamation-triangle';
            syncIndicator.className = 'sync-indicator error';
            break;
    }
}

function syncToCloud() {
    if (!currentUser) {
        alert('Please log in to sync your data');
        return;
    }
    
    syncStatus = 'syncing';
    updateSyncStatus();
    
    // Simulate cloud sync (replace with actual cloud service)
    setTimeout(() => {
        try {
            const syncData = {
                portfolio: portfolio,
                notifications: notifications,
                userPreferences: {
                    sortPreference: currentSortPreference,
                    currency: selectedCurrency
                },
                lastSyncTime: new Date().toISOString(),
                userId: currentUser.username
            };
            
            // Store in localStorage as "cloud" data
            localStorage.setItem(`cep_cloud_${currentUser.username}`, JSON.stringify(syncData));
            localStorage.setItem('cep_sync_data', JSON.stringify({
                lastSyncTime: syncData.lastSyncTime,
                syncStatus: 'synced'
            }));
            
            syncStatus = 'synced';
            lastSyncTime = syncData.lastSyncTime;
            updateSyncStatus();
            
            addNotification({
                type: 'success',
                title: 'Data Synced',
                message: 'Your portfolio has been successfully synced to the cloud.',
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Sync error:', error);
            syncStatus = 'error';
            updateSyncStatus();
            
            addNotification({
                type: 'error',
                title: 'Sync Failed',
                message: 'Failed to sync your data. Please try again.',
                timestamp: Date.now()
            });
        }
    }, 1500);
}

function syncFromCloud() {
    if (!currentUser) {
        alert('Please log in to sync your data');
        return;
    }
    
    syncStatus = 'syncing';
    updateSyncStatus();
    
    // Simulate cloud sync (replace with actual cloud service)
    setTimeout(() => {
        try {
            const cloudData = localStorage.getItem(`cep_cloud_${currentUser.username}`);
            if (cloudData) {
                const parsed = JSON.parse(cloudData);
                
                // Merge cloud data with local data
                portfolio = parsed.portfolio || portfolio;
                notifications = parsed.notifications || notifications;
                
                if (parsed.userPreferences) {
                    currentSortPreference = parsed.userPreferences.sortPreference || currentSortPreference;
                    selectedCurrency = parsed.userPreferences.currency || selectedCurrency;
                }
                
                // Save merged data locally
                savePortfolio();
                saveNotifications();
                saveSortPreference();
                
                syncStatus = 'synced';
                lastSyncTime = parsed.lastSyncTime;
                updateSyncStatus();
                
                // Update UI
                updatePortfolioDisplay();
                updatePortfolioOverview();
                renderNotifications();
                
                addNotification({
                    type: 'success',
                    title: 'Data Restored',
                    message: 'Your portfolio has been restored from the cloud.',
                    timestamp: Date.now()
                });
            } else {
                syncStatus = 'local';
                updateSyncStatus();
                
                addNotification({
                    type: 'info',
                    title: 'No Cloud Data',
                    message: 'No cloud data found for your account.',
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('Sync error:', error);
            syncStatus = 'error';
            updateSyncStatus();
            
            addNotification({
                type: 'error',
                title: 'Sync Failed',
                message: 'Failed to restore data from cloud. Please try again.',
                timestamp: Date.now()
            });
        }
    }, 1500);
}

// Bulk Operations Functions
function toggleBulkEditMode() {
    bulkEditMode = !bulkEditMode;
    selectedAssets.clear();
    
    const bulkEditBtn = document.getElementById('bulkEditBtn');
    const bulkActions = document.getElementById('bulkActions');
    const assetsTable = document.querySelector('.assets-table');
    
    if (bulkEditMode) {
        bulkEditBtn.textContent = 'Cancel Bulk Edit';
        bulkEditBtn.className = 'btn btn-secondary';
        bulkActions.style.display = 'flex';
        
        // Add checkboxes to table
        if (assetsTable) {
            const headerRow = assetsTable.querySelector('thead tr');
            if (headerRow && !headerRow.querySelector('.bulk-select-header')) {
                const headerCell = document.createElement('th');
                headerCell.className = 'bulk-select-header';
                headerCell.innerHTML = '<input type="checkbox" id="selectAllAssets">';
                headerRow.insertBefore(headerCell, headerRow.firstChild);
            }
            
            // Add checkboxes to existing rows
            assetsTable.querySelectorAll('tbody tr').forEach(row => {
                if (!row.querySelector('.bulk-select-cell')) {
                    const cell = document.createElement('td');
                    cell.className = 'bulk-select-cell';
                    cell.innerHTML = '<input type="checkbox" class="asset-checkbox">';
                    row.insertBefore(cell, row.firstChild);
                }
            });
        }
    } else {
        bulkEditBtn.textContent = 'Bulk Edit';
        bulkEditBtn.className = 'btn btn-primary';
        bulkActions.style.display = 'none';
        
        // Remove checkboxes
        if (assetsTable) {
            const headerCell = assetsTable.querySelector('.bulk-select-header');
            if (headerCell) headerCell.remove();
            
            assetsTable.querySelectorAll('.bulk-select-cell').forEach(cell => cell.remove());
        }
    }
    
    updateBulkActions();
}

function toggleAssetSelection(assetId) {
    if (selectedAssets.has(assetId)) {
        selectedAssets.delete(assetId);
    } else {
        selectedAssets.add(assetId);
    }
    updateBulkActions();
}

function selectAllAssets() {
    const checkboxes = document.querySelectorAll('.asset-checkbox');
    const selectAllCheckbox = document.getElementById('selectAllAssets');
    
    if (selectAllCheckbox.checked) {
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            const assetId = checkbox.closest('tr').dataset.assetId;
            selectedAssets.add(assetId);
        });
    } else {
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        selectedAssets.clear();
    }
    
    updateBulkActions();
}

function updateBulkActions() {
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const bulkEditBtn = document.getElementById('bulkEditBtn');
    const selectedCount = selectedAssets.size;
    
    if (bulkDeleteBtn) {
        bulkDeleteBtn.textContent = `Delete (${selectedCount})`;
        bulkDeleteBtn.disabled = selectedCount === 0;
    }
    
    if (bulkEditBtn && bulkEditMode) {
        bulkEditBtn.textContent = `Cancel Bulk Edit (${selectedCount} selected)`;
    }
}

function bulkDeleteAssets() {
    if (selectedAssets.size === 0) return;
    
    const confirmMessage = `Are you sure you want to delete ${selectedAssets.size} asset${selectedAssets.size > 1 ? 's' : ''}?`;
    if (!confirm(confirmMessage)) return;
    
    selectedAssets.forEach(assetId => {
        const index = portfolio.findIndex(asset => asset.id === assetId);
        if (index !== -1) {
            portfolio.splice(index, 1);
        }
    });
    
    savePortfolio();
    updatePortfolioDisplay();
    toggleBulkEditMode();
    
    addNotification({
        type: 'success',
        title: 'Assets Deleted',
        message: `Successfully deleted ${selectedAssets.size} asset${selectedAssets.size > 1 ? 's' : ''}.`,
        timestamp: Date.now()
    });
}

function bulkUpdateAssets() {
    if (selectedAssets.size === 0) return;
    
    // Show bulk update modal/form
    showBulkUpdateModal();
}

function showBulkUpdateModal() {
    const modal = document.getElementById('bulkUpdateModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideBulkUpdateModal() {
    const modal = document.getElementById('bulkUpdateModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function applyBulkUpdate() {
    const updateType = document.getElementById('bulkUpdateType').value;
    const updateValue = parseFloat(document.getElementById('bulkUpdateValue').value);
    
    if (!updateValue || isNaN(updateValue)) {
        alert('Please enter a valid value');
        return;
    }
    
    selectedAssets.forEach(assetId => {
        const asset = portfolio.find(a => a.id === assetId);
        if (asset) {
            switch (updateType) {
                case 'amount':
                    asset.amount = updateValue;
                    break;
                case 'avgPrice':
                    asset.avgPrice = updateValue;
                    break;
                case 'percentage':
                    // Update all exit strategy percentages
                    if (asset.exitStrategy) {
                        asset.exitStrategy.forEach(ladder => {
                            ladder.percentage = updateValue.toString();
                        });
                    }
                    break;
            }
        }
    });
    
    savePortfolio();
    updatePortfolioDisplay();
    hideBulkUpdateModal();
    toggleBulkEditMode();
    
    addNotification({
        type: 'success',
        title: 'Bulk Update Complete',
        message: `Updated ${selectedAssets.size} asset${selectedAssets.size > 1 ? 's' : ''} with new ${updateType}.`,
        timestamp: Date.now()
    });
}

// ===== MARKET TICKER FUNCTIONALITY =====

// Market Ticker Functionality
async function updateMarketTicker() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true', {
            headers: {
                'Accept': 'application/json'
            },
            mode: 'cors'
        });
        const data = await response.json();
        
        // Update BTC
        const btcPrice = formatCurrency(data.bitcoin.usd);
        const btcChange = data.bitcoin.usd_24h_change;
        const btcPriceEl = document.getElementById('btcPrice');
        const btcChangeEl = document.getElementById('btcChange');
        
        if (btcPriceEl) btcPriceEl.textContent = btcPrice;
        if (btcChangeEl) {
            btcChangeEl.textContent = `${btcChange > 0 ? '+' : ''}${btcChange.toFixed(2)}%`;
            btcChangeEl.className = `ticker-change ${btcChange >= 0 ? 'positive' : 'negative'}`;
        }
        
        // Update ETH
        const ethPrice = formatCurrency(data.ethereum.usd);
        const ethChange = data.ethereum.usd_24h_change;
        const ethPriceEl = document.getElementById('ethPrice');
        const ethChangeEl = document.getElementById('ethChange');
        
        if (ethPriceEl) ethPriceEl.textContent = ethPrice;
        if (ethChangeEl) {
            ethChangeEl.textContent = `${ethChange > 0 ? '+' : ''}${ethChange.toFixed(2)}%`;
            ethChangeEl.className = `ticker-change ${ethChange >= 0 ? 'positive' : 'negative'}`;
        }
        
        // Update alt season indicator (simplified logic)
        const altSeasonEl = document.getElementById('altSeasonIndicator');
        if (altSeasonEl) {
            if (ethChange > btcChange + 5) {
                altSeasonEl.textContent = 'Alt Season';
                altSeasonEl.className = 'ticker-indicator bullish';
            } else if (btcChange > ethChange + 5) {
                altSeasonEl.textContent = 'BTC Dominance';
                altSeasonEl.className = 'ticker-indicator bearish';
            } else {
                altSeasonEl.textContent = 'Neutral';
                altSeasonEl.className = 'ticker-indicator';
            }
        }
        
        // Fetch market cap
        const globalResponse = await fetch('https://api.coingecko.com/api/v3/global');
        const globalData = await globalResponse.json();
        const marketCap = globalData.data.total_market_cap.usd;
        const marketCapEl = document.getElementById('totalMarketCap');
        if (marketCapEl) {
            marketCapEl.textContent = formatCurrency(marketCap / 1e12, 2) + 'T';
        }
        
    } catch (error) {
        console.log('Failed to fetch market data (CORS or API limit):', error);
        
        // Show fallback data instead of blank
        const btcPriceEl = document.getElementById('btcPrice');
        const btcChangeEl = document.getElementById('btcChange');
        const ethPriceEl = document.getElementById('ethPrice');
        const ethChangeEl = document.getElementById('ethChange');
        const marketCapEl = document.getElementById('totalMarketCap');
        
        if (btcPriceEl) btcPriceEl.textContent = '$--,---';
        if (btcChangeEl) {
            btcChangeEl.textContent = 'API Limited';
            btcChangeEl.className = 'ticker-change';
        }
        if (ethPriceEl) ethPriceEl.textContent = '$--,---';
        if (ethChangeEl) {
            ethChangeEl.textContent = 'API Limited';
            ethChangeEl.className = 'ticker-change';
        }
        if (marketCapEl) marketCapEl.textContent = '--T';
    }
}

// Initialize all currency displays with proper formatting
function initializeCurrencyDisplays() {
    const currencyElements = [
        'marketPortfolioValue',
        'marketExitValue', 
        'marketRealizedValue',
        'marketNextTarget',
        'marketNetAmount',
        'marketTaxDue',
        'marketTithe'
    ];
    
    const zeroValue = formatCurrency(0);
    
    currencyElements.forEach(id => {
        const element = document.getElementById(id);
        if (element && (element.textContent === '0' || element.textContent === '$0')) {
            element.textContent = zeroValue;
        }
    });
    
    // Initialize P&L indicator
    const pnlIndicator = document.getElementById('marketPnLIndicator');
    if (pnlIndicator && (pnlIndicator.textContent === 'P&L 0' || pnlIndicator.textContent === 'P&L $0')) {
        pnlIndicator.textContent = `P&L ${zeroValue}`;
    }
    
    // Initialize realized chip if it exists
    const realizedChip = document.getElementById('realizedChip');
    if (realizedChip && (realizedChip.textContent.includes('$0') || realizedChip.textContent === 'Realized $0')) {
        realizedChip.textContent = `Realized ${zeroValue}`;
    }
    
    // Initialize any other elements that might contain currency
    const allElementsWithCurrency = document.querySelectorAll('[id*="total"], [id*="realized"], [id*="value"], [id*="amount"]');
    allElementsWithCurrency.forEach(element => {
        if (element.textContent && element.textContent.includes('$0')) {
            element.textContent = element.textContent.replace('$0', zeroValue);
        }
    });
}

// Initialize market ticker on page load
if (document.getElementById('btcPrice')) {
    updateMarketTicker();
    setInterval(updateMarketTicker, 60000); // Update every minute
}




