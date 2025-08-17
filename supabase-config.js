// Supabase Configuration
// Replace these with your actual Supabase credentials from Settings > API

const SUPABASE_URL = 'https://dlqfvubwwatsrpcyrqil.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscWZ2dWJ3d2F0c3JwY3lycWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NTIyMDEsImV4cCI6MjA3MTAyODIwMX0.OSRB_VvZdMXeXJuXRpx8f_hXbAtqW6TQK-zeLDqWv1k'

// Initialize Supabase client
const { createClient } = supabase
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Make it globally available
window.supabase = supabaseClient

// Authentication state (using globals from script.js)
// currentUser and isAuthenticated are declared in script.js

// Initialize auth listener (will be called after page loads)
function initializeAuthListener() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('Auth state change:', event, session ? 'has session' : 'no session');
        
        if (session) {
            window.currentUser = session.user
            window.isAuthenticated = true
            console.log('User signed in:', window.currentUser.email)
            // Only load user portfolio if we don't already have data, or if this is the initial auth
            const currentPortfolio = window.portfolio || JSON.parse(localStorage.getItem('portfolio') || '[]');
            if (currentPortfolio.length === 0 || event === 'INITIAL_SESSION') {
                console.log('Loading portfolio from Supabase for authenticated user... (event:', event, ')');
                loadUserPortfolio()
            } else {
                console.log('Portfolio already exists, skipping Supabase load (length:', currentPortfolio.length, ')');
                // Make sure we update auth state but don't reload data
                if (typeof updateUserInterface === 'function') {
                    updateUserInterface()
                }
            }
        } else {
            window.currentUser = null
            window.isAuthenticated = false
            console.log('User signed out')
            // Don't reload portfolio if we already have data
            const currentPortfolio = window.portfolio || JSON.parse(localStorage.getItem('portfolio') || '[]');
            if (currentPortfolio.length === 0) {
                loadLocalPortfolio()
            }
        }
        
        // Update UI if available
        if (typeof updateUserInterface === 'function') {
            updateUserInterface()
        }
        if (typeof updatePortfolioDisplay === 'function') {
            updatePortfolioDisplay()
        }
    })
}

// Helper functions for gradual migration
async function loadUserPortfolio() {
    if (!window.isAuthenticated) {
        loadLocalPortfolio()
        return
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('user_portfolios')
            .select('*')
            .eq('user_id', window.currentUser.id)
        
        if (error) throw error
        
        if (data && data.length > 0) {
            // Convert Supabase data back to your current format
            const portfolioData = data.map(item => ({
                id: item.asset_id,
                name: item.asset_name,
                symbol: item.symbol,
                amount: parseFloat(item.amount),
                avgPrice: parseFloat(item.avg_price),
                exitStrategy: item.exit_strategy || [],
                icon: item.icon_url
            }))
            
            // Safety check: don't overwrite if we already have more data locally OR if local data seems more recent
            const currentLocal = window.portfolio || JSON.parse(localStorage.getItem('portfolio') || '[]');
            
            // Check if local has more assets
            if (currentLocal.length > portfolioData.length) {
                console.log('⚠️ Local portfolio has more assets than Supabase. Keeping local data.');
                console.log('Local:', currentLocal.length, 'vs Supabase:', portfolioData.length);
                return;
            }
            
            // Check if local data seems more recent (compare specific assets)
            let localSeemsFresher = false;
            if (currentLocal.length === portfolioData.length) {
                for (let i = 0; i < currentLocal.length; i++) {
                    const localAsset = currentLocal[i];
                    const supabaseAsset = portfolioData.find(a => a.id === localAsset.id);
                    
                    if (supabaseAsset) {
                        // Compare critical fields - if local has different values, it might be fresher
                        const localAmount = parseFloat(localAsset.amount) || 0;
                        const supabaseAmount = parseFloat(supabaseAsset.amount) || 0;
                        
                        if (Math.abs(localAmount - supabaseAmount) > 0.001) {
                            console.log('⚠️ Local asset data differs from Supabase for', localAsset.symbol);
                            console.log('Local amount:', localAmount, 'vs Supabase amount:', supabaseAmount);
                            
                            // If local amount is significantly different, keep local data
                            localSeemsFresher = true;
                            break;
                        }
                    }
                }
            }
            
            if (localSeemsFresher) {
                console.log('⚠️ Local portfolio data appears more recent. Keeping local data and syncing to Supabase.');
                // Instead of loading from Supabase, push local data TO Supabase
                await migrateLocalToSupabase();
                return;
            }
            
            // Update both global variable and localStorage
            window.portfolio = portfolioData;
            if (typeof portfolio !== 'undefined') {
                portfolio.splice(0, portfolio.length, ...portfolioData);
            }
            localStorage.setItem('portfolio', JSON.stringify(portfolioData));
            
            console.log('✅ Loaded portfolio from Supabase:', portfolioData.length, 'assets')
            // updatePortfolioDisplay() will be called after main script loads
        } else {
            // No data in Supabase yet, migrate from localStorage
            console.log('📤 No Supabase data found, migrating from localStorage...');
            await migrateLocalToSupabase()
        }
    } catch (error) {
        console.error('Error loading user portfolio:', error)
        // Fall back to localStorage on error
        loadLocalPortfolio()
    }
}

