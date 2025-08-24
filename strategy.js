// Global variables
let currentAsset = null;
let currentCurrency = (JSON.parse(localStorage.getItem('cep_user_prefs')||'{}').currency) || 'NOK';
let currentPrices = {};
let priceChanges24h = {};
let currentEditSaleIndex = null;
let currentEditPurchaseIndex = null;
let percentageMode = (function(){
    // Use global preference for percentage mode
    return localStorage.getItem('cep_percentage_mode') || 'remaining';
})();

// Currency conversion rates
const exchangeRates = {
    USD: 1,
    NOK: 10.5
};

// Helper function to format dates for display
function formatDateTime(dateString) {
    if (!dateString) return 'Invalid Date';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        
        const userPrefs = JSON.parse(localStorage.getItem('cep_user_prefs') || '{}');
        const locale = userPrefs.locale || 'en-GB';
        
        // Format as: "Aug 13, 2025, 12:00 PM"
        return date.toLocaleString(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch (error) {
        console.warn('Error formatting date:', dateString, error);
        return 'Invalid Date';
    }
}

// Helper function to format dates for datetime-local input
function formatDateTimeForInput(dateString) {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        
        // Format as YYYY-MM-DDTHH:MM for datetime-local input
        return date.toISOString().slice(0, 16);
    } catch (error) {
        console.warn('Error formatting date for input:', dateString, error);
        return '';
    }
}

function initializeTheme() {
    // Initialize theme consistency with main page
    const prefs = JSON.parse(localStorage.getItem('cep_user_prefs')||'{}');
    let theme = prefs.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light');
    applyTheme(theme);
    
    // Setup theme toggle button if it exists
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.setAttribute('aria-pressed', String(theme==='dark'));
        themeBtn.innerHTML = theme==='dark' ? '<i class="fas fa-sun" aria-hidden="true"></i>' : '<i class="fas fa-moon" aria-hidden="true"></i>';
        themeBtn.addEventListener('click', () => {
            theme = (theme === 'dark') ? 'light' : 'dark';
            applyTheme(theme);
            persistUserPrefs({ theme });
            themeBtn.setAttribute('aria-pressed', String(theme==='dark'));
            themeBtn.innerHTML = theme==='dark' ? '<i class="fas fa-sun" aria-hidden="true"></i>' : '<i class="fas fa-moon" aria-hidden="true"></i>';
        });
    }
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

function persistUserPrefs(partial) {
    const key = 'cep_user_prefs';
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    const next = { ...current, ...partial };
    localStorage.setItem(key, JSON.stringify(next));
}

// ===== PRICE ALERT FUNCTIONS =====

async function createPriceAlert(ladder, ladderIndex) {
    if (!window.isAuthenticated || !window.currentUser) {
        console.log('📧 User not authenticated, skipping price alert creation');
        return;
    }

    if (!window.supabase) {
        console.log('📧 Supabase not available, skipping price alert creation');
        return;
    }

    try {
        console.log('📧 Creating price alert for ladder:', { ladder, ladderIndex, asset: currentAsset.symbol });

        const alertData = {
            user_id: window.currentUser.id,
            asset_id: currentAsset.id,
            asset_name: currentAsset.name,
            symbol: currentAsset.symbol,
            target_price: parseFloat(ladder.price),
            direction: 'above', // Exit levels are typically "above" current price
            alert_type: 'exit_level',
            percentage_to_sell: parseFloat(ladder.percentage),
            current_price: currentPrices[currentAsset.id] || null,
            user_email: window.currentUser.email,
            is_active: true,
            is_triggered: false,
            email_sent: false
        };

        // Check if alert already exists for this target price
        const { data: existingAlerts, error: checkError } = await window.supabase
            .from('price_alerts')
            .select('id')
            .eq('user_id', window.currentUser.id)
            .eq('asset_id', currentAsset.id)
            .eq('target_price', alertData.target_price)
            .eq('alert_type', 'exit_level');

        if (checkError) {
            console.error('❌ Error checking existing alerts:', checkError);
            return;
        }

        if (existingAlerts && existingAlerts.length > 0) {
            // Update existing alert
            const { error: updateError } = await window.supabase
                .from('price_alerts')
                .update({
                    percentage_to_sell: alertData.percentage_to_sell,
                    current_price: alertData.current_price,
                    is_active: true,
                    is_triggered: false, // Reset if it was previously triggered
                    email_sent: false,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingAlerts[0].id);

            if (updateError) {
                console.error('❌ Error updating price alert:', updateError);
                return;
            }

            console.log('✅ Price alert updated successfully');
        } else {
            // Create new alert
            const { error: insertError } = await window.supabase
                .from('price_alerts')
                .insert([alertData]);

            if (insertError) {
                console.error('❌ Error creating price alert:', insertError);
                return;
            }

            console.log('✅ Price alert created successfully');
        }

        // Show success notification
        showPriceAlertNotification(`📧 Email alert set for ${currentAsset.symbol} at ${formatCurrency(ladder.price)}`);

    } catch (error) {
        console.error('❌ Error in createPriceAlert:', error);
    }
}

async function removePriceAlert(targetPrice) {
    if (!window.isAuthenticated || !window.currentUser || !window.supabase) {
        return;
    }

    try {
        const { error } = await window.supabase
            .from('price_alerts')
            .delete()
            .eq('user_id', window.currentUser.id)
            .eq('asset_id', currentAsset.id)
            .eq('target_price', targetPrice)
            .eq('alert_type', 'exit_level');

        if (error) {
            console.error('❌ Error removing price alert:', error);
            return;
        }

        console.log('✅ Price alert removed successfully');
        showPriceAlertNotification(`📧 Email alert removed for ${currentAsset.symbol} at ${formatCurrency(targetPrice)}`);
    } catch (error) {
        console.error('❌ Error in removePriceAlert:', error);
    }
}

function showPriceAlertNotification(message) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 1000;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// ===== END PRICE ALERT FUNCTIONS =====

// Initialize the strategy page
document.addEventListener('DOMContentLoaded', function() {
    initializeStrategyPage();
});

function initializeStrategyPage() {
    initializeTheme();
    setupEventListeners();

    loadCachedPrices(); // Load cached prices first
    loadAssetData();
    fetchCurrentPrices();
    
    // Set correct currency button active state
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.currency === currentCurrency);
    });
    
    // Initialize currency displays
    initializeStrategyCurrencyDisplays();
    
    // Initialize Net Take-Home view preference
    initializeStrategyNetTakeHomeView();
    
    // Fetch prices every 30 seconds
    setInterval(fetchCurrentPrices, 30000);
    // Apply percentage mode UI now that DOM is ready
    applyPercentageModeUI();
}

function setupEventListeners() {
    // Currency toggle
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCurrency = this.dataset.currency;
            
            // Persist currency preference
            const prefs = JSON.parse(localStorage.getItem('cep_user_prefs')||'{}');
            prefs.currency = currentCurrency;
            localStorage.setItem('cep_user_prefs', JSON.stringify(prefs));
            
            // Update all displays
            updateDisplay();
            renderSales();
            renderPurchases();
            initializeStrategyCurrencyDisplays(); // Re-initialize currency displays
            
            console.log('Strategy page: Currency changed to:', currentCurrency);
        });
    });

    // Net Take-Home toggle (strategy page)
    const strategyNetTakeHomeToggle = document.getElementById('strategyNetTakeHomeToggle');
    if (strategyNetTakeHomeToggle) {
        strategyNetTakeHomeToggle.addEventListener('click', function() {
            toggleStrategyNetTakeHomeView();
        });
    }

    // Add ladder button
    document.getElementById('addLadderBtn').addEventListener('click', addExitLadder);

    // Sales events
    const addSaleBtn = document.getElementById('addSaleBtn');
    if (addSaleBtn) addSaleBtn.addEventListener('click', addSaleRecord);
    
    // Purchases events
    const addPurchaseBtn = document.getElementById('addPurchaseBtn');
    if (addPurchaseBtn) addPurchaseBtn.addEventListener('click', addPurchaseRecord);
    
    // Wallet management events
    const addWalletBtn = document.getElementById('addWalletBtn');
    if (addWalletBtn) addWalletBtn.addEventListener('click', addWalletRecord);

    // Keyboard: save with Cmd/Ctrl+S
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        if ((isMac && e.metaKey && e.key.toLowerCase() === 's') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 's')) {
            e.preventDefault();
            // Commit current edits by blurring focused input
            if (document.activeElement && document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            savePortfolio();
        }
    });

    // Keyboard: Tab/Enter to move across inputs within exit ladder rows
    document.getElementById('exitLadders').addEventListener('keydown', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        const row = target.closest('tr');
        if (!row) return;
        const inputs = Array.from(row.querySelectorAll('input.table-input'));
        const idx = inputs.indexOf(target);
        if (e.key === 'Enter') {
            e.preventDefault();
            const next = inputs[idx + 1] || inputs[0];
            next.focus();
            next.select?.();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextRow = row.nextElementSibling;
            if (nextRow) {
                const nextInput = nextRow.querySelector(`input.table-input.${target.classList[1]}`) || nextRow.querySelector('input.table-input');
                nextInput?.focus();
                nextInput?.select?.();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevRow = row.previousElementSibling;
            if (prevRow) {
                const prevInput = prevRow.querySelector(`input.table-input.${target.classList[1]}`) || prevRow.querySelector('input.table-input');
                prevInput?.focus();
                prevInput?.select?.();
            }
        }
    });

    // Percentage mode toggle
    const modeRemainingBtn = document.getElementById('modeRemainingBtn');
    const modeTotalBtn = document.getElementById('modeTotalBtn');
    if (modeRemainingBtn && modeTotalBtn) {
        modeRemainingBtn.addEventListener('click', () => setPercentageMode('remaining'));
        modeTotalBtn.addEventListener('click', () => setPercentageMode('total'));
    }
}

function applyPercentageModeUI() {
    const header = document.getElementById('percentageHeader');
    const remBtn = document.getElementById('modeRemainingBtn');
    const totBtn = document.getElementById('modeTotalBtn');
    if (header) header.textContent = percentageMode === 'remaining' ? '% of Remaining' : '% of Total';
    if (remBtn && totBtn) {
        remBtn.classList.toggle('active', percentageMode === 'remaining');
        remBtn.setAttribute('aria-pressed', String(percentageMode === 'remaining'));
        totBtn.classList.toggle('active', percentageMode === 'total');
        totBtn.setAttribute('aria-pressed', String(percentageMode === 'total'));
    }
}

function setPercentageMode(mode) {
    if (mode !== 'remaining' && mode !== 'total') return;
    if (mode === percentageMode) return;
    // Convert existing ladder percentages between modes
    if (currentAsset && Array.isArray(currentAsset.exitStrategy) && currentAsset.exitStrategy.length) {
        if (mode === 'total' && percentageMode === 'remaining') {
            // Remaining -> Total
            let remainingFraction = 1;
            currentAsset.exitStrategy = currentAsset.exitStrategy.map(l => {
                const r = (parseFloat(l.percentage) || 0) / 100; // fraction of remaining
                const t = remainingFraction * r; // fraction of total
                remainingFraction *= (1 - r);
                return { ...l, percentage: t * 100 };
            });
        } else if (mode === 'remaining' && percentageMode === 'total') {
            // Total -> Remaining
            let used = 0;
            currentAsset.exitStrategy = currentAsset.exitStrategy.map(l => {
                const t = (parseFloat(l.percentage) || 0) / 100; // fraction of total
                const remaining = 1 - used;
                const r = remaining > 0 ? (t / remaining) : 0; // fraction of remaining
                used += t;
                return { ...l, percentage: r * 100 };
            });
        }
        savePortfolio();
        renderExitLadders();
        updateProjections();
        updateProgress();
    }
    percentageMode = mode;
    // Use global preference for percentage mode
    localStorage.setItem('cep_percentage_mode', percentageMode);
    applyPercentageModeUI();
}



function loadAssetData() {
    console.log('Strategy page: loadAssetData called');
    
    // Get asset ID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const assetId = urlParams.get('asset');
    
    console.log('Strategy page: URL params:', window.location.search);
    console.log('Strategy page: assetId from URL:', assetId);
    
    if (!assetId) {
        console.log('Strategy page: No asset ID found in URL parameters');
        alert('Please select an asset from the main dashboard to view its strategy.');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
        return;
    }
    
    // Load portfolio from Supabase (loaded by main app auth system)
    let portfolio = window.portfolio || [];
    
    // If portfolio is empty, user may not be authenticated or data not loaded yet
    if (portfolio.length === 0) {
        console.log('⚠️ Portfolio is empty - user may need to sign in or data is still loading');
        
        // Check if user is authenticated
        if (!window.isAuthenticated) {
            alert('Please sign in to view your portfolio strategies.');
            window.location.href = 'auth.html';
            return;
        }
        
        // If authenticated but no portfolio, wait a moment for Supabase to load
        console.log('🔄 Waiting for portfolio to load from Supabase...');
        setTimeout(() => {
            if (window.portfolio && window.portfolio.length > 0) {
                console.log('✅ Portfolio loaded, reloading strategy page');
                window.location.reload();
            } else {
                console.log('❌ No portfolio data found after waiting');
                alert('No portfolio data found. Please add some assets on the main dashboard first.');
                window.location.href = 'index.html';
            }
        }, 2000); // Wait 2 seconds for Supabase load
        return;
    }
    
    // CRITICAL: Ensure window.portfolio is synchronized with what we loaded
    if (portfolio.length > 0 && (!window.portfolio || window.portfolio.length === 0)) {
        console.log('🔄 Synchronizing window.portfolio with loaded data...');
        window.portfolio = portfolio;
    }
    
    console.log('Strategy page: Loaded portfolio:', portfolio.length, 'assets');
    console.log('Strategy page: Looking for asset ID:', assetId);
    
    currentAsset = portfolio.find(asset => asset.id === assetId);
    console.log('Strategy page: Found currentAsset:', currentAsset);
    console.log('Strategy page: currentAsset detailed:', {
        id: currentAsset?.id, 
        symbol: currentAsset?.symbol, 
        amount: currentAsset?.amount,
        exitStrategy: currentAsset?.exitStrategy?.length || 0,
        wallets: currentAsset?.wallets?.length || 0,
        sales: currentAsset?.sales?.length || 0,
        purchases: currentAsset?.purchases?.length || 0
    });
    
    // Debug: Show what was loaded from window.portfolio
    console.log('🔍 Strategy page: portfolio source check:', {
        windowPortfolioLength: window.portfolio?.length || 0,
        portfolioLength: portfolio.length,
        authenticated: window.isAuthenticated
    });
    
    const windowAsset = window.portfolio?.find(a => a.id === assetId);
    console.log('🔍 Strategy page: window.portfolio asset:', {
        found: !!windowAsset,
        exitStrategy: windowAsset?.exitStrategy?.length || 0,
        wallets: windowAsset?.wallets?.length || 0,
        sales: windowAsset?.sales?.length || 0,
        purchases: windowAsset?.purchases?.length || 0
    });
    
    if (!currentAsset) {
        console.error('Asset not found:', assetId, 'in portfolio:', portfolio);
        
        // Wait a moment for portfolio to potentially load from Supabase
        setTimeout(() => {
            const retryAsset = window.portfolio?.find(asset => asset.id === assetId);
            
            if (!retryAsset) {
                alert(`Asset with ID "${assetId}" not found in your portfolio. Please add it first.`);
                window.location.href = 'index.html';
            } else {
                console.log('Found asset on retry, reloading page...');
                location.reload();
            }
        }, 2000);
        return;
    }
    
    updateAssetDisplay();
    renderExitLadders();
    renderWallets();
    renderSales();
    renderPurchases();
    updateProjections();
    updateProgress();
    updateAssetTicker();
}

