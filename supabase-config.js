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
        
        if (session && session.user) {
            // User is authenticated
            window.currentUser = session.user
            window.isAuthenticated = true
            console.log('User signed in:', window.currentUser.email)
            
            // Supabase session handles authentication state
            
            // Always load from Supabase for authenticated users
            console.log('Loading portfolio from Supabase for authenticated user... (event:', event, ')');
            loadUserPortfolio()
        } else {
            // No session - user signed out
            window.currentUser = null
            window.isAuthenticated = false
            console.log('User signed out or session invalid')
            
            // Clear portfolio data
            window.portfolio = [];
            if (typeof portfolio !== 'undefined') {
                portfolio.splice(0, portfolio.length);
            }
            localStorage.removeItem('portfolio');
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

// Helper functions for Supabase portfolio management
async function loadUserPortfolio() {
    if (!window.isAuthenticated) {
        console.log('User not authenticated, cannot load portfolio from Supabase');
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
                wallets: item.wallets || [],
                sales: item.sales || [],
                purchases: item.purchases || [],
                icon: item.icon_url
            }))
            
            // Update portfolio in memory
            window.portfolio = portfolioData;
            if (typeof portfolio !== 'undefined') {
                portfolio.splice(0, portfolio.length, ...portfolioData);
            }
            
            console.log('✅ Loaded portfolio from Supabase:', portfolioData.length, 'assets')
        } else {
            // No data in Supabase yet, initialize empty portfolio
            console.log('📂 No portfolio data found in Supabase, starting with empty portfolio');
            window.portfolio = [];
            if (typeof portfolio !== 'undefined') {
                portfolio.splice(0, portfolio.length);
            }
        }
    } catch (error) {
        console.error('Error loading user portfolio:', error)
        // Initialize empty portfolio on error
        window.portfolio = [];
        if (typeof portfolio !== 'undefined') {
            portfolio.splice(0, portfolio.length);
        }
    }
}

// Save portfolio function - Supabase only
async function savePortfolio() {
    // Get portfolio from global variable
    const currentPortfolio = window.portfolio || [];
    
    // Only save to Supabase if authenticated
    if (!window.isAuthenticated || !window.currentUser) {
        console.log('User not authenticated, cannot save portfolio to Supabase');
        return;
    }
    
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
                wallets: asset.wallets,
                sales: asset.sales,
                purchases: asset.purchases,
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
        throw error; // Re-throw to let calling code handle the error
    }
}

// Make the enhanced save function available globally
window.savePortfolioToSupabase = savePortfolio;
