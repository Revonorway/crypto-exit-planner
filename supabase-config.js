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
        if (session) {
            window.currentUser = session.user
            window.isAuthenticated = true
            console.log('User signed in:', window.currentUser.email)
            // Load user's portfolio data
            loadUserPortfolio()
        } else {
            window.currentUser = null
            window.isAuthenticated = false
            console.log('User signed out')
            // Fall back to localStorage
            loadLocalPortfolio()
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
            
            // Update both global variable and localStorage
            window.portfolio = portfolioData;
            localStorage.setItem('portfolio', JSON.stringify(portfolioData));
            
            console.log('Loaded portfolio from Supabase:', portfolioData.length, 'assets')
            // updatePortfolioDisplay() will be called after main script loads
        } else {
            // No data in Supabase yet, migrate from localStorage
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
    console.log('Loaded portfolio from localStorage:', portfolioData.length, 'assets')
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