function updateAssetDisplay() {
    if (!currentAsset) {
        console.error('updateAssetDisplay: currentAsset is null');
        return;
    }
    
    console.log('updateAssetDisplay: currentAsset:', currentAsset);
    
    // Update header
    const strategyTitle = document.getElementById('strategyTitle');
    const assetNameLarge = document.getElementById('assetNameLarge');
    const assetSymbolLarge = document.getElementById('assetSymbolLarge');
    const assetIconLarge = document.getElementById('assetIconLarge');
    
    if (strategyTitle) strategyTitle.textContent = `${currentAsset.name} Exit Strategy`;
    if (assetNameLarge) assetNameLarge.textContent = currentAsset.name;
    if (assetSymbolLarge) assetSymbolLarge.textContent = currentAsset.symbol;
    if (assetIconLarge) {
        assetIconLarge.src = currentAsset.icon;
        assetIconLarge.alt = currentAsset.name;
    }
    
    // Update asset stats
    const currentPrice = currentPrices[currentAsset.id] || 0;
    const currentValue = currentAsset.amount * currentPrice;
    const investedValue = currentAsset.amount * currentAsset.avgPrice;
    const pnl = currentValue - investedValue;
    
    console.log('updateAssetDisplay: Price calculation debug:', {
        assetId: currentAsset.id,
        amount: currentAsset.amount,
        currentPrice: currentPrice,
        currentValue: currentValue,
        currentPrices: currentPrices
    });
    
    const holdingsAmount = document.getElementById('holdingsAmount');
    const holdingsSymbolEl = document.getElementById('holdingsSymbol');
    const currentValueEl = document.getElementById('currentValue');
    const avgPriceEl = document.getElementById('avgPrice');
    const totalPnLEl = document.getElementById('totalPnL');
    
    if (holdingsAmount) holdingsAmount.textContent = `${formatAssetAmount(currentAsset.amount)}`;
    if (holdingsSymbolEl) holdingsSymbolEl.textContent = currentAsset.symbol;
    if (currentValueEl) currentValueEl.textContent = formatCurrency(currentValue);
    if (avgPriceEl) avgPriceEl.textContent = formatPrice(currentAsset.avgPrice || 0);
    if (totalPnLEl) totalPnLEl.textContent = formatCurrency(pnl);
    const assetPnlBadge = document.getElementById('assetPnlBadge');
    if (assetPnlBadge) {
        const userKey = (window.currentUser && window.currentUser.email) ? window.currentUser.email : 'guest';
        const lastKey = `pnl_last_${userKey}_${currentAsset.id}`;
        const lastPnL = parseFloat(localStorage.getItem(lastKey) || '0');
        const deltaAbs = pnl - lastPnL;
        const deltaPct = Math.abs(lastPnL) > 0 ? (deltaAbs / Math.abs(lastPnL)) * 100 : 0;
        localStorage.setItem(lastKey, String(pnl));
        const deltaText = `${deltaAbs >= 0 ? '+' : ''}${formatCurrency(Math.abs(deltaAbs))}`;
        const deltaPctText = Math.abs(deltaPct) >= 0.01 ? ` (${formatPercentage(deltaPct)})` : '';
        if (Math.abs(pnl) < 1e-8) {
            assetPnlBadge.className = 'summary-badge';
            assetPnlBadge.innerHTML = '';
        } else if (pnl >= 0) {
            assetPnlBadge.className = 'summary-badge positive';
            assetPnlBadge.innerHTML = `<i class="fas fa-arrow-up"></i> Up ${deltaText}${deltaPctText}`;
        } else {
            assetPnlBadge.className = 'summary-badge negative';
            assetPnlBadge.innerHTML = `<i class="fas fa-arrow-down"></i> Down ${deltaText}${deltaPctText}`;
        }
    }
    const currentPriceLarge = document.getElementById('currentPriceLarge');
    if (currentPriceLarge) currentPriceLarge.textContent = formatPrice(currentPrice);
    
    // Add color to P&L
    const pnlElement = document.getElementById('totalPnL');
    if (pnlElement) pnlElement.className = pnl >= 0 ? 'stat-value positive' : 'stat-value negative';
}

function renderExitLadders() {
    const exitLaddersContainer = document.getElementById('exitLadders');
    const table = exitLaddersContainer.querySelector('.exit-levels-table');
    const emptyState = exitLaddersContainer.querySelector('.empty-state-modern');
    
    if (!currentAsset.exitStrategy || currentAsset.exitStrategy.length === 0) {
        table.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        // Hide summary when no levels
        const summary = exitLaddersContainer.querySelector('.exit-levels-summary');
        if (summary) summary.style.display = 'none';
    } else {
        table.style.display = 'table';
        if (emptyState) emptyState.style.display = 'none';
        
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = currentAsset.exitStrategy.map((ladder, index) => {
            const amount = calculateLadderAmount(index);
            const value = calculateLadderValue(index);
            const statusClass = ladder.executed ? 'executed' : 'planned';
            const statusText = ladder.executed ? 'Executed' : 'Planned';
            const isNewRecord = ladder.price === 0 && ladder.percentage === 0;
            // Keep editing mode if this row is actively being edited
            const isBeingEdited = ladder._isEditing || isNewRecord;
            
            // Calculate price increase from previous level
            let priceIncrease = '';
            if (index > 0 && currentAsset.exitStrategy[index - 1]) {
                const currentPrice = parseFloat(ladder.price) || 0;
                const previousPrice = parseFloat(currentAsset.exitStrategy[index - 1].price) || 0;
                if (currentPrice > 0 && previousPrice > 0) {
                    const increasePercent = ((currentPrice - previousPrice) / previousPrice) * 100;
                    priceIncrease = `+${increasePercent.toFixed(1)}%`;
                } else {
                    priceIncrease = '-';
                }
            } else {
                priceIncrease = '-'; // First level has no previous level
            }
            
            // Calculate distance to target from current market price
            let distanceToTarget = '';
            let distanceClass = '';
            let distanceStatus = 'pending';
            const targetPrice = parseFloat(ladder.price) || 0;
            const marketPrice = currentPrices[currentAsset.id] || 0;
            
            if (targetPrice > 0 && marketPrice > 0) {
                const distance = ((targetPrice - marketPrice) / marketPrice) * 100;
                if (distance <= 0) {
                    // Target has been passed/reached
                    distanceToTarget = `+${Math.abs(distance).toFixed(1)}%`;
                    distanceClass = 'passed-target';
                    distanceStatus = 'passed';
                } else {
                    // Target is still ahead
                    distanceToTarget = `${distance.toFixed(1)}%`;
                    distanceClass = distance <= 10 ? 'close-target' : 'normal-target';
                    distanceStatus = 'pending';
                }
            } else {
                distanceToTarget = '-';
                distanceClass = '';
                distanceStatus = 'unknown';
            }
            
            return `
                <tr class="exit-level-row ${statusClass} ${isBeingEdited ? 'editing' : ''}" data-ladder-index="${index}">
                    <td class="level-cell" data-label="Level">
                        <span class="level-badge">L${index + 1}</span>
                    </td>
                    <td class="price-cell" data-label="Target Price">
                        ${isBeingEdited || ladder.executed ? 
                            `<input 
                               type="text" 
                               class="table-input price-input" 
                               placeholder="e.g., 50000" 
                               value="${formatNumberInput(ladder.price)}" 
                               inputmode="decimal"
                               onblur="updateLadderField(${index}, 'price', this.value)"
                               onfocus="startEditingLadder(${index})"
                               ${ladder.executed ? 'disabled' : ''}>` :
                            `<span class="display-value">${formatCurrency(ladder.price)}</span>`
                        }
                    </td>
                    <td class="percentage-cell" data-label="Percentage">
                        ${isBeingEdited || ladder.executed ? 
                            `<input type="text" 
                               class="table-input percentage-input" 
                               placeholder="20" 
                               value="${formatNumberInput(ladder.percentage)}" 
                               inputmode="decimal"
                               max="100"
                               min="0"
                               onblur="finishEditingLadder(${index}, 'percentage', this.value)"
                               onfocus="startEditingLadder(${index})"
                               oninput="validatePercentageInput(this)"
                               ${ladder.executed ? 'disabled' : ''}>
                            <span class="input-suffix">%</span>` :
                            `<span class="display-value">${formatPercentage(ladder.percentage)}</span>`
                        }
                    </td>
                    <td class="price-increase-cell" data-label="Price Increase %">
                        <span class="display-value ${index > 0 && priceIncrease !== '-' ? 'positive' : ''}">${priceIncrease}</span>
                    </td>
                    <td class="distance-to-target-cell" data-label="Distance to Target">
                        <span class="display-value ${distanceClass}">${distanceToTarget}</span>
                        ${distanceStatus === 'passed' ? '<span class="target-passed-indicator">PASSED</span>' : ''}
                    </td>
                    <td class="amount-cell" data-label="Amount">
                        <span class="amount-display">${formatAssetAmount(parseFloat(amount))} ${currentAsset.symbol}</span>
                    </td>
                    <td class="value-cell" data-label="Value">
                        <span class="value-display">${formatCurrency(value)}</span>
                    </td>
                    <td class="status-cell" data-label="Status">
                        <div class="status-controls">
                            <span class="pill pill-${statusClass}">${statusText}</span>
                            ${!ladder.executed ? 
                                `<label class="switch" title="Toggle executed">
                                    <input type="checkbox" onchange="toggleLadderExecuted(${index}, this.checked)">
                            <span class="slider"></span>
                                </label>` : ''
                            }
                    </div>
                    </td>
                    <td class="actions-cell" data-label="Actions">
                        ${isNewRecord ? 
                            `<button class="btn-icon success save-level-btn" data-level-index="${index}" title="Save level">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn-icon secondary cancel-level-btn" data-level-index="${index}" title="Cancel">
                                <i class="fas fa-times"></i>
                            </button>` :
                            `${!ladder.executed ? 
                                `<button class="btn-icon primary edit-level-btn" data-level-index="${index}" title="Edit level">
                                    <i class="fas fa-pen"></i>
                                </button>` : ''
                            }
                            <button class="btn-icon danger delete-level-btn" data-level-index="${index}" title="Remove level">
                                <i class="fas fa-trash"></i>
                            </button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
        
        // Re-attach event listeners
        attachExitLevelEventListeners();
        
        // Show summary with remaining coins
        renderExitLevelsSummary();
    }
}

function attachExitLevelEventListeners() {
    const tbody = document.querySelector('.exit-levels-table tbody');
    if (!tbody) return;
    
    // Edit buttons
    tbody.querySelectorAll('.edit-level-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const levelIndex = parseInt(this.dataset.levelIndex);
            toggleEditLevel(levelIndex, true);
        });
    });
    
    // Save buttons
    tbody.querySelectorAll('.save-level-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const levelIndex = parseInt(this.dataset.levelIndex);
            saveLevelEdits(levelIndex);
        });
    });
    
    // Cancel buttons
    tbody.querySelectorAll('.cancel-level-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const levelIndex = parseInt(this.dataset.levelIndex);
            cancelLevelEdits(levelIndex);
        });
    });
    
    // Delete buttons
    tbody.querySelectorAll('.delete-level-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const levelIndex = parseInt(this.dataset.levelIndex);
            removeExitLadder(levelIndex);
        });
    });
}

function renderExitLevelsSummary() {
    const exitLaddersContainer = document.getElementById('exitLadders');
    let summary = exitLaddersContainer.querySelector('.exit-levels-summary');
    
    if (!summary) {
        // Create summary element if it doesn't exist
        summary = document.createElement('div');
        summary.className = 'exit-levels-summary';
        exitLaddersContainer.appendChild(summary);
    }
    
    // Calculate remaining coins available for future levels
    const totalHoldings = parseFloat(currentAsset.amount) || 0;
    let allocatedAmount = 0;
    
    // Calculate total allocated to planned (non-executed) levels
    if (currentAsset.exitStrategy) {
        currentAsset.exitStrategy.forEach((level, index) => {
            if (!level.executed) {
                const amount = calculateLadderAmount(index);
                allocatedAmount += parseFloat(amount) || 0;
            }
        });
    }
    
    const remainingAmount = Math.max(0, totalHoldings - allocatedAmount);
    const allocationPercentage = totalHoldings > 0 ? (allocatedAmount / totalHoldings) * 100 : 0;
    
    summary.innerHTML = `
        <div class="summary-card">
            <div class="summary-title">
                <i class="fas fa-chart-pie"></i>
                <span>Exit Strategy Overview</span>
                </div>
            <div class="summary-grid">
                <div class="summary-item">
                    <span class="summary-label">Total Holdings</span>
                    <span class="summary-value">${formatAssetAmount(totalHoldings)} ${currentAsset.symbol}</span>
                    </div>
                <div class="summary-item">
                    <span class="summary-label">Allocated to Levels</span>
                    <span class="summary-value">${formatAssetAmount(allocatedAmount)} ${currentAsset.symbol}</span>
                    </div>
                <div class="summary-item">
                    <span class="summary-label">Available for New Levels</span>
                    <span class="summary-value ${remainingAmount === 0 ? 'warning' : 'positive'}">${formatAssetAmount(remainingAmount)} ${currentAsset.symbol}</span>
                    </div>
                <div class="summary-item">
                    <span class="summary-label">Allocation %</span>
                    <span class="summary-value">${formatPercentage(allocationPercentage)}</span>
                </div>
            </div>
        </div>
    `;
    
    summary.style.display = 'block';
}

// ===== EXIT LEVEL EDITING FUNCTIONS =====

