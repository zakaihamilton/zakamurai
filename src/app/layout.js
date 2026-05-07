import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata = {
  title: 'Zakamurai',
  description: 'Your personal AI developer assistant.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script type="importmap">
          {`
            {
              "imports": {
                "pako": "https://esm.sh/pako@2.1.0",
                "just-bash": "https://esm.sh/just-bash@2.7.0",
                "resolve.exports": "https://esm.sh/resolve.exports@2.0.3",
                "comlink": "https://esm.sh/comlink@4.4.2"
              }
            }
          `}
        </script>
      </head>
      <body>{children}</body>
    </html>
  );
}
