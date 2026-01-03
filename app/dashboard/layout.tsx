'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4'></div>
          <p className='text-gray-800'>Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }


  const isActive = (path: string) => pathname === path;

  return (
    <div className='min-h-screen bg-gray-50 flex'>
      {/* Sidebar */}
      <aside className='w-64 bg-white border-r border-gray-300 min-h-screen left-0'>
        <nav className='p-4'>
          <div className='space-y-1'>
            <Link
              href='/dashboard'
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/dashboard')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-800 hover:bg-gray-100'
              }`}
            >
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'
                />
              </svg>
              <span className='font-medium'>Video Constructor</span>
            </Link>

            {session.user?.isAdmin && (
              <>
                <Link
                  href='/dashboard/jokes'
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive('/dashboard/jokes')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  <svg
                    className='w-5 h-5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                    />
                  </svg>
                  <span className='font-medium'>🇪🇸 Jokes Library (ES)</span>
                </Link>
                {session.user?.email === 'evgenii.stepanishin@gmail.com' && (
                  <Link
                    href='/dashboard/jokes-de'
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/dashboard/jokes-de')
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <svg
                      className='w-5 h-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                      />
                    </svg>
                    <span className='font-medium'>
                      🇩🇪 Witze Bibliothek (DE)
                    </span>
                  </Link>
                )}

                <Link
                  href='/dashboard/jokes-pt'
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive('/dashboard/jokes-pt')
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-800 hover:bg-gray-100'
                  }`}
                >
                  <svg
                    className='w-5 h-5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                    />
                  </svg>
                  <span className='font-medium'>🇵🇹 Piadas (PT)</span>
                </Link>

                {session.user?.email === 'evgenii.stepanishin@gmail.com' && (
                  <Link
                    href='/dashboard/jokes-fr'
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive('/dashboard/jokes-fr')
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-800 hover:bg-gray-100'
                    }`}
                  >
                    <svg
                      className='w-5 h-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                      />
                    </svg>
                    <span className='font-medium'>🇫🇷 Blagues (FR)</span>
                  </Link>
                )}
              </>
            )}

            <Link
              href='/dashboard/history'
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/dashboard/history')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-800 hover:bg-gray-100'
              }`}
            >
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
              <span className='font-medium'>History</span>
            </Link>

            <Link
              href='/dashboard/scheduled'
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/dashboard/scheduled')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-800 hover:bg-gray-100'
              }`}
            >
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
                />
              </svg>
              <span className='font-medium'>Scheduled Videos</span>
            </Link>

            <Link
              href='/dashboard/auto-generation'
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/dashboard/auto-generation')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-800 hover:bg-gray-100'
              }`}
            >
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
                />
              </svg>
              <span className='font-medium'>🇪🇸 Auto Generation (ES)</span>
            </Link>

            {session.user?.email === 'evgenii.stepanishin@gmail.com' && (
              <Link
                href='/dashboard/auto-generation-de'
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive('/dashboard/auto-generation-de')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-800 hover:bg-gray-100'
                }`}
              >
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
                  />
                </svg>
                <span className='font-medium'>🇩🇪 Auto Generation (DE)</span>
              </Link>
            )}

            <Link
              href='/dashboard/auto-generation-pt'
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/dashboard/auto-generation-pt')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-800 hover:bg-gray-100'
              }`}
            >
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
                />
              </svg>
              <span className='font-medium'>🇵🇹 Auto Generation (PT)</span>
            </Link>

            {session.user?.email === 'evgenii.stepanishin@gmail.com' && (
              <Link
                href='/dashboard/auto-generation-fr'
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive('/dashboard/auto-generation-fr')
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-800 hover:bg-gray-100'
                }`}
              >
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z'
                  />
                </svg>
                <span className='font-medium'>🇫🇷 Auto Generation (FR)</span>
              </Link>
            )}

            <Link
              href='/dashboard/settings'
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive('/dashboard/settings')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-800 hover:bg-gray-100'
              }`}
            >
              <svg
                className='w-5 h-5'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z'
                />
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 12a3 3 0 11-6 0 3 3 0 016 0z'
                />
              </svg>
              <span className='font-medium'>Settings</span>
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className='flex-1 pt-0'>{children}</main>
    </div>
  );
}