function toggleEditLevel(index, enableEdit) {
    const row = document.querySelector(`tr.exit-level-row[data-ladder-index="${index}"]`);
    if (!row) return;
    
    const level = currentAsset.exitStrategy[index];
    if (!level || level.executed) return; // Can't edit executed levels
    
    const priceCell = row.querySelector('.price-cell');
    const percentageCell = row.querySelector('.percentage-cell');
    const actionsCell = row.querySelector('.actions-cell');
    
    if (enableEdit) {
        // Store original content for cancel functionality
        priceCell.dataset.originalContent = priceCell.innerHTML;
        percentageCell.dataset.originalContent = percentageCell.innerHTML;
        actionsCell.dataset.originalContent = actionsCell.innerHTML;
        
        // Replace with input fields
        priceCell.innerHTML = `
            <input 
               type="text" 
               class="table-input price-input edit-input" 
               placeholder="e.g., 50000" 
               value="${formatNumberInput(level.price)}" 
               inputmode="decimal"
               onblur="updateLadderField(${index}, 'price', this.value)">
        `;
        
        percentageCell.innerHTML = `
            <input type="text" 
               class="table-input percentage-input edit-input" 
               placeholder="20" 
               value="${formatNumberInput(level.percentage)}" 
               inputmode="decimal"
               max="100"
               min="0"
               onblur="updateLadderField(${index}, 'percentage', this.value)"
               oninput="validatePercentageInput(this)">
            <span class="input-suffix">%</span>
        `;
        
        actionsCell.innerHTML = `
            <button class="btn-icon success save-level-btn" data-level-index="${index}" title="Save level">
                <i class="fas fa-check"></i>
            </button>
            <button class="btn-icon secondary cancel-level-btn" data-level-index="${index}" title="Cancel">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Re-attach event listeners for the new buttons
        const saveBtn = actionsCell.querySelector('.save-level-btn');
        const cancelBtn = actionsCell.querySelector('.cancel-level-btn');
        
        saveBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            saveLevelEdits(index);
        });
        
        cancelBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            cancelLevelEdits(index);
        });
        
        row.classList.add('editing');
    } else {
        // Restore original display
        if (priceCell.dataset.originalContent) {
            priceCell.innerHTML = priceCell.dataset.originalContent;
        }
        if (percentageCell.dataset.originalContent) {
            percentageCell.innerHTML = percentageCell.dataset.originalContent;
        }
        if (actionsCell.dataset.originalContent) {
            actionsCell.innerHTML = actionsCell.dataset.originalContent;
        }
        
        // Re-attach event listeners for edit/delete buttons
        attachExitLevelEventListeners();
        
        row.classList.remove('editing');
    }
}

function saveLevelEdits(index) {
    // The updateLadderField functions already handle saving
    // Just switch back to view mode
    toggleEditLevel(index, false);
}

function cancelLevelEdits(index) {
    // Just switch back to view mode without saving
    toggleEditLevel(index, false);
}

function startEditingLadder(index) {
    console.log('🔧 startEditingLadder called:', index);
    if (!currentAsset.exitStrategy || index < 0 || index >= currentAsset.exitStrategy.length) {
        return;
    }
    
    // Mark this ladder as being edited to prevent premature re-rendering
    currentAsset.exitStrategy[index]._isEditing = true;
}

function finishEditingLadder(index, field, value) {
    console.log('🔧 finishEditingLadder called:', { index, field, value });
    
    // Update the field first
    updateLadderFieldOnly(index, field, value);
    
    // Clear the editing flag
    if (currentAsset.exitStrategy && currentAsset.exitStrategy[index]) {
        currentAsset.exitStrategy[index]._isEditing = false;
    }
    
    // Create or update price alert for this exit level
    if (field === 'percentage' && currentAsset.exitStrategy[index]) {
        const ladder = currentAsset.exitStrategy[index];
        if (ladder.price > 0 && ladder.percentage > 0) {
            createPriceAlert(ladder, index);
        }
    }
    
    // Now save and re-render
    savePortfolio();
    renderExitLadders();
    updateProjections();
    updateProgress();
}

function updateLadderField(index, field, value) {
    console.log('🔧 updateLadderField called:', { index, field, value });
    
    // For price field, don't finish editing yet - keep in edit mode
    updateLadderFieldOnly(index, field, value);
    
    if (field === 'price') {
        // Keep editing mode active for price field
        console.log('🔧 Price field updated, staying in edit mode');
        savePortfolio(); // Save the data but don't re-render
    } else {
        // For other fields, finish editing
        finishEditingLadder(index, field, value);
    }
}

function updateLadderFieldOnly(index, field, value) {
    if (!currentAsset.exitStrategy || index < 0 || index >= currentAsset.exitStrategy.length) {
        console.log('❌ Invalid ladder update:', { hasStrategy: !!currentAsset.exitStrategy, index, length: currentAsset.exitStrategy?.length });
        return;
    }
    
    const oldValue = currentAsset.exitStrategy[index][field];
    
    if (field === 'price' || field === 'percentage') {
        // Use parseFloat with fallback parsing
        let numValue;
        if (typeof parseNumber === 'function') {
            numValue = parseNumber(value);
        } else {
            // Fallback parsing - handle comma decimal separator
            const cleanValue = String(value).replace(',', '.');
            numValue = parseFloat(cleanValue);
        }
        
        if (isNaN(numValue) || numValue < 0) {
            console.log('❌ Invalid numeric value:', { value, numValue });
            return;
        }
        
        // Clamp percentage to 0-100
        if (field === 'percentage') {
            numValue = Math.max(0, Math.min(100, numValue));
        }
        
        currentAsset.exitStrategy[index][field] = numValue;
        console.log(`📝 Updated ladder ${index}.${field}: ${oldValue} → ${numValue}`);
        
        // Sort exit levels by price when price is updated (but not when percentage is updated to avoid disruption)
        if (field === 'price' && numValue > 0) {
            const reordered = sortExitLevelsByPrice();
            if (reordered) {
                console.log('🔄 Exit levels reordered after price update');
                // Re-render to show the new order
                setTimeout(() => {
                    renderExitLadders();
                    updateProjections();
                    updateProgress();
                }, 100); // Small delay to ensure smooth UX
            }
        }
    } else {
        currentAsset.exitStrategy[index][field] = value;
        console.log(`📝 Updated ladder ${index}.${field}: ${oldValue} → ${value}`);
    }
}

function calculateLadderAmount(ladderIndex) {
    if (!currentAsset || !currentAsset.exitStrategy || !currentAsset.exitStrategy[ladderIndex]) return 0;
    const ladder = currentAsset.exitStrategy[ladderIndex];
    // If executed, return the recorded executed amount as a number
    if (ladder.executed && typeof ladder.executedAmount === 'number') {
        return Number(ladder.executedAmount) || 0;
    }
    // Planned amount based on current holdings and only non-executed prior ladders
    const percentage = (parseFloat(ladder.percentage) || 0) / 100;
    let remainingAmount = parseFloat(currentAsset.amount) || 0;
    for (let i = 0; i < ladderIndex; i++) {
        const prev = currentAsset.exitStrategy[i];
        if (!prev.executed) {
            const prevPct = (parseFloat(prev.percentage) || 0) / 100;
            remainingAmount -= remainingAmount * prevPct;
        }
    }
    const plannedAmount = remainingAmount * percentage;
    return isFinite(plannedAmount) ? plannedAmount : 0;
}

function calculateLadderValue(ladderIndex) {
    if (!currentAsset || !currentAsset.exitStrategy || !currentAsset.exitStrategy[ladderIndex]) return 0;
    
    const ladder = currentAsset.exitStrategy[ladderIndex];
    const amount = calculateLadderAmount(ladderIndex);
    const price = parseFloat(ladder.price);
    
    return amount * price;
}

function updateProjections() {
    if (!currentAsset) return;
    
    // Percentages are applied sequentially to remaining coins
    let remainingFraction = 1;
    if (currentAsset.exitStrategy) {
        currentAsset.exitStrategy.forEach(ladder => {
            const p = (parseFloat(ladder.percentage) || 0) / 100;
            remainingFraction *= (1 - p);
        });
    }
    const totalExitFraction = 1 - remainingFraction;
    const totalPercentage = totalExitFraction * 100;
    const remainingPercentage = remainingFraction * 100;
    
    // Calculate weighted average exit price
    let totalWeightedValue = 0; // sum of price * amount
    let totalAmountSold = 0;    // sum of amounts used for average
    let totalExitValue = 0;
    let totalRealized = 0; // Net realized (profit/loss after cost basis, tax, and tithe)
    
    if (currentAsset.exitStrategy) {
        currentAsset.exitStrategy.forEach((ladder, index) => {
            const price = parseNumber(ladder.price) || 0;
            const amount = ladder.executed ? (parseFloat(ladder.executedAmount) || 0) : calculateLadderAmount(index) || 0;
            totalWeightedValue += price * amount;
            totalAmountSold += amount;
            totalExitValue += amount * price;
            
            if (ladder.executed) {
                // Calculate net realized properly: sales value - cost basis - tax - tithe
                const salesValue = amount * price;
                const avgPrice = currentAsset.avgPrice || 0;
                const costBasis = amount * avgPrice;
                const gain = salesValue - costBasis;
                const taxAmount = Math.max(0, gain * 0.22); // 22% tax on gains only
                const titheAmount = salesValue * 0.10; // 10% tithe on total sales
                const netRealized = salesValue - costBasis - taxAmount - titheAmount;
                totalRealized += netRealized;
            }
        });
    }
    
    // Also include manual sales in net realized calculation
    const sales = currentAsset.sales || [];
    sales.forEach(sale => {
        const amount = Number(sale.amount);
        const price = Number(sale.price);
        const salesValue = amount * price;
        const avgPrice = currentAsset.avgPrice || 0;
        const costBasis = amount * avgPrice;
        const gain = salesValue - costBasis;
        const taxAmount = Math.max(0, gain * 0.22); // 22% tax on gains only
        const titheAmount = salesValue * 0.10; // 10% tithe on total sales
        const netRealized = salesValue - costBasis - taxAmount - titheAmount;
        totalRealized += netRealized;
    });
    
    const avgExitPrice = totalAmountSold > 0 ? (totalWeightedValue / totalAmountSold) : 0;
    const totalToExitAmount = formatAssetAmount(currentAsset.amount * totalExitFraction);
    const remainingAmount = formatAssetAmount(currentAsset.amount * remainingFraction);
    
    document.getElementById('totalToExit').textContent = formatPercentage(Math.min(totalPercentage, 100));
    document.getElementById('remainingAmount').textContent = formatPercentage(Math.max(0, remainingPercentage));
    document.getElementById('avgExitPrice').textContent = formatPrice(avgExitPrice);
    document.getElementById('totalExitValue').textContent = formatCurrency(totalExitValue);
    
    // Update Net Realized in the Sales & Performance section
    const netRealizedEl = document.getElementById('totalRealized');
    if (netRealizedEl) netRealizedEl.textContent = formatCurrency(totalRealized);
    
    // Update main dashboard total realized if present
    const realizedEl = document.getElementById('totalRealizedMain');
    if (realizedEl) realizedEl.textContent = formatCurrency(totalRealized);
    
    // Calculate projected values for the full exit strategy
    const avgPrice = currentAsset.avgPrice || 0;
    const totalCostBasis = totalAmountSold * avgPrice;
    const projectedGains = Math.max(0, totalExitValue - totalCostBasis);
    const projectedTaxDue = projectedGains * 0.22; // 22% tax on gains only
    const projectedTithe = totalExitValue * 0.10;   // 10% tithe on total sales value
    const projectedNetAmount = totalExitValue - totalCostBasis - projectedTaxDue - projectedTithe;
    
    // Update projected values in the overview
    const projectedNetEl = document.getElementById('projectedNetAmountOverview');
    const projectedTaxEl = document.getElementById('projectedTaxDueOverview');
    const projectedTitheEl = document.getElementById('projectedTitheOverview');
    
    if (projectedNetEl) projectedNetEl.textContent = formatCurrency(projectedNetAmount);
    if (projectedTaxEl) projectedTaxEl.textContent = formatCurrency(projectedTaxDue);
    if (projectedTitheEl) projectedTitheEl.textContent = formatCurrency(projectedTithe);
}

function updateProgress() {
    if (!currentAsset) return;
    
    const totalPercentage = currentAsset.exitStrategy ? 
        currentAsset.exitStrategy.reduce((sum, ladder) => sum + parseFloat(ladder.percentage), 0) : 0;
    const progressPercent = Math.min(totalPercentage, 100);
    
    // Update progress percentage in overview (progressFill and exitLevelsCount no longer exist)
    const progressElement = document.getElementById('progressPercent');
    if (progressElement) progressElement.textContent = formatPercentage(progressPercent);
    
    // Find next target
    const currentPrice = currentPrices[currentAsset.id] || 0;
    let nextTarget = 'None';
    let distanceToNext = '-';
    
    if (currentAsset.exitStrategy && currentAsset.exitStrategy.length > 0) {
        const sortedLadders = [...currentAsset.exitStrategy].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        const nextLadder = sortedLadders.find(ladder => parseFloat(ladder.price) > currentPrice);
        
        if (nextLadder) {
            nextTarget = formatPrice(parseFloat(nextLadder.price));
            const distance = (parseFloat(nextLadder.price) - currentPrice) / currentPrice * 100;
            distanceToNext = formatPercentage(distance);
        }
    }
    
    const nextTargetElement = document.getElementById('nextTarget');
    const distanceElement = document.getElementById('distanceToNext');
    if (nextTargetElement) nextTargetElement.textContent = nextTarget;
    if (distanceElement) distanceElement.textContent = distanceToNext;
}

function updateSalesSummary() {
    const sales = getSales();
    
    if (!sales.length) {
        // Clear overview values when no sales
        document.getElementById('totalSalesValueOverview').textContent = formatCurrency(0);
        document.getElementById('totalTaxDueOverview').textContent = formatCurrency(0);
        document.getElementById('totalTitheOverview').textContent = formatCurrency(0);
        document.getElementById('totalNetAmountOverview').textContent = formatCurrency(0);
        return;
    }
    
    let totalSalesValue = 0;
    let totalTaxDue = 0;
    let totalTithe = 0;
    let totalNetAmount = 0; // This should be net profit/loss after cost basis, tax, and tithe
    
    sales.forEach(sale => {
        const amount = Number(sale.amount);
        const price = Number(sale.price);
        const value = amount * price;
        
        // Calculate tax and tithing
        const avgPrice = currentAsset.avgPrice || 0;
        const costBasis = amount * avgPrice;
        const gain = value - costBasis;
        const taxAmount = Math.max(0, gain * 0.22); // 22% tax on gains only
        const titheAmount = value * 0.10; // 10% tithing on total sale amount
        
        // Net amount should be: sales value - cost basis - tax - tithe
        const netAmount = value - costBasis - taxAmount - titheAmount;
        
        totalSalesValue += value;
        totalTaxDue += taxAmount;
        totalTithe += titheAmount;
        totalNetAmount += netAmount;
    });
    
    // Update strategy overview section
    document.getElementById('totalSalesValueOverview').textContent = formatCurrency(totalSalesValue);
    document.getElementById('totalTaxDueOverview').textContent = formatCurrency(totalTaxDue);
    document.getElementById('totalTitheOverview').textContent = formatCurrency(totalTithe);
    document.getElementById('totalNetAmountOverview').textContent = formatCurrency(totalNetAmount);
}

// Helper function to sort exit levels by price (lowest to highest)
function sortExitLevelsByPrice() {
    if (!currentAsset || !currentAsset.exitStrategy || currentAsset.exitStrategy.length <= 1) {
        return;
    }
    
    // Create a copy of the array to sort
    const sortedLevels = [...currentAsset.exitStrategy];
    
    // Sort by price (lowest to highest), with 0 prices at the end
    sortedLevels.sort((a, b) => {
        const priceA = parseFloat(a.price) || 0;
        const priceB = parseFloat(b.price) || 0;
        
        // If both prices are 0, maintain original order
        if (priceA === 0 && priceB === 0) return 0;
        
        // If one price is 0, put it at the end
        if (priceA === 0) return 1;
        if (priceB === 0) return -1;
        
        // Sort by price (ascending)
        return priceA - priceB;
    });
    
    // Check if order actually changed
    const orderChanged = sortedLevels.some((level, index) => 
        level !== currentAsset.exitStrategy[index]
    );
    
    if (orderChanged) {
        console.log('🔄 Reordering exit levels by price...');
        currentAsset.exitStrategy = sortedLevels;
        
        // Show a brief notification that levels were reordered
        showPriceAlertNotification('📋 Exit levels reordered by price (lowest to highest)');
        
        return true; // Indicate that reordering occurred
    }
    
    return false; // No reordering needed
}

function addExitLadder() {
    console.log('🔧 addExitLadder called');
    if (!currentAsset) return;
    
    if (!currentAsset.exitStrategy) {
        currentAsset.exitStrategy = [];
    }
    
    currentAsset.exitStrategy.push({
        price: 0,
        percentage: 0,
        _isEditing: true // Mark as being edited so both fields remain editable
    });
    
    console.log('🔧 Exit level added, total levels:', currentAsset.exitStrategy.length);
    savePortfolio();
    renderExitLadders();
    updateProjections();
    updateProgress();
}

function removeExitLadder(index) {
    if (!currentAsset || !currentAsset.exitStrategy) return;
    
    // Get the target price before removing the ladder
    const targetPrice = currentAsset.exitStrategy[index]?.price;
    
    currentAsset.exitStrategy.splice(index, 1);
    
    // Remove associated price alert if it exists
    if (targetPrice > 0) {
        removePriceAlert(targetPrice);
    }
    
    savePortfolio();
    renderExitLadders();
    updateProjections();
    updateProgress();
}

function validatePercentageInput(input) {
    const value = parseFloat(input.value);
    if (value > 100) {
        input.classList.add('invalid');
        input.title = 'Maximum percentage is 100%';
    } else if (value < 0) {
        input.classList.add('invalid');
        input.title = 'Minimum percentage is 0%';
    } else {
        input.classList.remove('invalid');
        input.title = '';
    }
}

// Duplicate updateLadderField function removed - using the enhanced version above
function getSales() {
    return currentAsset.sales || [];
}

function saveSales(sales) {
    currentAsset.sales = sales;
    savePortfolio();
}

function addSaleRecord() {
    if (!currentAsset) return;
    
    // Initialize sales array if it doesn't exist
    if (!currentAsset.sales) {
        currentAsset.sales = [];
    }
    
    // Create a date with current date but default time (e.g., noon)
    const now = new Date();
    now.setHours(12, 0, 0, 0); // Set to noon for cleaner default
    
    // Add new empty sale record
    currentAsset.sales.push({
        amount: 0,
        price: 0,
        date: now.toISOString()
    });
    
    savePortfolio();
    renderSales();
    updateAssetDisplay();
    updateProjections();
    updateProgress();
}

function deleteSaleRecord(index) {
    const sales = getSales();
    const rec = sales[index];
    if (!rec) return;
    
    // If sale had a wallet and amount, add the amount back to the wallet
    if (rec.walletId && rec.amount > 0) {
        updateWalletAmount(rec.walletId, rec.amount);
    }
    
    sales.splice(index, 1);
    saveSales(sales);
    
    // Recalculate holdings after deleting sale
    recalculateAssetHoldings();
    
    updateAssetDisplay();
    renderSales();
    renderWallets(); // Update wallet display
    updateProjections();
    updateProgress();
    updateSalesSummary();
}

function editSaleRecord(index) {
    const sales = getSales();
    if (index < 0 || index >= sales.length) return;
    
    const sale = sales[index];
    
    // Show the form
    showSaleForm();
    
    // Populate form with existing values
    document.getElementById('saleAmount').value = sale.amount;
    document.getElementById('salePrice').value = sale.price;
    document.getElementById('saleDate').value = formatDateTimeForInput(sale.date);
    
    // Store the index being edited
    currentEditSaleIndex = index;
    
    // Update save button text to indicate editing
    const saveBtn = document.getElementById('saveSaleBtn');
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Sale';
}

function updateSaleRecord() {
    if (currentEditSaleIndex === undefined || currentEditSaleIndex === null) return;
    
    const amount = parseFloat(document.getElementById('saleAmount').value);
    const price = parseFloat(document.getElementById('salePrice').value);
    const date = document.getElementById('saleDate').value || new Date().toISOString();
    
    if (!amount || amount <= 0 || !price || price <= 0) return;
    
    const sales = getSales();
    const oldSale = sales[currentEditSaleIndex];
    
    // Restore the old sale amount to holdings first
    currentAsset.amount = (parseFloat(currentAsset.amount) || 0) + (parseFloat(oldSale.amount) || 0);
    
    // Update the sale record
    sales[currentEditSaleIndex] = { amount, price, date };
    
    // Apply the new sale amount
    currentAsset.amount = Math.max(0, (parseFloat(currentAsset.amount) || 0) - amount);
    
    saveSales(sales);
    
    // Reset form and button
    document.getElementById('saleAmount').value = '';
    document.getElementById('salePrice').value = '';
    document.getElementById('saleDate').value = '';
    currentEditSaleIndex = null;
    
    const addBtn = document.getElementById('addSaleBtn');
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Sale';
    
    updateAssetDisplay();
    renderSales();
    updateProjections();
    updateProgress();
    updateSalesSummary();
}

function renderSales() {
    const list = document.getElementById('salesList');
    const sales = getSales();
    if (!list) return;
    
    const table = list.querySelector('.sales-table');
    const emptyState = list.querySelector('.empty-state-modern');
    
    if (!sales.length) {
        if (table) table.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (table) table.style.display = 'table';
    if (emptyState) emptyState.style.display = 'none';
    
    const tbody = table.querySelector('tbody');
    if (tbody) {
        tbody.innerHTML = sales.map((s, idx) => {
            const amount = Number(s.amount);
            const price = Number(s.price);
            const value = amount * price;
            const date = new Date(s.date);
            
            // Calculate tax and tithing
            const avgPrice = currentAsset.avgPrice || 0;
            const costBasis = amount * avgPrice;
            const gain = value - costBasis;
            const taxAmount = Math.max(0, gain * 0.22); // 22% tax on gains only
            const titheAmount = value * 0.10; // 10% tithing on total sale amount
            
            // Net amount should be: sales value - cost basis - tax - tithe  
            const netAmount = value - costBasis - taxAmount - titheAmount;
            
            // Determine if this is a new empty record
            const isNewRecord = amount === 0 && price === 0;
            
            return `
                <tr class="sale-row ${isNewRecord ? 'editing' : ''}" data-sale-index="${idx}">
                    <td class="sale-date-cell" data-label="Date">
                        ${isNewRecord ? 
                            `<input type="datetime-local" 
                                   class="table-input date-input" 
                                   value="${formatDateTimeForInput(s.date)}" 
                                   onchange="updateSaleField(${idx}, 'date', this.value)">` :
                            `<span class="display-value">${formatDateTime(s.date)}</span>`
                        }
                    </td>
                    <td class="sale-wallet-cell" data-label="Wallet">
                        ${isNewRecord ? 
                            `<select class="table-input wallet-select" 
                                    onchange="updateSaleField(${idx}, 'walletId', this.value)">
                                ${getWalletOptions(s.walletId)}
                            </select>` :
                            `<span class="display-value">${getWalletDisplayName(s.walletId) || 'No wallet'}</span>`
                        }
                    </td>
                    <td class="sale-amount-cell" data-label="Amount Sold">
                        ${isNewRecord ? 
                            `<input type="text" 
                                   class="table-input amount-input" 
                                   placeholder="0" 
                                   value="${formatNumberInput(amount)}" 
                                   inputmode="decimal"
                                   onchange="updateSaleField(${idx}, 'amount', this.value)">
                            <span class="input-suffix">${currentAsset.symbol}</span>` :
                            `<span class="display-value">${formatAssetAmount(amount)} ${currentAsset.symbol}</span>`
                        }
                    </td>
                    <td class="sale-price-cell" data-label="Price">
                        ${isNewRecord ? 
                            `<input type="text" 
                                   class="table-input price-input" 
                                   placeholder="0" 
                                   value="${formatNumberInput(price)}" 
                                   inputmode="decimal"
                                   onchange="updateSaleField(${idx}, 'price', this.value)">` :
                            `<span class="display-value">${formatCurrency(price)}</span>`
                        }
                    </td>
                    <td class="sale-value-cell" data-label="Value">
                        <span class="calculated-value">${formatCurrency(value)}</span>
                    </td>
                    <td class="sale-tax-cell" data-label="Tax (22%)">
                        <span class="calculated-value">${formatCurrency(taxAmount)}</span>
                    </td>
                    <td class="sale-tithe-cell" data-label="Tithe (10%)">
                        <span class="calculated-value">${formatCurrency(titheAmount)}</span>
                    </td>
                    <td class="sale-net-cell" data-label="Net After Tax & Tithe">
                        <span class="calculated-value">${formatCurrency(netAmount)}</span>
                    </td>
                    <td class="sale-actions-cell" data-label="Actions">
                        ${isNewRecord ? 
                            `<button class="btn-icon success save-sale-btn" data-sale-index="${idx}" title="Save sale">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn-icon secondary cancel-sale-btn" data-sale-index="${idx}" title="Cancel">
                                <i class="fas fa-times"></i>
                            </button>` :
                            `<button class="btn-icon primary edit-sale-btn" data-sale-index="${idx}" title="Edit sale">
                                <i class="fas fa-pen"></i>
                            </button>
                        <button class="btn-icon danger delete-sale-btn" data-sale-index="${idx}" title="Delete sale">
                            <i class="fas fa-trash"></i>
                            </button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
        
        // Add event listeners for all buttons
        tbody.querySelectorAll('.edit-sale-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const saleIndex = parseInt(this.dataset.saleIndex);
                toggleEditSale(saleIndex, true);
            });
        });
        
        tbody.querySelectorAll('.save-sale-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const saleIndex = parseInt(this.dataset.saleIndex);
                saveSaleEdits(saleIndex);
            });
        });
        
        tbody.querySelectorAll('.cancel-sale-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const saleIndex = parseInt(this.dataset.saleIndex);
                cancelSaleEdits(saleIndex);
            });
        });
        
        tbody.querySelectorAll('.delete-sale-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const saleIndex = parseInt(this.dataset.saleIndex);
                deleteSaleRecord(saleIndex);
            });
        });
    }
    
    // Update sales summary
    updateSalesSummary();
}

function updateSaleField(index, field, value) {
    console.log('🔧 updateSaleField called:', { index, field, value });
    
    if (!currentAsset.sales || index < 0 || index >= currentAsset.sales.length) {
        console.log('❌ Invalid sale update:', { hasSales: !!currentAsset.sales, index, length: currentAsset.sales?.length });
        return;
    }
    
    const oldValue = currentAsset.sales[index][field];
    const sale = currentAsset.sales[index];
    
    if (field === 'amount' || field === 'price') {
        // Use parseFloat with fallback parsing
        let numValue;
        if (typeof parseNumber === 'function') {
            numValue = parseNumber(value);
        } else {
            // Fallback parsing - handle comma decimal separator
            const cleanValue = String(value).replace(',', '.');
            numValue = parseFloat(cleanValue);
        }
        
        if (isNaN(numValue) || numValue < 0) {
            console.log('❌ Invalid numeric value:', { value, numValue });
            return;
        }
        
        // If amount changed and sale has a wallet, update wallet amount
        if (field === 'amount' && sale.walletId && oldValue !== numValue) {
            const amountDiff = (parseFloat(oldValue) || 0) - numValue; // Positive means more sold, negative means less sold
            updateWalletAmount(sale.walletId, amountDiff);
        }
        
        currentAsset.sales[index][field] = numValue;
        console.log(`📝 Updated sale ${index}.${field}: ${oldValue} → ${numValue}`);
    } else if (field === 'date') {
        currentAsset.sales[index][field] = value;
        console.log(`📝 Updated sale ${index}.${field}: ${oldValue} → ${value}`);
    } else if (field === 'walletId') {
        // If wallet changed, update both old and new wallet amounts
        if (oldValue !== value && sale.amount > 0) {
            // Remove amount from old wallet
            if (oldValue) {
                updateWalletAmount(oldValue, sale.amount);
            }
            // Subtract amount from new wallet
            if (value) {
                updateWalletAmount(value, -sale.amount);
            }
        }
        currentAsset.sales[index][field] = value;
        console.log(`📝 Updated sale ${index}.${field}: ${oldValue} → ${value}`);
    }
    
    // Recalculate asset holdings after changing sales
    recalculateAssetHoldings();
    
    savePortfolio();
    renderSales();
    renderWallets(); // Update wallet display
    updateAssetDisplay();
    updateProjections();
    updateProgress();
}

function toggleEditSale(index, show) {
    const row = document.querySelector(`tr.sale-row[data-sale-index="${index}"]`);
    if (!row) return;
    
    const sale = currentAsset.sales[index];
    if (!sale) return;
    
    if (show) {
        // Switch to edit mode
        const dateCell = row.querySelector('.sale-date-cell');
        const amountCell = row.querySelector('.sale-amount-cell');
        const priceCell = row.querySelector('.sale-price-cell');
        const actionsCell = row.querySelector('.sale-actions-cell');
        
        if (dateCell && amountCell && priceCell && actionsCell) {
            // Store original content
            dateCell.dataset.originalContent = dateCell.innerHTML;
            amountCell.dataset.originalContent = amountCell.innerHTML;
            priceCell.dataset.originalContent = priceCell.innerHTML;
            actionsCell.dataset.originalContent = actionsCell.innerHTML;
            
            const date = new Date(sale.date);
            
            // Replace with inputs
            dateCell.innerHTML = `
                <input type="datetime-local" 
                       class="table-input date-input edit-input" 
                       value="${formatDateTimeForInput(sale.date)}" 
                       onchange="updateSaleField(${index}, 'date', this.value)">
            `;
            
            amountCell.innerHTML = `
                <input type="text" 
                       class="table-input amount-input edit-input" 
                       placeholder="0" 
                       value="${formatNumberInput(sale.amount)}" 
                       inputmode="decimal"
                       onchange="updateSaleField(${index}, 'amount', this.value)">
                <span class="input-suffix">${currentAsset.symbol}</span>
            `;
            
            priceCell.innerHTML = `
                <input type="text" 
                       class="table-input price-input edit-input" 
                       placeholder="0" 
                       value="${formatNumberInput(sale.price)}" 
                       inputmode="decimal"
                       onchange="updateSaleField(${index}, 'price', this.value)">
            `;
            
            actionsCell.innerHTML = `
                <button class="btn-icon success save-sale-btn" data-sale-index="${index}" title="Save sale">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-icon secondary cancel-sale-btn" data-sale-index="${index}" title="Cancel">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // Re-attach event listeners
            const saveBtn = actionsCell.querySelector('.save-sale-btn');
            const cancelBtn = actionsCell.querySelector('.cancel-sale-btn');
            
            if (saveBtn) {
                saveBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    saveSaleEdits(index);
                });
            }
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleEditSale(index, false);
                });
            }
            
            // Focus on first input
            const firstInput = dateCell.querySelector('input');
            if (firstInput) firstInput.focus();
        }
        
        row.classList.add('editing');
    } else {
        // Switch back to view mode
        const dateCell = row.querySelector('.sale-date-cell');
        const amountCell = row.querySelector('.sale-amount-cell');
        const priceCell = row.querySelector('.sale-price-cell');
        const actionsCell = row.querySelector('.sale-actions-cell');
        
        if (dateCell && amountCell && priceCell && actionsCell) {
            // Restore original content
            if (dateCell.dataset.originalContent) {
                dateCell.innerHTML = dateCell.dataset.originalContent;
                delete dateCell.dataset.originalContent;
            }
            if (amountCell.dataset.originalContent) {
                amountCell.innerHTML = amountCell.dataset.originalContent;
                delete amountCell.dataset.originalContent;
            }
            if (priceCell.dataset.originalContent) {
                priceCell.innerHTML = priceCell.dataset.originalContent;
                delete priceCell.dataset.originalContent;
            }
            if (actionsCell.dataset.originalContent) {
                actionsCell.innerHTML = actionsCell.dataset.originalContent;
                delete actionsCell.dataset.originalContent;
            }
        }
        
        row.classList.remove('editing');
        renderSales(); // Re-render to ensure proper event listeners
    }
}

