// Authentication logic for Crypto Exit Planner
// This handles sign in, sign up, and offline mode

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth()
})

function initializeAuth() {
    // Check if user is already signed in AND has valid session
    window.supabase.auth.getSession().then(({ data: { session } }) => {
        console.log('Auth check - session:', session ? 'exists' : 'none');
        
        // Only redirect if we have a valid, current session
        if (session && session.user && (!session.expires_at || new Date(session.expires_at * 1000) > new Date())) {
            console.log('Valid session found, redirecting to main app');
            window.location.href = 'index.html'
        } else {
            console.log('No valid session, staying on auth page');
            // Clear any stale localStorage data that might be confusing the app
            localStorage.removeItem('cep_current_user');
            localStorage.removeItem('cep_offline_mode');
        }
    }).catch(error => {
        console.error('Auth session check failed:', error);
        // Clear any stale data on error
        localStorage.removeItem('cep_current_user');
        localStorage.removeItem('cep_offline_mode');
    })

    // Set up form event listeners
    setupAuthEventListeners()
}

function setupAuthEventListeners() {
    // Form toggles
    document.getElementById('showSignUp').addEventListener('click', (e) => {
        e.preventDefault()
        showSignUpForm()
    })

    document.getElementById('showSignIn').addEventListener('click', (e) => {
        e.preventDefault()
        showSignInForm()
    })

    // Continue offline
    document.getElementById('continueOffline').addEventListener('click', (e) => {
        e.preventDefault()
        continueOffline()
    })

    // Sign in form
    document.getElementById('signInFormElement').addEventListener('submit', async (e) => {
        e.preventDefault()
        await handleSignIn()
    })

    // Sign up form
    document.getElementById('signUpFormElement').addEventListener('submit', async (e) => {
        e.preventDefault()
        await handleSignUp()
    })

    // Google sign in/up
    document.getElementById('googleSignInBtn').addEventListener('click', async (e) => {
        e.preventDefault()
        await handleGoogleAuth()
    })

    document.getElementById('googleSignUpBtn').addEventListener('click', async (e) => {
        e.preventDefault()
        await handleGoogleAuth()
    })
}

function showSignUpForm() {
    document.getElementById('signInForm').style.display = 'none'
    document.getElementById('signUpForm').style.display = 'block'
    hideError()
}

function showSignInForm() {
    document.getElementById('signUpForm').style.display = 'none'
    document.getElementById('signInForm').style.display = 'block'
    hideError()
}

function showLoading(show = true) {
    const forms = ['signInForm', 'signUpForm']
    const loading = document.getElementById('authLoading')
    
    if (show) {
        forms.forEach(formId => {
            document.getElementById(formId).style.display = 'none'
        })
        loading.style.display = 'block'
    } else {
        loading.style.display = 'none'
        // Show the appropriate form
        const signUpVisible = document.getElementById('signUpForm').style.display === 'block'
        if (signUpVisible) {
            showSignUpForm()
        } else {
            showSignInForm()
        }
    }
}

function showError(message) {
    const errorDiv = document.getElementById('authError')
    errorDiv.textContent = message
    errorDiv.style.display = 'block'
}

function hideError() {
    document.getElementById('authError').style.display = 'none'
}

async function handleSignIn() {
    const email = document.getElementById('signInEmail').value
    const password = document.getElementById('signInPassword').value

    if (!email || !password) {
        showError('Please fill in all fields')
        return
    }

    showLoading(true)
    hideError()

    try {
        const { data, error } = await window.supabase.auth.signInWithPassword({
            email: email,
            password: password,
        })

        if (error) throw error

        // Success! Redirect to main app
        window.location.href = 'index.html'

    } catch (error) {
        showLoading(false)
        showError(getAuthErrorMessage(error))
    }
}

async function handleSignUp() {
    const email = document.getElementById('signUpEmail').value
    const password = document.getElementById('signUpPassword').value
    const confirmPassword = document.getElementById('signUpPasswordConfirm').value

    if (!email || !password || !confirmPassword) {
        showError('Please fill in all fields')
        return
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match')
        return
    }

    if (password.length < 6) {
        showError('Password must be at least 6 characters')
        return
    }

    showLoading(true)
    hideError()

    try {
        const { data, error } = await window.supabase.auth.signUp({
            email: email,
            password: password,
        })

        if (error) throw error

        if (data.user && !data.session) {
            // Email confirmation required
            showLoading(false)
            showError('Please check your email and click the confirmation link to complete registration.')
        } else {
            // Success! Redirect to main app
            window.location.href = 'index.html'
        }

    } catch (error) {
        showLoading(false)
        showError(getAuthErrorMessage(error))
    }
}

async function handleGoogleAuth() {
    showLoading(true)
    hideError()

    try {
        const { data, error } = await window.supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/index.html'
            }
        })

        if (error) throw error

    } catch (error) {
        showLoading(false)
        showError('Google sign-in failed. Please try again.')
    }
}

function continueOffline() {
    // Set a flag to indicate offline mode
    localStorage.setItem('cep_offline_mode', 'true')
    
    // Redirect to main app
    window.location.href = 'index.html'
}

function getAuthErrorMessage(error) {
    switch (error.message) {
        case 'Invalid login credentials':
            return 'Invalid email or password. Please check your credentials and try again.'
        case 'Email not confirmed':
            return 'Please check your email and click the confirmation link before signing in.'
        case 'User already registered':
            return 'An account with this email already exists. Try signing in instead.'
        case 'Password should be at least 6 characters':
            return 'Password must be at least 6 characters long.'
        default:
            return error.message || 'An error occurred. Please try again.'
    }
}

// Handle auth state changes (redirect from email confirmation, etc.)
window.supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        // User signed in successfully
        window.location.href = 'index.html'
    }
})
