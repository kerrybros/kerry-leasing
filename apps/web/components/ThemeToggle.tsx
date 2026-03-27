'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);
  const { user, isLoaded } = useUser();

  useEffect(() => {
    setMounted(true);

    // Priority: Clerk metadata → localStorage → OS preference → dark default
    const clerkTheme = isLoaded && user?.unsafeMetadata?.theme as string | undefined;
    const localTheme = localStorage.getItem('theme') as 'dark' | 'light' | null;
    const osPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const resolved: 'dark' | 'light' =
      (clerkTheme === 'dark' || clerkTheme === 'light' ? clerkTheme : null) ??
      localTheme ??
      (osPrefersDark ? 'dark' : 'light');

    applyTheme(resolved);
    setTheme(resolved);
  // Only run on mount — Clerk user data may not be ready yet on first render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTheme = (t: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    localStorage.setItem('theme', t);
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);

    if (user) {
      try {
        await user.update({ unsafeMetadata: { ...user.unsafeMetadata, theme: newTheme } });
      } catch {
        // Non-critical — preference is already saved in localStorage
      }
    }
  };

  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="text-muted-foreground hover:text-foreground"
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  );
}