function saveSaleEdits(index) {
    // The updateSaleField functions already handle saving
    // Just switch back to view mode
    toggleEditSale(index, false);
}

function cancelSaleEdits(index) {
    // Just switch back to view mode without saving
    toggleEditSale(index, false);
}

// ===== PURCHASES FUNCTIONS =====

function getPurchases() {
    return currentAsset.purchases || [];
}

function savePurchases(purchases) {
    currentAsset.purchases = purchases;
    updateAvgPrice();
    savePortfolio();
}

function addPurchaseRecord() {
    if (!currentAsset) return;
    
    // Initialize purchases array if it doesn't exist
    if (!currentAsset.purchases) {
        currentAsset.purchases = [];
    }
    
    // Create a date with current date but default time (e.g., noon)
    const now = new Date();
    now.setHours(12, 0, 0, 0); // Set to noon for cleaner default
    
    // Add new empty purchase record
    currentAsset.purchases.push({
        amount: 0,
        price: 0,
        type: 'purchase',
        date: now.toISOString()
    });
    
    savePortfolio();
    renderPurchases();
    updateAssetDisplay();
    updateProjections();
    updateProgress();
}

function deletePurchaseRecord(index) {
    const purchases = getPurchases();
    if (index >= 0 && index < purchases.length) {
        const rec = purchases[index];
        
        // If purchase had a wallet and amount, remove the amount from the wallet
        if (rec.walletId && rec.amount > 0) {
            updateWalletAmount(rec.walletId, -rec.amount);
        }
        
        purchases.splice(index, 1);
        savePurchases(purchases);
        
        // Recalculate holdings after deleting purchase
        recalculateAssetHoldings();
        
        updateAssetDisplay();
        renderPurchases();
        renderWallets(); // Update wallet display
        updateProjections();
        updateProgress();
        updatePurchasesSummary();
    }
}

