'use client'

import { useState, useEffect } from 'react'
import { useSignIn, useSignUp, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Image from 'next/image'

export default function HomePage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const { signIn, setActive } = useSignIn()
  const { signUp } = useSignUp()
  const { user, isLoaded } = useUser()
  const router = useRouter()

  // Redirect if already signed in
  useEffect(() => {
    if (isLoaded && user) {
      router.push('/portal')
    }
  }, [isLoaded, user, router])

  // Don't render login form if user is already signed in
  if (!isLoaded || user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email && (!isSignUp || (firstName && lastName))) {
      setShowPassword(true)
    } else if (isSignUp && (!firstName || !lastName)) {
      setError('Please enter your first and last name')
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signIn || !signUp) return
    
    setIsLoading(true)
    setError('')

    try {
      if (isSignUp) {
        // Handle sign up with first and last name
        const result = await signUp.create({
          emailAddress: email,
          password: password,
          firstName: firstName,
          lastName: lastName,
        })

        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId })
          router.push('/portal')
        } else if (result.status === 'missing_requirements') {
          // Handle email verification
          setError('Please check your email for verification instructions')
        } else {
          // Handle other verification requirements
          setError('Account created. Please complete verification to continue.')
        }
      } else {
        // Handle sign in
        const result = await signIn.create({
          identifier: email,
          password: password,
        })

        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId })
          router.push('/portal')
        } else {
          setError('Sign in requires additional verification')
        }
      }
    } catch (err: any) {
      console.error('Authentication error:', err)
      setError(err?.errors?.[0]?.message || `Invalid email or password`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSocialSignIn = async (provider: 'oauth_google' | 'oauth_microsoft') => {
    if (!signIn) return
    
    setIsLoading(true)
    setError('')

    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: '/portal',
        redirectUrlComplete: '/portal'
      })
    } catch (err: any) {
      console.error('Social sign in error:', err)
      setError(err?.errors?.[0]?.message || 'Social sign in failed')
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!signIn || !email) {
      setError('Please enter your email address first')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      await signIn.create({
        identifier: email,
        strategy: 'reset_password_email_code',
      })
      setError('') // Clear any existing errors
      setShowForgotPassword(true)
    } catch (err: any) {
      setError(err?.errors?.[0]?.message || 'Unable to send reset email')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setShowPassword(false)
    setPassword('')
    setFirstName('')
    setLastName('')
    setError('')
    setIsSignUp(false)
    setShowForgotPassword(false)
  }

  const toggleSignUp = () => {
    setIsSignUp(!isSignUp)
    setError('')
    setFirstName('')
    setLastName('')
    if (showPassword) {
      setPassword('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-gray-100 relative overflow-hidden">
      {/* Professional background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/20 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-400/20 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-blob animate-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-blue-300/20 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-blob animate-delay-4000"></div>
      </div>

      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-10">
        <div className="h-full w-full bg-slate-200" style={{
          backgroundImage: 'radial-gradient(circle, rgba(59,130,246,0.3) 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}></div>
      </div>

      <div className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-lg w-full space-y-12 animate-fade-in">
          {/* Logo and Header */}
          <div className="text-center">
            <div className="flex justify-center mb-10">
              <div className="relative group">
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-slate-500/20 rounded-xl blur opacity-40 group-hover:opacity-60 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative bg-white rounded-xl p-6 shadow-2xl transform transition-all duration-500 hover:scale-105 border border-blue-200">
                  <Image 
                    src="/Kerry Leasing with background.png" 
                    alt="Kerry Leasing Logo" 
                    width={400}
                    height={120}
                    className="h-32 w-auto animate-slide-down"
                    priority
                  />
                </div>
              </div>
            </div>
            <div className="animate-slide-up animate-delay-300">
              {/* Logo is the only focus now */}
            </div>
          </div>

          {/* Login Form */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-10 space-y-8 border border-blue-200/50 animate-slide-up animate-delay-600 hover:shadow-3xl transition-all duration-500">
            <div className="text-center">
              <h3 className="text-2xl font-semibold text-slate-800 mb-2">
                {isSignUp ? 'Create Fleet Account' : 'Fleet Portal Access'}
              </h3>
              <p className="text-slate-600 text-sm">
                {showForgotPassword 
                  ? 'Check your email for password reset instructions'
                  : !showPassword 
                    ? (isSignUp ? 'Enter your email to create an account' : 'Enter your email to continue')
                    : (isSignUp ? 'Create your password' : 'Enter your password to sign in')
                }
              </p>
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            {showForgotPassword ? (
              // Password Reset Confirmation
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-slate-600">
                  We&apos;ve sent password reset instructions to <strong>{email}</strong>
                </p>
                <Button 
                  onClick={resetForm}
                  variant="outline"
                  className="text-blue-600 border-blue-600 hover:bg-blue-50"
                >
                  Back to Sign In
                </Button>
              </div>
            ) : !showPassword ? (
              // Email Form
              <form onSubmit={handleEmailSubmit} className="space-y-5">
                {isSignUp && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 mb-2">
                        First Name
                      </label>
                      <input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-lg"
                        placeholder="First name"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 mb-2">
                        Last Name
                      </label>
                      <input
                        id="lastName"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-lg"
                        placeholder="Last name"
                        required
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-lg"
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <Button 
                  type="submit"
                  size="lg" 
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xl py-5 h-16 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-xl shadow-lg border-0"
                >
                  {isSignUp ? 'Create Account' : 'Continue'}
                </Button>
                
                {/* Social Login Options */}
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-slate-500 font-medium">or continue with</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSocialSignIn('oauth_google')}
                    disabled={isLoading}
                    className="flex items-center justify-center px-4 py-3 border border-slate-300 rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Google
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleSocialSignIn('oauth_microsoft')}
                    disabled={isLoading}
                    className="flex items-center justify-center px-4 py-3 border border-slate-300 rounded-xl text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path fill="#F25022" d="M1 1h10v10H1z"/>
                      <path fill="#00A4EF" d="M13 1h10v10H13z"/>
                      <path fill="#7FBA00" d="M1 13h10v10H1z"/>
                      <path fill="#FFB900" d="M13 13h10v10H13z"/>
                    </svg>
                    Microsoft
                  </Button>
                </div>
                
                {/* Sign Up / Sign In Toggle */}
                <div className="text-center pt-4 border-t border-slate-200">
                  <p className="text-slate-600 text-sm">
                    {isSignUp ? 'Already have an account?' : 'Need access to the fleet portal?'}
                  </p>
                  <button
                    type="button"
                    onClick={toggleSignUp}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm mt-1 transition-colors"
                  >
                    {isSignUp ? 'Sign In' : 'Create Account'}
                  </button>
                </div>
              </form>
            ) : (
              // Password Form
              <form onSubmit={handlePasswordSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email-display" className="block text-sm font-medium text-slate-700 mb-2">
                    {isSignUp ? 'Account Information' : 'Email Address'}
                  </label>
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-3 rounded-xl border border-slate-200">
                    <div className="flex-1">
                      {isSignUp ? (
                        <div>
                          <div className="text-slate-700 font-medium">{firstName} {lastName}</div>
                          <div className="text-slate-500 text-sm">{email}</div>
                        </div>
                      ) : (
                        <span className="text-slate-700">{email}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium ml-4"
                    >
                      Change
                    </button>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={isLoading}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-lg"
                    placeholder={isSignUp ? "Create a strong password" : "Enter your password"}
                    required
                    autoFocus
                  />
                </div>
                
                {/* CAPTCHA container for Clerk - required for sign up */}
                {isSignUp && (
                  <div id="clerk-captcha" className="flex justify-center"></div>
                )}
                
                <Button 
                  type="submit"
                  size="lg" 
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-xl py-5 h-16 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-xl shadow-lg border-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isLoading 
                    ? (isSignUp ? 'Creating Account...' : 'Signing In...') 
                    : (isSignUp ? 'Create Fleet Account' : 'Access Fleet Dashboard')
                  }
                </Button>
                
                {/* Back to Sign Up/In Toggle */}
                <div className="text-center pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={toggleSignUp}
                    className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                  >
                    {isSignUp ? 'Back to Sign In' : 'Need to create an account?'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
