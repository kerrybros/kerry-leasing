import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))

// Mock Next.js image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />
  },
}))

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      id: 'test-user-id',
      firstName: 'Test',
      lastName: 'User',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    },
    isLoaded: true,
  }),
  useSignIn: () => ({
    signIn: {
      create: vi.fn(),
      prepareFirstFactor: vi.fn(),
      attemptFirstFactor: vi.fn(),
    },
    isLoaded: true,
    setActive: vi.fn(),
  }),
  useSignUp: () => ({
    signUp: {
      create: vi.fn(),
      prepareEmailAddressVerification: vi.fn(),
      attemptEmailAddressVerification: vi.fn(),
    },
    isLoaded: true,
    setActive: vi.fn(),
  }),
  UserButton: ({ afterSignOutUrl }: { afterSignOutUrl?: string }) => (
    <button data-testid="user-button">User Menu</button>
  ),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock Mapbox
vi.mock('react-map-gl', () => ({
  Map: ({ children, ...props }: any) => (
    <div data-testid="mapbox-map" {...props}>
      {children}
    </div>
  ),
  Marker: ({ children, ...props }: any) => (
    <div data-testid="mapbox-marker" {...props}>
      {children}
    </div>
  ),
  Popup: ({ children, ...props }: any) => (
    <div data-testid="mapbox-popup" {...props}>
      {children}
    </div>
  ),
  NavigationControl: (props: any) => <div data-testid="mapbox-navigation" {...props} />,
  ScaleControl: (props: any) => <div data-testid="mapbox-scale" {...props} />,
  GeolocateControl: (props: any) => <div data-testid="mapbox-geolocate" {...props} />,
}))

// Mock environment variables
process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN = 'test-mapbox-token'

// Mock fetch
global.fetch = vi.fn()

// Mock window methods
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Suppress console errors during tests
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})