function loadLocalPortfolio() {
    // Your existing localStorage logic
    const portfolioData = JSON.parse(localStorage.getItem('portfolio') || '[]');
    window.portfolio = portfolioData;
    if (typeof portfolio !== 'undefined') {
        portfolio.splice(0, portfolio.length, ...portfolioData);
    }
    console.log('✅ Loaded portfolio from localStorage:', portfolioData.length, 'assets')
    // updatePortfolioDisplay() will be called after main script loads
}

async function migrateLocalToSupabase() {
    const currentPortfolio = window.portfolio || JSON.parse(localStorage.getItem('portfolio') || '[]');
    if (!window.isAuthenticated || currentPortfolio.length === 0) return
    
    try {
        console.log('Migrating', currentPortfolio.length, 'assets to Supabase...')
        
        const portfolioData = currentPortfolio.map(asset => ({
            user_id: window.currentUser.id,
            asset_id: asset.id,
            asset_name: asset.name,
            symbol: asset.symbol,
            amount: asset.amount,
            avg_price: asset.avgPrice,
            exit_strategy: asset.exitStrategy,
            icon_url: asset.icon
        }))
        
        // Delete existing data first to avoid duplicates
        await supabaseClient
            .from('user_portfolios')
            .delete()
            .eq('user_id', window.currentUser.id)
            
        // Then insert the new data
        const { error } = await supabaseClient
            .from('user_portfolios')
            .insert(portfolioData)
        
        if (error) throw error
        
        console.log('✅ Migration successful!')
        
        // Optionally clear localStorage after successful migration
        // localStorage.removeItem('portfolio')
        
    } catch (error) {
        console.error('❌ Migration failed:', error)
    }
}

// Enhanced save function that works with both localStorage and Supabase
async function savePortfolio() {
    // Get portfolio from global variable or localStorage
    const currentPortfolio = window.portfolio || JSON.parse(localStorage.getItem('portfolio') || '[]');
    
    // Always save to localStorage as backup
    localStorage.setItem('portfolio', JSON.stringify(currentPortfolio))
    
    // Also save to Supabase if authenticated
    if (window.isAuthenticated && window.currentUser) {
        try {
            // Delete existing data for this user
            await supabaseClient
                .from('user_portfolios')
                .delete()
                .eq('user_id', window.currentUser.id)
            
            // Insert updated data
            if (currentPortfolio.length > 0) {
                const portfolioData = currentPortfolio.map(asset => ({
                    user_id: window.currentUser.id,
                    asset_id: asset.id,
                    asset_name: asset.name,
                    symbol: asset.symbol,
                    amount: asset.amount,
                    avg_price: asset.avgPrice,
                    exit_strategy: asset.exitStrategy,
                    icon_url: asset.icon
                }))
                
                const { error } = await supabaseClient
                    .from('user_portfolios')
                    .insert(portfolioData)
                
                if (error) throw error
            }
            
            console.log('✅ Portfolio synced to Supabase')
        } catch (error) {
            console.error('❌ Failed to sync to Supabase:', error)
        }
    }
}

// Make the enhanced save function available globally
window.savePortfolioToSupabase = savePortfolio;
