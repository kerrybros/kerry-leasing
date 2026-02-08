'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AppRootPage() {
  const { isLoaded, userId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && userId) {
      // Default to fleet view for all users
      router.replace('/app/fleet');
    }
  }, [isLoaded, userId, router]);

  return (
    <div className="container">
      <div className="loading">Redirecting...</div>
    </div>
  );
}