function editPurchaseRecord(index) {
    const purchases = getPurchases();
    if (index < 0 || index >= purchases.length) return;
    
    const purchase = purchases[index];
    
    // Show the form
    showPurchaseForm();
    
    // Populate form with existing values
    document.getElementById('purchaseAmount').value = purchase.amount;
    document.getElementById('purchasePrice').value = purchase.price;
    document.getElementById('purchaseType').value = purchase.type;
    document.getElementById('purchaseDate').value = formatDateTimeForInput(purchase.date);
    
    // Store the index being edited
    currentEditPurchaseIndex = index;
    
    // Update save button text to indicate editing
    const saveBtn = document.getElementById('savePurchaseBtn');
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Purchase';
}

function updatePurchaseRecord() {
    if (currentEditPurchaseIndex === undefined || currentEditPurchaseIndex === null) return;
    
    const amount = parseFloat(document.getElementById('purchaseAmount').value);
    const price = parseFloat(document.getElementById('purchasePrice').value);
    const type = document.getElementById('purchaseType').value;
    const date = document.getElementById('purchaseDate').value || new Date().toISOString();
    
    if (!amount || amount <= 0 || price < 0) return;
    
    const purchases = getPurchases();
    const oldPurchase = purchases[currentEditPurchaseIndex];
    
    // Restore the old purchase amount from holdings first
    currentAsset.amount = Math.max(0, (parseFloat(currentAsset.amount) || 0) - (parseFloat(oldPurchase.amount) || 0));
    
    // Update the purchase record
    purchases[currentEditPurchaseIndex] = { amount, price, type, date };
    
    // Apply the new purchase amount
    currentAsset.amount = (parseFloat(currentAsset.amount) || 0) + amount;
    
    savePurchases(purchases);
    
    // Reset form and button
    document.getElementById('purchaseAmount').value = '';
    document.getElementById('purchasePrice').value = '';
    document.getElementById('purchaseType').value = 'purchase';
    document.getElementById('purchaseDate').value = '';
    currentEditPurchaseIndex = null;
    
    const addBtn = document.getElementById('addPurchaseBtn');
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Add Purchase';
    
    updateAssetDisplay();
    renderPurchases();
    updateProjections();
    updateProgress();
    updatePurchasesSummary();
}

function renderPurchases() {
    const list = document.getElementById('purchasesList');
    const purchases = getPurchases();
    if (!list) return;
    
    const table = list.querySelector('.purchases-table');
    const emptyState = list.querySelector('.empty-state-modern');
    
    if (!purchases.length) {
        if (table) table.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (table) table.style.display = 'table';
    if (emptyState) emptyState.style.display = 'none';
    
    const tbody = table.querySelector('tbody');
    if (tbody) {
        tbody.innerHTML = purchases.map((p, idx) => {
            const amount = Number(p.amount);
            const price = Number(p.price);
            const value = amount * price;
            const date = new Date(p.date);
            
            // Determine if this is a new empty record
            const isNewRecord = amount === 0 && price === 0;
            const typeLabel = p.type.charAt(0).toUpperCase() + p.type.slice(1);
            
            return `
                <tr class="purchase-row ${isNewRecord ? 'editing' : ''}" data-purchase-index="${idx}">
                    <td class="purchase-date-cell" data-label="Date">
                        ${isNewRecord ? 
                            `<input type="datetime-local" 
                                   class="table-input date-input" 
                                   value="${formatDateTimeForInput(p.date)}" 
                                   onchange="updatePurchaseField(${idx}, 'date', this.value)">` :
                            `<span class="display-value">${formatDateTime(p.date)}</span>`
                        }
                    </td>
                    <td class="purchase-wallet-cell" data-label="Wallet">
                        ${isNewRecord ? 
                            `<select class="table-input wallet-select" 
                                    onchange="updatePurchaseField(${idx}, 'walletId', this.value)">
                                ${getWalletOptions(p.walletId)}
                            </select>` :
                            `<span class="display-value">${getWalletDisplayName(p.walletId) || 'No wallet'}</span>`
                        }
                    </td>
                    <td class="purchase-type-cell" data-label="Type">
                        ${isNewRecord ? 
                            `<select class="table-input type-select" 
                                    onchange="updatePurchaseField(${idx}, 'type', this.value)">
                                <option value="purchase" ${p.type === 'purchase' ? 'selected' : ''}>Purchase</option>
                                <option value="staking" ${p.type === 'staking' ? 'selected' : ''}>Staking Reward</option>
                                <option value="airdrop" ${p.type === 'airdrop' ? 'selected' : ''}>Airdrop</option>
                                <option value="other" ${p.type === 'other' ? 'selected' : ''}>Other</option>
                            </select>` :
                            `<span class="pill pill-${p.type}">${typeLabel}</span>`
                        }
                    </td>
                    <td class="purchase-amount-cell" data-label="Amount Added">
                        ${isNewRecord ? 
                            `<input type="text" 
                                   class="table-input amount-input" 
                                   placeholder="0" 
                                   value="${formatNumberInput(amount)}" 
                                   inputmode="decimal"
                                   onchange="updatePurchaseField(${idx}, 'amount', this.value)">
                            <span class="input-suffix">${currentAsset.symbol}</span>` :
                            `<span class="display-value">${formatAssetAmount(amount)} ${currentAsset.symbol}</span>`
                        }
                    </td>
                    <td class="purchase-price-cell" data-label="Price">
                        ${isNewRecord ? 
                            `<input type="text" 
                                   class="table-input price-input" 
                                   placeholder="0" 
                                   value="${formatNumberInput(price)}" 
                                   inputmode="decimal"
                                   onchange="updatePurchaseField(${idx}, 'price', this.value)">` :
                            `<span class="display-value">${formatCurrency(price)}</span>`
                        }
                    </td>
                    <td class="purchase-value-cell" data-label="Value">
                        <span class="calculated-value">${formatCurrency(value)}</span>
                    </td>
                    <td class="purchase-actions-cell" data-label="Actions">
                        ${isNewRecord ? 
                            `<button class="btn-icon success save-purchase-btn" data-purchase-index="${idx}" title="Save purchase">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn-icon secondary cancel-purchase-btn" data-purchase-index="${idx}" title="Cancel">
                                <i class="fas fa-times"></i>
                            </button>` :
                            `<button class="btn-icon primary edit-purchase-btn" data-purchase-index="${idx}" title="Edit purchase">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button class="btn-icon danger delete-purchase-btn" data-purchase-index="${idx}" title="Delete purchase">
                                <i class="fas fa-trash"></i>
                            </button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
        
        // Add event listeners for all buttons
        tbody.querySelectorAll('.edit-purchase-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const purchaseIndex = parseInt(this.dataset.purchaseIndex);
                toggleEditPurchase(purchaseIndex, true);
            });
        });
        
        tbody.querySelectorAll('.save-purchase-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const purchaseIndex = parseInt(this.dataset.purchaseIndex);
                savePurchaseEdits(purchaseIndex);
            });
        });
        
        tbody.querySelectorAll('.cancel-purchase-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const purchaseIndex = parseInt(this.dataset.purchaseIndex);
                cancelPurchaseEdits(purchaseIndex);
            });
        });
        
        tbody.querySelectorAll('.delete-purchase-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const purchaseIndex = parseInt(this.dataset.purchaseIndex);
                deletePurchaseRecord(purchaseIndex);
            });
        });
    }
    
    // Update purchases summary
    updatePurchasesSummary();
}

function updatePurchaseField(index, field, value) {
    console.log('🔧 updatePurchaseField called:', { index, field, value });
    
    if (!currentAsset.purchases || index < 0 || index >= currentAsset.purchases.length) {
        console.log('❌ Invalid purchase update:', { hasPurchases: !!currentAsset.purchases, index, length: currentAsset.purchases?.length });
        return;
    }
    
    const oldValue = currentAsset.purchases[index][field];
    const purchase = currentAsset.purchases[index];
    
    if (field === 'amount' || field === 'price') {
        // Use parseFloat with fallback parsing
        let numValue;
        if (typeof parseNumber === 'function') {
            numValue = parseNumber(value);
        } else {
            // Fallback parsing - handle comma decimal separator
            const cleanValue = String(value).replace(',', '.');
            numValue = parseFloat(cleanValue);
        }
        
        if (isNaN(numValue) || numValue < 0) {
            console.log('❌ Invalid numeric value:', { value, numValue });
            return;
        }
        
        // If amount changed and purchase has a wallet, update wallet amount
        if (field === 'amount' && purchase.walletId && oldValue !== numValue) {
            const amountDiff = numValue - (parseFloat(oldValue) || 0); // Positive means more purchased, negative means less purchased
            updateWalletAmount(purchase.walletId, amountDiff);
        }
        
        currentAsset.purchases[index][field] = numValue;
        console.log(`📝 Updated purchase ${index}.${field}: ${oldValue} → ${numValue}`);
    } else if (field === 'date') {
        currentAsset.purchases[index][field] = value;
        console.log(`📝 Updated purchase ${index}.${field}: ${oldValue} → ${value}`);
    } else if (field === 'type') {
        currentAsset.purchases[index][field] = value;
        console.log(`📝 Updated purchase ${index}.${field}: ${oldValue} → ${value}`);
    } else if (field === 'walletId') {
        // If wallet changed, update both old and new wallet amounts
        if (oldValue !== value && purchase.amount > 0) {
            // Remove amount from old wallet
            if (oldValue) {
                updateWalletAmount(oldValue, -purchase.amount);
            }
            // Add amount to new wallet
            if (value) {
                updateWalletAmount(value, purchase.amount);
            }
        }
        currentAsset.purchases[index][field] = value;
        console.log(`📝 Updated purchase ${index}.${field}: ${oldValue} → ${value}`);
    }
    
    // Recalculate asset holdings after changing purchases
    recalculateAssetHoldings();
    
    savePortfolio();
    renderPurchases();
    renderWallets(); // Update wallet display
    updateAssetDisplay();
    updateProjections();
    updateProgress();
}

