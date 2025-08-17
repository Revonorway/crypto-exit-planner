// Supabase Configuration
// Replace these with your actual Supabase credentials from Settings > API

const SUPABASE_URL = 'https://dlqfvubwwatsrpcyrqil.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRscWZ2dWJ3d2F0c3JwY3lycWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0NTIyMDEsImV4cCI6MjA3MTAyODIwMX0.OSRB_VvZdMXeXJuXRpx8f_hXbAtqW6TQK-zeLDqWv1k'

// Initialize Supabase client
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Authentication state
let currentUser = null
let isAuthenticated = false

// Initialize auth listener
supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
        currentUser = session.user
        isAuthenticated = true
        console.log('User signed in:', currentUser.email)
        // Load user's portfolio data
        loadUserPortfolio()
    } else {
        currentUser = null
        isAuthenticated = false
        console.log('User signed out')
        // Fall back to localStorage
        loadLocalPortfolio()
    }
})

// Helper functions for gradual migration
async function loadUserPortfolio() {
    if (!isAuthenticated) {
        loadLocalPortfolio()
        return
    }
    
    try {
        const { data, error } = await supabase
            .from('user_portfolios')
            .select('*')
            .eq('user_id', currentUser.id)
        
        if (error) throw error
        
        if (data && data.length > 0) {
            // Convert Supabase data back to your current format
            portfolio = data.map(item => ({
                id: item.asset_id,
                name: item.asset_name,
                symbol: item.symbol,
                amount: parseFloat(item.amount),
                avgPrice: parseFloat(item.avg_price),
                exitStrategy: item.exit_strategy || [],
                icon: item.icon_url
            }))
            
            console.log('Loaded portfolio from Supabase:', portfolio.length, 'assets')
            updatePortfolioDisplay()
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
    portfolio = JSON.parse(localStorage.getItem('portfolio') || '[]')
    console.log('Loaded portfolio from localStorage:', portfolio.length, 'assets')
    updatePortfolioDisplay()
}

async function migrateLocalToSupabase() {
    if (!isAuthenticated || portfolio.length === 0) return
    
    try {
        console.log('Migrating', portfolio.length, 'assets to Supabase...')
        
        const portfolioData = portfolio.map(asset => ({
            user_id: currentUser.id,
            asset_id: asset.id,
            asset_name: asset.name,
            symbol: asset.symbol,
            amount: asset.amount,
            avg_price: asset.avgPrice,
            exit_strategy: asset.exitStrategy,
            icon_url: asset.icon
        }))
        
        const { error } = await supabase
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
    // Always save to localStorage as backup
    localStorage.setItem('portfolio', JSON.stringify(portfolio))
    
    // Also save to Supabase if authenticated
    if (isAuthenticated && currentUser) {
        try {
            // Delete existing data for this user
            await supabase
                .from('user_portfolios')
                .delete()
                .eq('user_id', currentUser.id)
            
            // Insert updated data
            if (portfolio.length > 0) {
                const portfolioData = portfolio.map(asset => ({
                    user_id: currentUser.id,
                    asset_id: asset.id,
                    asset_name: asset.name,
                    symbol: asset.symbol,
                    amount: asset.amount,
                    avg_price: asset.avgPrice,
                    exit_strategy: asset.exitStrategy,
                    icon_url: asset.icon
                }))
                
                const { error } = await supabase
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
