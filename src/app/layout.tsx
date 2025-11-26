import React from 'react';
import './globals.css';

interface RootLayoutProps {
  children: React.ReactNode;
}

export const metadata = {
  title: 'Bini.js App',
  description: 'Modern React application built with Bini.js',
  keywords: [
    'Bini.js',
    'React framework', 
    'Vite',
    'TailwindCSS',
    'frontend framework',
    'modern web development'
  ],
  authors: [{ name: 'Binidu Ranasinghe', url: 'https://bini.js.org' }],
  metadataBase: new URL('https://bini.js.org'),
  openGraph: {
    title: 'Bini.js — The Next-Gen React Framework',
    description: 'Bini.js brings speed, protection, and simplicity to modern React development.',
    url: 'https://bini.js.org',
    siteName: 'Bini.js',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Bini.js — Modern React Framework',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bini.js — The Next-Gen React Framework', 
    description: 'Blazing-fast React apps powered by Vite and TailwindCSS.',
    creator: '@binidu01',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
    ],
    shortcut: [
      { url: '/favicon.png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        {/* Additional head tags can be added here */}
      </head>
      <body>
        <div id="root">
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}