function toggleEditPurchase(index, show) {
    const row = document.querySelector(`tr.purchase-row[data-purchase-index="${index}"]`);
    if (!row) return;
    
    const purchase = currentAsset.purchases[index];
    if (!purchase) return;
    
    if (show) {
        // Switch to edit mode
        const dateCell = row.querySelector('.purchase-date-cell');
        const typeCell = row.querySelector('.purchase-type-cell');
        const amountCell = row.querySelector('.purchase-amount-cell');
        const priceCell = row.querySelector('.purchase-price-cell');
        const actionsCell = row.querySelector('.purchase-actions-cell');
        
        if (dateCell && typeCell && amountCell && priceCell && actionsCell) {
            // Store original content
            dateCell.dataset.originalContent = dateCell.innerHTML;
            typeCell.dataset.originalContent = typeCell.innerHTML;
            amountCell.dataset.originalContent = amountCell.innerHTML;
            priceCell.dataset.originalContent = priceCell.innerHTML;
            actionsCell.dataset.originalContent = actionsCell.innerHTML;
            
            const date = new Date(purchase.date);
            
            // Replace with inputs
            dateCell.innerHTML = `
                <input type="datetime-local" 
                       class="table-input date-input edit-input" 
                       value="${formatDateTimeForInput(purchase.date)}" 
                       onchange="updatePurchaseField(${index}, 'date', this.value)">
            `;
            
            typeCell.innerHTML = `
                <select class="table-input type-select edit-input" 
                        onchange="updatePurchaseField(${index}, 'type', this.value)">
                    <option value="purchase" ${purchase.type === 'purchase' ? 'selected' : ''}>Purchase</option>
                    <option value="staking" ${purchase.type === 'staking' ? 'selected' : ''}>Staking Reward</option>
                    <option value="airdrop" ${purchase.type === 'airdrop' ? 'selected' : ''}>Airdrop</option>
                    <option value="other" ${purchase.type === 'other' ? 'selected' : ''}>Other</option>
                </select>
            `;
            
            amountCell.innerHTML = `
                <input type="text" 
                       class="table-input amount-input edit-input" 
                       placeholder="0" 
                       value="${formatNumberInput(purchase.amount)}" 
                       inputmode="decimal"
                       onchange="updatePurchaseField(${index}, 'amount', this.value)">
                <span class="input-suffix">${currentAsset.symbol}</span>
            `;
            
            priceCell.innerHTML = `
                <input type="text" 
                       class="table-input price-input edit-input" 
                       placeholder="0" 
                       value="${formatNumberInput(purchase.price)}" 
                       inputmode="decimal"
                       onchange="updatePurchaseField(${index}, 'price', this.value)">
            `;
            
            actionsCell.innerHTML = `
                <button class="btn-icon success save-purchase-btn" data-purchase-index="${index}" title="Save purchase">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn-icon secondary cancel-purchase-btn" data-purchase-index="${index}" title="Cancel">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // Re-attach event listeners
            const saveBtn = actionsCell.querySelector('.save-purchase-btn');
            const cancelBtn = actionsCell.querySelector('.cancel-purchase-btn');
            
            if (saveBtn) {
                saveBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    savePurchaseEdits(index);
                });
            }
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleEditPurchase(index, false);
                });
            }
            
            // Focus on first input
            const firstInput = dateCell.querySelector('input');
            if (firstInput) firstInput.focus();
        }
        
        row.classList.add('editing');
    } else {
        // Switch back to view mode
        const dateCell = row.querySelector('.purchase-date-cell');
        const typeCell = row.querySelector('.purchase-type-cell');
        const amountCell = row.querySelector('.purchase-amount-cell');
        const priceCell = row.querySelector('.purchase-price-cell');
        const actionsCell = row.querySelector('.purchase-actions-cell');
        
        if (dateCell && typeCell && amountCell && priceCell && actionsCell) {
            // Restore original content
            if (dateCell.dataset.originalContent) {
                dateCell.innerHTML = dateCell.dataset.originalContent;
                delete dateCell.dataset.originalContent;
            }
            if (typeCell.dataset.originalContent) {
                typeCell.innerHTML = typeCell.dataset.originalContent;
                delete typeCell.dataset.originalContent;
            }
            if (amountCell.dataset.originalContent) {
                amountCell.innerHTML = amountCell.dataset.originalContent;
                delete amountCell.dataset.originalContent;
            }
            if (priceCell.dataset.originalContent) {
                priceCell.innerHTML = priceCell.dataset.originalContent;
                delete priceCell.dataset.originalContent;
            }
            if (actionsCell.dataset.originalContent) {
                actionsCell.innerHTML = actionsCell.dataset.originalContent;
                delete actionsCell.dataset.originalContent;
            }
        }
        
        row.classList.remove('editing');
        renderPurchases(); // Re-render to ensure proper event listeners
    }
}

function savePurchaseEdits(index) {
    // The updatePurchaseField functions already handle saving
    // Just switch back to view mode
    toggleEditPurchase(index, false);
}

function cancelPurchaseEdits(index) {
    // Just switch back to view mode without saving
    toggleEditPurchase(index, false);
}

function updatePurchasesSummary() {
    const purchases = getPurchases();
    const summaryElement = document.getElementById('purchasesSummary');
    
    if (!purchases.length) {
        if (summaryElement) summaryElement.style.display = 'none';
        return;
    }
    
    if (summaryElement) summaryElement.style.display = 'block';
    
    let totalValue = 0;
    let totalAmount = 0;
    
    purchases.forEach(purchase => {
        const amount = Number(purchase.amount);
        const price = Number(purchase.price);
        totalValue += amount * price;
        totalAmount += amount;
    });
    
    const avgPrice = totalAmount > 0 ? totalValue / totalAmount : 0;
    
    document.getElementById('totalPurchasesValue').textContent = formatCurrency(totalValue);
    document.getElementById('totalPurchasesAmount').textContent = `${formatAssetAmount(totalAmount)} ${currentAsset.symbol}`;
    document.getElementById('avgPurchasePrice').textContent = formatCurrency(avgPrice);
}

function updateAvgPrice() {
    const purchases = getPurchases();
    if (!purchases.length) return;
    
    let totalValue = 0;
    let totalAmount = 0;
    
    purchases.forEach(purchase => {
        const amount = Number(purchase.amount);
        const price = Number(purchase.price);
        totalValue += amount * price;
        totalAmount += amount;
    });
    
    if (totalAmount > 0) {
        currentAsset.avgPrice = totalValue / totalAmount;
    }
}

function toggleLadderExecuted(index, checked) {
    if (!currentAsset || !currentAsset.exitStrategy || !currentAsset.exitStrategy[index]) return;
    const ladder = currentAsset.exitStrategy[index];
    ladder.executed = !!checked;
    // If executing now, compute executed amount based on current planned amount and reduce holdings
    if (ladder.executed) {
        const amountToSell = calculateLadderAmount(index) || 0;
        ladder.executedAmount = amountToSell;
        // Reduce holdings
        currentAsset.amount = Math.max(0, (parseFloat(currentAsset.amount) || 0) - amountToSell);
        // Create a corresponding sale record
        const sale = {
            id: `ladder-${index}-${Date.now()}`,
            amount: amountToSell,
            price: parseNumber(ladder.price) || 0,
            date: new Date().toISOString(),
            source: 'ladder'
        };
        const sales = getSales();
        sales.push(sale);
        saveSales(sales);
        ladder.saleId = sale.id;
    } else {
        // Un-executing: restore holdings by the previously executed amount if present
        if (typeof ladder.executedAmount === 'number') {
            currentAsset.amount = (parseFloat(currentAsset.amount) || 0) + ladder.executedAmount;
        }
        // Remove the linked sale record if it exists
        if (ladder.saleId) {
            const sales = getSales();
            const idx = sales.findIndex(s => s.id === ladder.saleId);
            if (idx !== -1) {
                sales.splice(idx, 1);
                saveSales(sales);
            }
        }
        delete ladder.executedAmount;
        delete ladder.saleId;
    }
    // Persist executed status and amount
    savePortfolio();
    renderExitLadders();
    updateProjections();
    updateProgress();
    renderSales();
    updateSalesSummary();
}

function savePortfolio() {
    // Use portfolio from memory - Supabase only
    const portfolio = window.portfolio || [];
    const assetIndex = portfolio.findIndex(asset => asset.id === currentAsset.id);
    
    console.log('💾 Saving - Portfolio length:', portfolio.length);
    console.log('💾 Saving - Portfolio asset IDs:', portfolio.map(a => a.id));
    console.log('💾 Saving - Portfolio assets full:', portfolio.map(a => ({id: a.id, symbol: a.symbol, amount: a.amount})));
    console.log('💾 Saving - Looking for asset ID:', currentAsset.id);
    console.log('💾 Saving - currentAsset details:', {id: currentAsset.id, symbol: currentAsset.symbol, amount: currentAsset.amount});
    console.log('💾 Saving - Found at index:', assetIndex);
    console.log('💾 Saving - Asset amount before save:', currentAsset.amount);
    
    // Debug the findIndex operation step by step
    portfolio.forEach((asset, index) => {
        const matches = asset.id === currentAsset.id;
        console.log(`💾 Saving - Index ${index}: ${asset.id} === ${currentAsset.id} ? ${matches}`);
    });
    
    if (assetIndex !== -1) {
        const oldAmount = portfolio[assetIndex].amount;
        portfolio[assetIndex] = currentAsset;
        console.log('💾 Saving - Updated asset amount from', oldAmount, 'to', currentAsset.amount);
    } else {
        // Asset not found, add it (shouldn't happen, but safety check)
        console.log('⚠️ Saving - Asset NOT found in portfolio! Adding as new asset.');
        console.log('⚠️ Saving - This suggests a duplicate creation issue!');
        portfolio.push(currentAsset);
    }
    
    // Update global variable - Supabase save will be called
    window.portfolio = portfolio;
    
    // Call Supabase save function if available
    if (typeof window.savePortfolioToSupabase === 'function') {
        window.savePortfolioToSupabase();
    }
    
    console.log('💾 Portfolio saved from strategy page:', currentAsset.symbol, 'amount:', currentAsset.amount);
    console.log('💾 Current asset detailed state:', {
        id: currentAsset.id,
        symbol: currentAsset.symbol,
        amount: currentAsset.amount,
        exitStrategy: currentAsset.exitStrategy?.length || 0,
        wallets: currentAsset.wallets?.length || 0,
        sales: currentAsset.sales?.length || 0,
        purchases: currentAsset.purchases?.length || 0
    });
    
    // Check what's in the global portfolio
    const savedAsset = window.portfolio.find(a => a.id === currentAsset.id);
    console.log('💾 What\'s in the global portfolio:', {
        found: !!savedAsset,
        exitStrategy: savedAsset?.exitStrategy?.length || 0,
        wallets: savedAsset?.wallets?.length || 0,
        sales: savedAsset?.sales?.length || 0,
        purchases: savedAsset?.purchases?.length || 0
    });
}

async function fetchCurrentPrices() {
    try {
        if (currentAsset) {
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${currentAsset.id}&vs_currencies=usd`);
            if (response.ok) {
                const data = await response.json();
                if (data[currentAsset.id] && data[currentAsset.id].usd) {
                    const usdPrice = data[currentAsset.id].usd;
                    
                    // Validate API price before using it
                    if (isFinite(usdPrice) && usdPrice > 0 && usdPrice !== 1 && !isNaN(usdPrice)) {
                        currentPrices[currentAsset.id] = usdPrice;
                        console.log('✅ Updated live price for', currentAsset.symbol, ':', usdPrice);
                    } else {
                        console.warn('🚨 Invalid API price for', currentAsset.symbol, ':', usdPrice, '- keeping cached price');
                        // Keep existing cached price, don't replace with hardcoded
                    }
                } else {
                    console.log('⚠️ No API data for', currentAsset.symbol, '- keeping cached price');
                }
            } else {
                console.log('📦 API request failed, keeping cached price');
            }
        }
    } catch (error) {
        console.log('API error:', error);
        console.log('📦 Using cached price due to API error');
        // Keep existing cached price, don't replace with hardcoded
    }
    
    // Only use hardcoded base price if we have NO price data at all
    if (currentAsset && !currentPrices[currentAsset.id]) {
        const basePrice = getBasePrice(currentAsset.symbol);
        if (basePrice) {
            currentPrices[currentAsset.id] = basePrice;
            console.log('🆕 Using hardcoded price for new asset', currentAsset.symbol, ':', basePrice);
        } else {
            console.warn('❌ No price data available for', currentAsset.symbol);
        }
    }
    
    updateDisplay();
    updateAssetTicker();
    

}

function updateDisplay() {
    updateAssetDisplay();
    renderExitLadders(); // Ensure distance calculations update with price changes
    updateProjections();
    updateProgress();
}

function formatAssetAmount(num) {
    if (!isFinite(num)) return '0';
    const abs = Math.abs(num);
    const locale = (JSON.parse(localStorage.getItem('cep_user_prefs')||'{}').locale) || 'en-GB';
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
    const locale = (JSON.parse(localStorage.getItem('cep_user_prefs')||'{}').locale) || 'en-GB';
    return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: maxDecimals }).format(num/100);
}

function formatNumberInput(num) {
    if (!isFinite(num)) return '0';
    // Remove trailing zeros for input values
    return parseFloat(num).toString();
}

function parseNumber(value) {
    const raw = String(value ?? '').trim();
    if (raw === '') return 0;
    // Remove spaces used as thousand separators
    let normalized = raw.replace(/\s+/g, '');
    // If there is a comma but no dot, treat comma as decimal separator
    if (normalized.indexOf(',') !== -1 && normalized.indexOf('.') === -1) {
        normalized = normalized.replace(',', '.');
    } else {
        // Otherwise, remove any commas (e.g., 1,234.56)
        normalized = normalized.replace(/,/g, '');
    }
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
}

function formatCurrency(amount) {
    const prefs = JSON.parse(localStorage.getItem('cep_user_prefs')||'{}');
    const locale = prefs.locale || 'en-GB';
    const convertedAmount = amount * exchangeRates[currentCurrency];
    const abs = Math.abs(convertedAmount);
    let maxFrac = currentCurrency === 'USD' ? 2 : (abs < 100 ? 2 : 0);
    
    const isZero = abs < 1e-8;
    
    // For NOK, use manual formatting since Intl might not handle it well
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

function formatPrice(price) {
    if (!isFinite(price) || price <= 0) return '-';
    const prefs = JSON.parse(localStorage.getItem('cep_user_prefs')||'{}');
    const locale = prefs.locale || 'en-GB';
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
        return new Intl.NumberFormat(locale, { minimumSignificantDigits: 3, maximumSignificantDigits: 7 }).format(price);
    }
    // For extremely small values, show with fixed decimal places instead of scientific notation
    if (abs >= 0.00000001) {
        return new Intl.NumberFormat(locale, { minimumFractionDigits: 8, maximumFractionDigits: 8 }).format(price);
    }
    // Last resort for truly tiny values - avoid scientific notation completely
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 10, maximumFractionDigits: 10 }).format(price);
}

// ===== NEWS TICKER FUNCTIONALITY =====

function initializeNewsTicker() {
    console.log('initializeNewsTicker: Starting, currentAsset:', currentAsset);
    if (!currentAsset) {
        console.log('initializeNewsTicker: No currentAsset, skipping');
        return;
    }
    
    setupNewsTickerEventListeners();
    fetchAssetNews();
}

function setupNewsTickerEventListeners() {
    const toggleBtn = document.getElementById('toggleNewsTicker');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const container = document.getElementById('newsTickerContainer');
            const isVisible = container.style.display !== 'none';
            container.style.display = isVisible ? 'none' : 'block';
            
            toggleBtn.innerHTML = isVisible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
            toggleBtn.title = isVisible ? 'Show news' : 'Hide news';
            
            // Save preference
            localStorage.setItem('cep_strategy_news_visible', isVisible ? 'false' : 'true');
        });
    }
    
    // Load visibility preference
    const newsVisible = localStorage.getItem('cep_strategy_news_visible') !== 'false';
    const container = document.getElementById('newsTickerContainer');
    if (container && newsVisible) {
        container.style.display = 'block';
    }
}

function fetchAssetNews() {
    console.log('fetchAssetNews: Starting, currentAsset:', currentAsset);
    if (!currentAsset) {
        console.log('fetchAssetNews: No currentAsset, returning');
        return;
    }
    
    // Generate coin-specific events
    const assetEvents = generateAssetSpecificEvents(currentAsset);
    console.log('fetchAssetNews: Generated events:', assetEvents);
    populateNewsTicker(assetEvents);
    
    // Update ticker label with asset name
    const tickerLabel = document.getElementById('tickerAssetName');
    if (tickerLabel) {
        tickerLabel.textContent = `${currentAsset.name} News`;
        console.log('fetchAssetNews: Updated ticker label to:', `${currentAsset.name} News`);
    } else {
        console.log('fetchAssetNews: tickerAssetName element not found');
    }
}

