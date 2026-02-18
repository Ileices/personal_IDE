import { useState } from 'react'
import { OnboardingWizard } from './components/OnboardingWizard'
import './App.css'

/**
 * AIOS Emergence Game App
 * 
 * Routes:
 * - / - Main dashboard
 * - /onboarding - Onboarding wizard for new users
 */

function App() {
  const [showOnboarding, setShowOnboarding] = useState(
    window.location.pathname === '/onboarding'
  )

  if (showOnboarding) {
    return <OnboardingWizard />
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🌸 AIOS Emergence Game</h1>
        <nav>
          <a href="/onboarding">New User? Start Here</a>
        </nav>
      </header>
      
      <main className="app-main">
        <div className="welcome-message">
          <h2>Welcome to AIOS!</h2>
          <p>The autonomous intelligent organism system</p>
          
          <div className="quick-actions">
            <button onClick={() => setShowOnboarding(true)}>
              🚀 Start Onboarding
            </button>
            <button>
              📊 View Dashboard
            </button>
            <button>
              📚 Learning Center
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
