import type { Metadata, Viewport } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
import { AnalyticsClient } from '@/components/AnalyticsClient';

const SITE = 'https://nychousingmap.com';
const SHARE_DESCRIPTION = 'Where New York is building homes: units permitted, completed and underway in every neighborhood since 2010, with estimates through 2029.';
const SHARE_IMAGE = { url: '/og.jpg', width: 1200, height: 630, alt: 'Lower Manhattan skyline at dusk with the title NYC Housing Map' };

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'NYC Housing Map · New residential construction by neighborhood',
  description:
    "Interactive map of new housing in New York City: units and buildings permitted, completed and under construction in every neighborhood since 2010, with estimated completions through 2029. Built from NYC Planning's Housing Database and DOB NOW.",
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'NYC Housing Map',
    url: '/',
    title: 'NYC Housing Map',
    description: SHARE_DESCRIPTION,
    images: [SHARE_IMAGE],
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title: 'NYC Housing Map', description: SHARE_DESCRIPTION, images: [SHARE_IMAGE] },
};

export const viewport: Viewport = { themeColor: '#1a1a19' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AnalyticsClient />
      </body>
    </html>
  );
}
