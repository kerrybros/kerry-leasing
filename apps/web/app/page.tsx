import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const { userId } = auth();

  // If signed in, redirect to app
  if (userId) {
    redirect('/app');
  }

  // Otherwise redirect to sign in
  redirect('/sign-in');
}