function generateAssetSpecificEvents(asset) {
    const events = [];
    const now = Date.now();
    
    // Asset-specific event templates
    const eventTemplates = {
        bitcoin: [
            {
                title: 'Bitcoin ETF Sees Record Inflows',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=Bitcoin+ETF+record+inflows+institutional+investors',
                impact: 'positive'
            },
            {
                title: 'MicroStrategy Adds More BTC to Treasury',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=MicroStrategy+Bitcoin+treasury+purchase+announcement',
                impact: 'positive'
            },
            {
                title: 'El Salvador Continues Bitcoin Accumulation',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=El+Salvador+Bitcoin+accumulation+purchase+strategy',
                impact: 'positive'
            }
        ],
        ethereum: [
            {
                title: 'Ethereum Network Upgrade Completed Successfully',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=Ethereum+network+upgrade+completed+successfully',
                impact: 'positive'
            },
            {
                title: 'DeFi TVL on Ethereum Reaches New All-Time High',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=Ethereum+DeFi+TVL+all+time+high+total+value+locked',
                impact: 'positive'
            },
            {
                title: 'Major Institution Launches Ethereum Staking Service',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=major+institution+Ethereum+staking+service+launch',
                impact: 'positive'
            }
        ],
        cardano: [
            {
                title: 'Grayscale Registers Cardano ETF Entity',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=Grayscale+Cardano+ETF+entity+Delaware+registration',
                impact: 'positive'
            },
            {
                title: 'Cardano DeFi Ecosystem Shows Strong Growth',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=Cardano+DeFi+ecosystem+growth+strong+development',
                impact: 'positive'
            },
            {
                title: 'New Governance Proposal Passes on Cardano',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=Cardano+governance+proposal+passes+voting',
                impact: 'neutral'
            }
        ],
        solana: [
            {
                title: 'Solana Network Achieves Record Transaction Throughput',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=Solana+network+record+transaction+throughput+achievement',
                impact: 'positive'
            },
            {
                title: 'Major Gaming Platform Migrates to Solana',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=gaming+platform+migrates+Solana+blockchain',
                impact: 'positive'
            },
            {
                title: 'Solana Mobile Phone Sales Exceed Expectations',
                source: 'Google Search',
                sourceUrl: 'https://www.google.com/search?q=Solana+mobile+phone+sales+exceed+expectations',
                impact: 'positive'
            }
        ]
    };
    
    const templates = eventTemplates[asset.id] || [];
    
    templates.forEach((template, index) => {
        events.push({
            id: `ticker_${asset.id}_${index}`,
            assetId: asset.id,
            assetSymbol: asset.symbol,
            assetName: asset.name,
            assetIcon: asset.icon,
            title: `${asset.name}: ${template.title}`,
            description: `${template.title} - Latest news about ${asset.name} (${asset.symbol})`,
            source: template.source,
            sourceUrl: template.sourceUrl,
            impact: template.impact,
            timestamp: now - Math.random() * 24 * 60 * 60 * 1000 // Random time in last 24h
        });
    });
    
    // Add price movement event if significant
    const priceChange = priceChanges24h?.[asset.id] || 0;
    if (Math.abs(priceChange) > 3) {
        const isPositive = priceChange > 0;
        const direction = isPositive ? 'gains' : 'drops';
        
        events.push({
            id: `ticker_price_${asset.id}`,
            assetId: asset.id,
            assetSymbol: asset.symbol,
            assetName: asset.name,
            assetIcon: asset.icon,
            title: `${asset.name} ${direction} ${Math.abs(priceChange).toFixed(1)}% in 24 hours`,
            description: `${asset.name} (${asset.symbol}) has experienced significant price movement: ${direction} ${Math.abs(priceChange).toFixed(1)}% in the last 24 hours`,
            source: 'Market Data',
            sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(asset.name + ' price ' + direction)}`,
            impact: isPositive ? 'positive' : 'negative',
            timestamp: now - Math.random() * 6 * 60 * 60 * 1000 // Random time in last 6h
        });
    }
    
    return events;
}

function populateNewsTicker(events) {
    const tickerContent = document.getElementById('newsTickerContent');
    const container = document.getElementById('newsTickerContainer');
    
    console.log('populateNewsTicker: Starting with events:', events);
    console.log('populateNewsTicker: Elements found:', {
        tickerContent: !!tickerContent,
        container: !!container,
        eventsLength: events.length
    });
    
    if (!tickerContent || !container || events.length === 0) {
        console.log('populateNewsTicker: Missing elements or no events, hiding container');
        if (container) container.style.display = 'none';
        return;
    }
    
    // Show ticker if we have events
    container.style.display = 'block';
    console.log('populateNewsTicker: Showing ticker container');
    
    // Sort events by timestamp (newest first)
    events.sort((a, b) => b.timestamp - a.timestamp);
    
    // Create ticker items HTML
    const tickerItems = events.map(event => createTickerItemHTML(event)).join('');
    
    // Only duplicate content if we have many items (for seamless scrolling)
    if (events.length >= 4) {
        tickerContent.innerHTML = tickerItems + tickerItems;
        // Enable scrolling animation
        tickerContent.style.animation = 'scroll-horizontal 60s linear infinite';
    } else {
        tickerContent.innerHTML = tickerItems;
        // Disable scrolling animation for few items
        tickerContent.style.animation = 'none';
        tickerContent.style.justifyContent = 'flex-start';
    }
    
    // Add click handlers
    tickerContent.querySelectorAll('.ticker-item').forEach(item => {
        item.addEventListener('click', () => {
            const sourceUrl = item.dataset.sourceUrl;
            if (sourceUrl && sourceUrl !== 'null') {
                window.open(sourceUrl, '_blank', 'noopener,noreferrer');
            }
        });
    });
}

function createTickerItemHTML(event) {
    const timeAgo = formatTimeAgo(event.timestamp);
    const hasSourceUrl = event.sourceUrl && event.sourceUrl !== 'null';
    
    return `
        <div class="ticker-item" ${hasSourceUrl ? `data-source-url="${event.sourceUrl}"` : ''}>
            <div class="ticker-item-content">
                <div class="ticker-item-title">${event.title}</div>
                <span class="ticker-item-time">${timeAgo}</span>
                <span class="ticker-item-impact ${event.impact}">
                    ${event.impact === 'positive' ? '📈' : event.impact === 'negative' ? '📉' : '📊'} 
                    ${event.impact}
                </span>
                <span class="ticker-item-source">${event.source}</span>
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

function loadCachedPrices() {
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
                
                for (const [assetId, price] of Object.entries(priceData.prices || {})) {
                    // More strict validation: reject suspicious prices
                    if (isFinite(price) && price > 0 && price !== 1 && price < 1000000 && !isNaN(price)) {
                        validPrices[assetId] = price;
                    } else {
                        console.warn('🚨 Rejecting suspicious cached price for', assetId, ':', price);
                    }
                }
                
                if (Object.keys(validPrices).length > 0) {
                    currentPrices = validPrices;
                    
                    // Also load price changes if available
                    if (priceData.changes) {
                        priceChanges24h = priceData.changes;
                    }
                    
                    const ageHours = Math.round(cacheAge / (60 * 60 * 1000));
                    console.log(`📦 Strategy: Loaded cached prices (${ageHours}h old):`, Object.keys(currentPrices).length, 'assets');
                    return true;
                }
            }
        }
    } catch (error) {
        console.warn('Strategy: Failed to load prices from storage:', error);
    }
    return false;
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

// Initialize currency displays for strategy page
function initializeStrategyCurrencyDisplays() {
    const strategyCurrencyElements = [
        'currentPriceLarge',
        'currentValue',
        'avgPrice',
        'totalPnL',
        'totalExitValue',
        'avgExitPrice',
        'totalRealized',
        'totalSalesValueOverview',
        'totalTaxDueOverview',
        'totalTitheOverview',
        'totalNetAmountOverview',
        'projectedNetAmountOverview',
        'projectedTaxDueOverview',
        'projectedTitheOverview',
        'totalPurchasesValue',
        'avgPurchasePrice'
    ];
    
    const zeroValue = formatCurrency(0);
    
    strategyCurrencyElements.forEach(id => {
        const element = document.getElementById(id);
        if (element && (element.textContent === '0' || element.textContent === '$0')) {
            element.textContent = zeroValue;
        }
    });
    
    // Initialize any other elements that might contain currency
    const allElementsWithCurrency = document.querySelectorAll('[id*="total"], [id*="realized"], [id*="value"], [id*="amount"], [id*="price"]');
    allElementsWithCurrency.forEach(element => {
        if (element.textContent && element.textContent.includes('$0')) {
            element.textContent = element.textContent.replace('$0', zeroValue);
        }
    });
}

// ===== ASSET TICKER FUNCTIONS =====

async function updateAssetTicker() {
    console.log('updateAssetTicker called with currentAsset:', currentAsset);
    if (!currentAsset || !currentAsset.id) {
        console.log('No asset or asset.id available for ticker. currentAsset:', currentAsset);
        return;
    }
    
    console.log('Fetching ticker data for asset:', currentAsset.id, currentAsset.symbol);
    
    try {
        // Fetch detailed asset data from CoinGecko
        const response = await fetch(`https://api.coingecko.com/api/v3/coins/${currentAsset.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Asset ticker data for', currentAsset.symbol, ':', data);
        
        // Update ticker elements
        updateTickerElement('assetChange24h', data.market_data?.price_change_percentage_24h, 'percentage');
        updateTickerElement('assetChange7d', data.market_data?.price_change_percentage_7d, 'percentage');
        updateTickerElement('assetChange30d', data.market_data?.price_change_percentage_30d, 'percentage');
        updateTickerElement('assetMarketCap', data.market_data?.market_cap?.usd, 'currency');
        updateTickerElement('assetVolume24h', data.market_data?.total_volume?.usd, 'currency');
        updateTickerElement('assetCirculatingSupply', data.market_data?.circulating_supply, 'supply');
        updateTickerElement('assetTotalSupply', data.market_data?.total_supply, 'supply');
        
    } catch (error) {
        console.error('Error fetching asset ticker data:', error);
        
        // Set fallback values
        const tickerElements = ['assetChange24h', 'assetChange7d', 'assetChange30d', 'assetMarketCap', 'assetVolume24h', 'assetCirculatingSupply', 'assetTotalSupply'];
        tickerElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '-';
                element.className = getTickerClassName(id, 'neutral');
            }
        });
    }
}

function updateTickerElement(elementId, value, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (value === null || value === undefined) {
        element.textContent = '-';
        element.className = getTickerClassName(elementId, 'neutral');
        return;
    }
    
    let displayValue = '';
    let className = '';
    
    switch (type) {
        case 'percentage':
            displayValue = formatPercentage(value);
            className = getTickerClassName(elementId, value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral');
            break;
            
        case 'currency':
            displayValue = formatLargeNumber(value);
            className = getTickerClassName(elementId, 'neutral');
            break;
            
        case 'supply':
            displayValue = formatSupply(value);
            className = getTickerClassName(elementId, 'neutral');
            break;
            
        default:
            displayValue = value.toString();
            className = getTickerClassName(elementId, 'neutral');
    }
    
    element.textContent = displayValue;
    element.className = className;
}

function getTickerClassName(elementId, state) {
    // Check if it's a percentage change field
    if (elementId.includes('Change')) {
        return `ticker-change ${state}`;
    } else {
        return `ticker-price ${state}`;
    }
}

function formatLargeNumber(num) {
    if (num >= 1e12) {
        return formatCurrency(num / 1e12) + 'T';
    } else if (num >= 1e9) {
        return formatCurrency(num / 1e9) + 'B';
    } else if (num >= 1e6) {
        return formatCurrency(num / 1e6) + 'M';
    } else if (num >= 1e3) {
        return formatCurrency(num / 1e3) + 'K';
    } else {
        return formatCurrency(num);
    }
}

function formatSupply(num) {
    if (num >= 1e12) {
        return (num / 1e12).toFixed(2) + 'T';
    } else if (num >= 1e9) {
        return (num / 1e9).toFixed(2) + 'B';
    } else if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + 'M';
    } else if (num >= 1e3) {
        return (num / 1e3).toFixed(2) + 'K';
    } else {
        return Math.round(num).toLocaleString();
    }
}

// ===== HOLDINGS RECALCULATION =====

function recalculateAssetHoldings() {
    if (!currentAsset) {
        console.log('❌ recalculateAssetHoldings: No currentAsset');
        return;
    }
    
    console.log('🔄 Recalculating holdings for', currentAsset.symbol);
    console.log('📊 Current asset state:', {
        currentAmount: currentAsset.amount,
        currentAvgPrice: currentAsset.avgPrice,
        purchases: currentAsset.purchases,
        sales: currentAsset.sales,
        exitStrategy: currentAsset.exitStrategy
    });
    
    // Get all purchases
    const purchases = currentAsset.purchases || [];
    // Get all sales (including executed exit levels)
    const sales = currentAsset.sales || [];
    
    console.log('📦 Found', purchases.length, 'purchases and', sales.length, 'sales');
    
    // Calculate total purchased
    let totalPurchased = 0;
    let totalCost = 0;
    
    purchases.forEach((purchase, idx) => {
        const amount = parseFloat(purchase.amount) || 0;
        const price = parseFloat(purchase.price) || 0;
        const cost = amount * price;
        console.log(`  Purchase ${idx}:`, { amount, price, cost });
        totalPurchased += amount;
        totalCost += cost;
    });
    
    // Calculate total sold
    let totalSold = 0;
    
    sales.forEach((sale, idx) => {
        const amount = parseFloat(sale.amount) || 0;
        console.log(`  Sale ${idx}:`, { amount });
        totalSold += amount;
    });
    
    // Add executed exit levels to total sold
    let executedAmount = 0;
    if (Array.isArray(currentAsset.exitStrategy)) {
        currentAsset.exitStrategy.forEach((level, idx) => {
            if (level.executed) {
                const amount = parseFloat(level.executedAmount) || 0;
                console.log(`  Executed level ${idx}:`, { amount });
                executedAmount += amount;
                totalSold += amount;
            }
        });
    }
    
    // Get the initial holdings (what was manually added to portfolio)
    // We need to track purchases separately from initial holdings
    let initialHoldings = 0;
    let initialAvgPrice = currentAsset.avgPrice || 0;
    
    // If we have purchase history stored, we can derive the initial holdings
    // by looking at what the total was before considering purchases/sales
    if (currentAsset.initialAmount !== undefined) {
        // Use explicitly stored initial amount
        initialHoldings = parseFloat(currentAsset.initialAmount) || 0;
    } else {
        // For existing assets without initialAmount, try to derive it
        // This handles legacy data where initial holdings weren't tracked separately
        const currentAmount = parseFloat(currentAsset.amount) || 0;
        const netPurchasesSales = totalPurchased - totalSold;
        initialHoldings = Math.max(0, currentAmount - netPurchasesSales);
        
        // Store this for future calculations
        currentAsset.initialAmount = initialHoldings;
    }
    
    // Calculate final holdings: Initial + Purchases - Sales - Executed Exit Levels
    const finalHoldings = initialHoldings + totalPurchased - totalSold;
    
    // Calculate weighted average price including initial holdings
    let weightedAvgPrice = initialAvgPrice;
    if (totalPurchased > 0) {
        const initialCost = initialHoldings * initialAvgPrice;
        const totalCostIncludingInitial = initialCost + totalCost;
        const totalAmountIncludingInitial = initialHoldings + totalPurchased;
        weightedAvgPrice = totalAmountIncludingInitial > 0 ? totalCostIncludingInitial / totalAmountIncludingInitial : initialAvgPrice;
    }
    
    console.log('📈 Holdings calculation result:', {
        initialHoldings,
        initialAvgPrice,
        totalPurchased,
        totalSold,
        executedAmount,
        finalHoldings,
        weightedAvgPrice,
        totalCost,
        oldAmount: currentAsset.amount,
        oldAvgPrice: currentAsset.avgPrice
    });
    
    // Update the asset with new calculated values
    currentAsset.amount = Math.max(0, finalHoldings);
    currentAsset.avgPrice = weightedAvgPrice;
    
    console.log('✅ Updated asset holdings (Initial + Purchases - Sales):', { 
        newAmount: currentAsset.amount, 
        newAvgPrice: currentAsset.avgPrice,
        breakdown: `${initialHoldings} + ${totalPurchased} - ${totalSold} = ${finalHoldings}`
    });
    
    // Find and update in portfolio from global variable
    const portfolio = window.portfolio || [];
    const assetIndex = portfolio.findIndex(a => a.id === currentAsset.id);
    
    if (assetIndex !== -1) {
        portfolio[assetIndex].amount = currentAsset.amount;
        portfolio[assetIndex].avgPrice = currentAsset.avgPrice;
        portfolio[assetIndex].initialAmount = currentAsset.initialAmount; // Store initial amount for future calculations
        
        // Update global variable - Supabase save will be called
        window.portfolio = portfolio;
        
        // Call Supabase save function if available
        if (typeof window.savePortfolioToSupabase === 'function') {
            window.savePortfolioToSupabase();
        }
        
        console.log('💾 Updated asset in portfolio via recalculateAssetHoldings:', portfolio[assetIndex]);
    } else {
        console.log('❌ Asset not found in portfolio:', currentAsset.id);
    }
}

// ===== WALLET MANAGEMENT FUNCTIONS =====

function getWallets() {
    return currentAsset.wallets || [];
}

function saveWallets(wallets) {
    currentAsset.wallets = wallets;
    savePortfolio();
}

function addWalletRecord() {
    const wallets = getWallets();
    const newWallet = {
        id: Date.now().toString(),
        name: '',
        type: 'Hardware Wallet', // Default type
        amount: 0, // Initial amount (user-editable)
        transactionBalance: 0, // Running transaction total
        percentage: 0
    };
    
    wallets.push(newWallet);
    saveWallets(wallets);
    renderWallets();
    
    // Auto-focus on the new wallet name field
    setTimeout(() => {
        const newRowIndex = wallets.length - 1;
        const nameInput = document.querySelector(`[data-wallet-index="${newRowIndex}"] .wallet-name-input`);
        if (nameInput) nameInput.focus();
    }, 100);
}

function renderWallets() {
    const walletContainer = document.getElementById('walletManagement');
    const table = walletContainer.querySelector('.wallets-table');
    const emptyState = walletContainer.querySelector('.empty-state-modern');
    const summary = walletContainer.querySelector('.wallet-summary');
    
    const wallets = getWallets();
    
    if (!wallets || wallets.length === 0) {
        table.style.display = 'none';
        summary.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    table.style.display = 'table';
    summary.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    
    const tbody = table.querySelector('tbody');
    const totalHoldings = parseFloat(currentAsset.amount) || 0;
    const currentPrice = currentPrices[currentAsset.id] || 0;
    
    tbody.innerHTML = wallets.map((wallet, index) => {
        const currentAmount = getWalletCurrentAmount(wallet); // Initial + transactions
        const initialAmount = parseFloat(wallet.amount) || 0; // User-set initial amount  
        const percentage = totalHoldings > 0 ? (currentAmount / totalHoldings * 100) : 0;
        const value = currentAmount * currentPrice;
        const isNewRecord = (!wallet.name || wallet.name.trim() === '') || wallet._isEditing;
        
        return `
            <tr class="wallet-row ${isNewRecord ? 'editing' : ''}" data-wallet-index="${index}">
                                    <td class="wallet-name-cell" data-label="Wallet Name">
                        ${isNewRecord ? 
                            `<input type="text" 
                               class="table-input wallet-name-input" 
                               placeholder="e.g., Ledger Nano S" 
                               value="${wallet.name}"
                               data-field="name"
                               data-wallet-index="${index}"
                               oninput="this.dataset.hasChanges = 'true'">` :
                            `<span class="display-value">${wallet.name}</span>`
                        }
                    </td>
                <td class="wallet-type-cell" data-label="Type">
                    ${isNewRecord ? 
                        `<select class="table-input wallet-type-select" 
                                data-field="type"
                                data-wallet-index="${index}">
                            <option value="Hardware Wallet" ${wallet.type === 'Hardware Wallet' ? 'selected' : ''}>Hardware Wallet</option>
                            <option value="Exchange" ${wallet.type === 'Exchange' ? 'selected' : ''}>Exchange</option>
                            <option value="DeFi Protocol" ${wallet.type === 'DeFi Protocol' ? 'selected' : ''}>DeFi Protocol</option>
                            <option value="Hot Wallet" ${wallet.type === 'Hot Wallet' ? 'selected' : ''}>Hot Wallet</option>
                            <option value="Cold Storage" ${wallet.type === 'Cold Storage' ? 'selected' : ''}>Cold Storage</option>
                            <option value="Staking" ${wallet.type === 'Staking' ? 'selected' : ''}>Staking</option>
                            <option value="Other" ${wallet.type === 'Other' ? 'selected' : ''}>Other</option>
                        </select>` :
                        `<span class="display-value wallet-type-badge ${wallet.type.toLowerCase().replace(/\s+/g, '-')}">${wallet.type}</span>`
                    }
                </td>
                <td class="wallet-amount-cell" data-label="Amount">
                    ${isNewRecord ? 
                        `<input type="text" 
                           class="table-input wallet-amount-input" 
                           placeholder="0"
                           value="${formatNumberInput(initialAmount)}" 
                           inputmode="decimal"
                           data-field="amount"
                           data-wallet-index="${index}"
                           oninput="validateWalletAmountInput(this, ${index})">
                        <span class="input-suffix">${currentAsset.symbol}</span>` :
                        `<span class="display-value">${formatAssetAmount(currentAmount)} ${currentAsset.symbol}
                         ${currentAmount !== initialAmount ? `<small class="amount-breakdown">(${formatAssetAmount(initialAmount)} initial + ${formatAssetAmount(currentAmount - initialAmount)} transactions)</small>` : ''}</span>`
                    }
                </td>
                <td class="wallet-percentage-cell" data-label="% of Total">
                    <span class="display-value">${percentage.toFixed(1)}%</span>
                </td>
                <td class="wallet-value-cell" data-label="Value">
                    <span class="display-value">${formatCurrency(value)}</span>
                </td>
                <td class="wallet-actions-cell" data-label="Actions">
                    ${isNewRecord ? 
                        `<button class="btn-icon success save-wallet-btn" data-wallet-index="${index}" title="Save wallet">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-icon secondary cancel-wallet-btn" data-wallet-index="${index}" title="Cancel">
                            <i class="fas fa-times"></i>
                        </button>` :
                        `<button class="btn-icon primary edit-wallet-btn" data-wallet-index="${index}" title="Edit wallet">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon danger delete-wallet-btn" data-wallet-index="${index}" title="Delete wallet">
                            <i class="fas fa-trash"></i>
                        </button>`
                    }
                </td>
            </tr>
        `;
    }).join('');
    
    // Update summary
    updateWalletSummary();
    
    // Attach event listeners
    attachWalletEventListeners();
}

function updateWalletSummary() {
    const wallets = getWallets();
    let totalHoldings = parseFloat(currentAsset.amount) || 0;
    
    let totalDistributed = 0;
    wallets.forEach(wallet => {
        totalDistributed += getWalletCurrentAmount(wallet); // Use current amount (initial + transactions)
    });
    
    // If wallet amounts exceed total holdings, update total holdings
    if (totalDistributed > totalHoldings) {
        currentAsset.amount = totalDistributed;
        totalHoldings = totalDistributed;
        savePortfolio(); // Save the updated total holdings
        
        // Update the main holdings display
        updateAssetDisplay();
        
        console.log(`📊 Updated total holdings from ${formatAssetAmount(parseFloat(currentAsset.amount) || 0)} to ${formatAssetAmount(totalDistributed)} ${currentAsset.symbol} based on wallet distribution`);
    }
    
    const undistributed = Math.max(0, totalHoldings - totalDistributed);
    
    document.getElementById('totalDistributedAmount').textContent = 
        `${formatAssetAmount(totalDistributed)} ${currentAsset.symbol}`;
    document.getElementById('undistributedAmount').textContent = 
        `${formatAssetAmount(undistributed)} ${currentAsset.symbol}`;
    document.getElementById('totalWalletsCount').textContent = wallets.length;
    
    // Clear any warning styles since we auto-correct now
    const undistributedElement = document.getElementById('undistributedAmount');
    undistributedElement.style.color = '';
    undistributedElement.title = '';
}

function attachWalletEventListeners() {
    const tbody = document.querySelector('.wallets-table tbody');
    if (!tbody) return;
    
    // Edit buttons
    tbody.querySelectorAll('.edit-wallet-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const walletIndex = parseInt(this.dataset.walletIndex);
            toggleEditWallet(walletIndex, true);
        });
    });
    
    // Save buttons
    tbody.querySelectorAll('.save-wallet-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const walletIndex = parseInt(this.dataset.walletIndex);
            saveWalletEdits(walletIndex);
        });
    });
    
    // Cancel buttons
    tbody.querySelectorAll('.cancel-wallet-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const walletIndex = parseInt(this.dataset.walletIndex);
            cancelWalletEdits(walletIndex);
        });
    });
    
    // Delete buttons
    tbody.querySelectorAll('.delete-wallet-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const walletIndex = parseInt(this.dataset.walletIndex);
            deleteWalletRecord(walletIndex);
        });
    });
}

// updateWalletField function removed - wallets now use explicit save/cancel pattern

function validateWalletAmountInput(input, walletIndex) {
    const value = parseFloat(input.value) || 0;
    
    // Since we auto-update total holdings when wallet amounts exceed it,
    // we only need to validate that the amount is non-negative
    if (value < 0) {
        input.classList.add('invalid');
        input.title = `Amount cannot be negative`;
    } else {
        input.classList.remove('invalid');
        input.title = '';
    }
}

function toggleEditWallet(index, show) {
    const wallets = getWallets();
    if (!wallets[index]) return;
    
    if (show) {
        // Store original values for cancel
        wallets[index]._original = { ...wallets[index] };
        
        // Mark as new record to trigger edit mode
        wallets[index]._isEditing = true;
    } else {
        // Remove editing flag
        delete wallets[index]._isEditing;
    }
    
    renderWallets();
    
    if (show) {
        // Auto-focus on the name input after render
        setTimeout(() => {
            const nameInput = document.querySelector(`[data-wallet-index="${index}"] .wallet-name-input`);
            if (nameInput) nameInput.focus();
        }, 100);
    }
}

function saveWalletEdits(index) {
    const wallets = getWallets();
    if (!wallets[index]) return;
    
    // Collect values from input fields
    const row = document.querySelector(`[data-wallet-index="${index}"]`);
    if (!row) return;
    
    const nameInput = row.querySelector('.wallet-name-input');
    const typeSelect = row.querySelector('.wallet-type-select');
    const amountInput = row.querySelector('.wallet-amount-input');
    
    if (nameInput && typeSelect && amountInput) {
        const name = nameInput.value.trim();
        const type = typeSelect.value;
        const amount = parseFloat(amountInput.value) || 0;
        
        // Validate required fields
        if (!name) {
            alert('Please enter a wallet name');
            nameInput.focus();
            return;
        }
        
        // Update the wallet data
        wallets[index].name = name;
        wallets[index].type = type;
        wallets[index].amount = Math.max(0, amount);
    }
    
    // Remove original backup and editing flag
    delete wallets[index]._original;
    delete wallets[index]._isEditing;
    
    saveWallets(wallets);
    renderWallets();
    updateWalletSummary();
}

function cancelWalletEdits(index) {
    const wallets = getWallets();
    if (!wallets[index]) return;
    
    if (wallets[index]._original) {
        // Restore original values
        Object.assign(wallets[index], wallets[index]._original);
        delete wallets[index]._original;
        delete wallets[index]._isEditing;
    } else {
        // New record - remove it
        wallets.splice(index, 1);
    }
    
    saveWallets(wallets);
    renderWallets();
}

function deleteWalletRecord(index) {
    const wallets = getWallets();
    if (!wallets[index]) return;
    
    if (confirm(`Are you sure you want to delete wallet "${wallets[index].name}"?`)) {
        wallets.splice(index, 1);
        saveWallets(wallets);
        renderWallets();
        updateWalletSummary();
    }
}

function getWalletOptions(selectedWalletId = '') {
    const wallets = getWallets();
    if (!wallets || wallets.length === 0) {
        return '<option value="">No wallet specified</option>';
    }
    
    let options = `<option value="" ${selectedWalletId === '' ? 'selected' : ''}>No wallet specified</option>`;
    wallets.forEach(wallet => {
        if (wallet.name && wallet.name.trim() !== '') {
            const isSelected = selectedWalletId === wallet.id ? 'selected' : '';
            options += `<option value="${wallet.id}" ${isSelected}>${wallet.name} (${wallet.type})</option>`;
        }
    });
    return options;
}

function getWalletDisplayName(walletId) {
    if (!walletId) return null;
    
    const wallets = getWallets();
    const wallet = wallets.find(w => w.id === walletId);
    return wallet ? `${wallet.name} (${wallet.type})` : null;
}

// Update a specific wallet's transaction balance (not the initial amount)
function updateWalletAmount(walletId, amountChange) {
    if (!walletId || amountChange === 0) return;
    
    const wallets = getWallets();
    const wallet = wallets.find(w => w.id === walletId);
    
    if (wallet) {
        // Initialize transaction balance if it doesn't exist
        if (typeof wallet.transactionBalance === 'undefined') {
            wallet.transactionBalance = 0;
        }
        
        const oldTransactionBalance = parseFloat(wallet.transactionBalance) || 0;
        wallet.transactionBalance = oldTransactionBalance + amountChange;
        
        console.log(`🏦 Updated wallet "${wallet.name}" transaction balance: ${oldTransactionBalance} → ${wallet.transactionBalance} (${amountChange >= 0 ? '+' : ''}${amountChange})`);
        
        saveWallets(wallets);
    } else {
        console.warn(`⚠️ Wallet with ID ${walletId} not found`);
    }
}

// Calculate the current wallet amount (initial + transactions)
function getWalletCurrentAmount(wallet) {
    const initialAmount = parseFloat(wallet.amount) || 0; // User-set initial amount
    const transactionBalance = parseFloat(wallet.transactionBalance) || 0; // Running transaction total
    return Math.max(0, initialAmount + transactionBalance);
}

// Toggle Net Take-Home view between projected and realized (strategy page)
function toggleStrategyNetTakeHomeView() {
    const toggleButton = document.getElementById('strategyNetTakeHomeToggle');
    const projectedBreakdown = document.getElementById('strategyProjectedBreakdown');
    const realizedBreakdown = document.getElementById('strategyRealizedBreakdown');
    const toggleLabel = toggleButton.querySelector('.toggle-label');
    
    const currentMode = toggleButton.dataset.mode;
    const newMode = currentMode === 'projected' ? 'realized' : 'projected';
    
    // Update button state
    toggleButton.dataset.mode = newMode;
    toggleLabel.textContent = newMode === 'projected' ? 'Projected' : 'Realized';
    
    // Toggle content visibility with smooth transition
    if (newMode === 'projected') {
        realizedBreakdown.classList.remove('active');
        setTimeout(() => {
            projectedBreakdown.classList.add('active');
        }, 150);
    } else {
        projectedBreakdown.classList.remove('active');
        setTimeout(() => {
            realizedBreakdown.classList.add('active');
        }, 150);
    }
    
    // Save user preference
    const prefs = JSON.parse(localStorage.getItem('cep_user_prefs') || '{}');
    prefs.netTakeHomeView = newMode;
    localStorage.setItem('cep_user_prefs', JSON.stringify(prefs));
}

// Initialize Net Take-Home view from user preferences (strategy page)
function initializeStrategyNetTakeHomeView() {
    const prefs = JSON.parse(localStorage.getItem('cep_user_prefs') || '{}');
    const preferredView = prefs.netTakeHomeView || 'projected';
    
    const toggleButton = document.getElementById('strategyNetTakeHomeToggle');
    if (toggleButton && preferredView !== 'projected') {
        // Only toggle if user prefers realized view (projected is default)
        toggleStrategyNetTakeHomeView();
    }
}
