/**
 * Onboarding Wizard - Kid-Friendly AIOS Introduction
 * ===================================================
 * 
 * Multi-step wizard to onboard new contributors to AIOS network.
 * Designed for accessibility: simple language, visual feedback, tooltips.
 * 
 * Steps:
 * 1. Welcome - What is AIOS?
 * 2. Resource Donation - How much compute to share?
 * 3. Earnings Estimator - What can you earn?
 * 4. Privacy & Safety - How we protect you
 * 5. Start Contributing - Begin your journey
 */

import React, { useState } from 'react';
import './OnboardingWizard.css';

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
}

interface EarningsEstimate {
  respectPerDay: number;
  creditsPerDay: number;
  monthlyValue: number;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: 'Welcome to AIOS',
    description: 'A living network of computers working together'
  },
  {
    id: 2,
    title: 'Share Your Power',
    description: 'Choose how much of your computer to share'
  },
  {
    id: 3,
    title: 'Earn Rewards',
    description: 'Get RESPECT points and credits for helping'
  },
  {
    id: 4,
    title: 'Stay Safe',
    description: 'Your privacy and security come first'
  },
  {
    id: 5,
    title: 'Start Contributing',
    description: 'Join the network and make a difference'
  }
];

export const OnboardingWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [resourceDonation, setResourceDonation] = useState(10); // 10% default
  const [earningsEstimate, setEarningsEstimate] = useState<EarningsEstimate>({
    respectPerDay: 0,
    creditsPerDay: 0,
    monthlyValue: 0
  });

  // Calculate earnings based on resource donation
  const calculateEarnings = (donation: number): EarningsEstimate => {
    // Simplified earnings model
    // Real calculation would use tier, hardware grade, etc.
    const baseRespect = 5.0;
    const baseCredits = 50.0;
    
    const respectPerDay = (donation / 10) * baseRespect;
    const creditsPerDay = (donation / 10) * baseCredits;
    const monthlyValue = creditsPerDay * 30 * 0.01; // $0.01 per credit
    
    return {
      respectPerDay,
      creditsPerDay,
      monthlyValue
    };
  };

  const handleResourceChange = (value: number) => {
    setResourceDonation(value);
    setEarningsEstimate(calculateEarnings(value));
  };

  const nextStep = () => {
    if (currentStep < ONBOARDING_STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const startContributing = async () => {
    try {
      // Register with AIOS network
      const response = await fetch('http://localhost:5001/api/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_donation_percent: resourceDonation,
          accept_privacy_policy: true
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`✅ Welcome to AIOS! Your node ID: ${result.node_id}`);
        // Redirect to dashboard
        window.location.href = '/';
      } else {
        alert('❌ Registration failed. Please try again.');
      }
    } catch (error) {
      console.error('Onboarding error:', error);
      alert('❌ Connection error. Is the AIOS backend running?');
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="onboarding-step">
            <div className="step-icon">🌸</div>
            <h2>What is AIOS?</h2>
            <p className="step-description">
              AIOS is like a friendly neighborhood of computers that help each other out. 
              When you join, your computer shares a little bit of its power to help train 
              AI models, run calculations, and solve problems.
            </p>
            
            <div className="info-cards">
              <div className="info-card">
                <div className="card-icon">🤝</div>
                <h3>Share</h3>
                <p>Lend your spare computing power</p>
              </div>
              <div className="info-card">
                <div className="card-icon">🎁</div>
                <h3>Earn</h3>
                <p>Get RESPECT points and credits</p>
              </div>
              <div className="info-card">
                <div className="card-icon">🌍</div>
                <h3>Impact</h3>
                <p>Help power the future of AI</p>
              </div>
            </div>
            
            <div className="tooltip-box">
              💡 <strong>Fun fact:</strong> AIOS uses RBY (Red-Blue-Yellow) colors to 
              match tasks to computers, like matching puzzle pieces!
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className="onboarding-step">
            <div className="step-icon">⚡</div>
            <h2>How much power do you want to share?</h2>
            <p className="step-description">
              Don't worry! You can change this anytime. Start small and increase later.
            </p>
            
            <div className="resource-slider-container">
              <div className="slider-header">
                <span>I want to donate:</span>
                <span className="donation-value">{resourceDonation}%</span>
              </div>
              
              <input 
                type="range" 
                min="10" 
                max="100" 
                step="10"
                value={resourceDonation}
                onChange={(e) => handleResourceChange(parseInt(e.target.value))}
                className="resource-slider"
              />
              
              <div className="slider-labels">
                <span>10%<br/>(Safe Start)</span>
                <span>50%<br/>(Balanced)</span>
                <span>100%<br/>(Full Power!)</span>
              </div>
            </div>
            
            <div className="donation-guide">
              {resourceDonation <= 20 && (
                <div className="guide-box low">
                  <strong>🐢 Beginner Mode</strong>
                  <p>Your computer will barely notice. Perfect for starting out!</p>
                </div>
              )}
              {resourceDonation > 20 && resourceDonation <= 60 && (
                <div className="guide-box medium">
                  <strong>🚀 Balanced Mode</strong>
                  <p>Good for most users. You can still play games and browse.</p>
                </div>
              )}
              {resourceDonation > 60 && (
                <div className="guide-box high">
                  <strong>⚡ Power Mode</strong>
                  <p>Maximum contribution! Best when you're away from your computer.</p>
                </div>
              )}
            </div>
            
            <div className="tooltip-box">
              🛡️ <strong>Safety:</strong> AIOS will never use more than what you allow. 
              You can pause or stop anytime.
            </div>
          </div>
        );
      
      case 3:
        return (
          <div className="onboarding-step">
            <div className="step-icon">💰</div>
            <h2>What can you earn?</h2>
            <p className="step-description">
              Based on your {resourceDonation}% donation, here's what you could earn:
            </p>
            
            <div className="earnings-cards">
              <div className="earnings-card">
                <div className="earnings-icon">⭐</div>
                <div className="earnings-value">{earningsEstimate.respectPerDay.toFixed(1)}</div>
                <div className="earnings-label">RESPECT / day</div>
                <div className="earnings-info">
                  Build your reputation in the network
                </div>
              </div>
              
              <div className="earnings-card">
                <div className="earnings-icon">🪙</div>
                <div className="earnings-value">{earningsEstimate.creditsPerDay.toFixed(0)}</div>
                <div className="earnings-label">Credits / day</div>
                <div className="earnings-info">
                  Spend on AI tasks or cash out
                </div>
              </div>
              
              <div className="earnings-card">
                <div className="earnings-icon">💵</div>
                <div className="earnings-value">${earningsEstimate.monthlyValue.toFixed(2)}</div>
                <div className="earnings-label">Monthly Value</div>
                <div className="earnings-info">
                  Estimated cash value
                </div>
              </div>
            </div>
            
            <div className="boost-section">
              <h3>🚀 Boost Your Earnings</h3>
              <ul className="boost-list">
                <li>✅ Keep your computer online 24/7</li>
                <li>✅ Complete tasks reliably (builds RESPECT)</li>
                <li>✅ Balance your RBY colors (bonus multiplier!)</li>
                <li>✅ Upgrade your hardware (higher tier = better tasks)</li>
              </ul>
            </div>
            
            <div className="tooltip-box">
              📊 <strong>Note:</strong> Actual earnings vary based on network demand, 
              your hardware, and task availability.
            </div>
          </div>
        );
      
      case 4:
        return (
          <div className="onboarding-step">
            <div className="step-icon">🔒</div>
            <h2>Your Privacy & Security</h2>
            <p className="step-description">
              We take your safety seriously. Here's how AIOS protects you:
            </p>
            
            <div className="safety-features">
              <div className="safety-feature">
                <div className="feature-icon">🔐</div>
                <h3>Encrypted Everything</h3>
                <p>All data sent between computers is encrypted. Nobody can spy on your work.</p>
              </div>
              
              <div className="safety-feature">
                <div className="feature-icon">🕵️</div>
                <h3>No Personal Data</h3>
                <p>AIOS never accesses your files, photos, or passwords. It only uses spare CPU/GPU.</p>
              </div>
              
              <div className="safety-feature">
                <div className="feature-icon">🛡️</div>
                <h3>RESPECT Score</h3>
                <p>Bad actors get kicked out. Our trust system keeps the network safe.</p>
              </div>
              
              <div className="safety-feature">
                <div className="feature-icon">🚨</div>
                <h3>Emergency Stop</h3>
                <p>Click the red button in the dashboard to instantly pause all activity.</p>
              </div>
            </div>
            
            <div className="privacy-checklist">
              <h3>What We Do:</h3>
              <ul>
                <li>✅ Train AI models in small chunks</li>
                <li>✅ Run calculations for research</li>
                <li>✅ Help other users' legitimate tasks</li>
              </ul>
              
              <h3>What We DON'T Do:</h3>
              <ul>
                <li>❌ Access your personal files</li>
                <li>❌ Mine cryptocurrency without your consent</li>
                <li>❌ Send spam or viruses</li>
                <li>❌ Share your info with advertisers</li>
              </ul>
            </div>
            
            <div className="tooltip-box">
              📜 <strong>Privacy Policy:</strong> Read our full privacy policy at 
              <a href="/privacy" target="_blank"> aios.org/privacy</a>
            </div>
          </div>
        );
      
      case 5:
        return (
          <div className="onboarding-step">
            <div className="step-icon">🎉</div>
            <h2>You're ready to start!</h2>
            <p className="step-description">
              You've completed the onboarding wizard. Let's get you connected to the AIOS network!
            </p>
            
            <div className="summary-box">
              <h3>Your Setup:</h3>
              <div className="summary-item">
                <span>Resource Donation:</span>
                <strong>{resourceDonation}%</strong>
              </div>
              <div className="summary-item">
                <span>Estimated Daily RESPECT:</span>
                <strong>{earningsEstimate.respectPerDay.toFixed(1)}</strong>
              </div>
              <div className="summary-item">
                <span>Estimated Daily Credits:</span>
                <strong>{earningsEstimate.creditsPerDay.toFixed(0)}</strong>
              </div>
            </div>
            
            <div className="next-steps">
              <h3>What happens next?</h3>
              <ol>
                <li>🔗 We'll connect you to the AIOS network</li>
                <li>📊 Your computer will register with the orchestrator</li>
                <li>🎯 You'll start receiving tasks based on your RBY profile</li>
                <li>⭐ You'll earn RESPECT and credits automatically</li>
                <li>📈 Track everything in your dashboard</li>
              </ol>
            </div>
            
            <button 
              className="start-button"
              onClick={startContributing}
            >
              🚀 Start Contributing Now!
            </button>
            
            <div className="tooltip-box">
              💡 <strong>Tip:</strong> Visit the Learning Center to understand RBY colors, 
              the Primordial Learner, and how organism intelligence works!
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-header">
        <div className="logo">🌸 AIOS</div>
        <div className="progress-bar">
          {ONBOARDING_STEPS.map((step) => (
            <div 
              key={step.id}
              className={`progress-step ${currentStep >= step.id ? 'active' : ''} ${currentStep === step.id ? 'current' : ''}`}
            >
              <div className="step-number">{step.id}</div>
              <div className="step-title">{step.title}</div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="onboarding-content">
        {renderStepContent()}
      </div>
      
      <div className="onboarding-footer">
        {currentStep > 1 && (
          <button className="nav-button prev" onClick={prevStep}>
            ← Previous
          </button>
        )}
        
        <div className="step-indicator">
          Step {currentStep} of {ONBOARDING_STEPS.length}
        </div>
        
        {currentStep < ONBOARDING_STEPS.length && (
          <button className="nav-button next" onClick={nextStep}>
            Next →
          </button>
        )}
      </div>
    </div>
  );
};
