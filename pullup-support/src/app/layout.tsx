import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import './globals.css';

export const metadata: Metadata = {
  title: 'PullUp - Smart Campus Carpooling & Ride Sharing',
  description: 'Official support, privacy policy, and information site for the PullUp mobile application. Discover and share carpool and taxi-pool rides safely.',
  keywords: ['PullUp', 'carpool', 'taxi pool', 'campus mobility', 'ride sharing', 'university rides'],
  authors: [{ name: 'PullUp Mobility' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-[#FDFBF7] text-[#1A1513] antialiased">
        {/* Navigation Header */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#EADDD0]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-[#D4500A] flex items-center justify-center text-white font-extrabold text-xl shadow-sm overflow-hidden group-hover:scale-105 transition-transform">
                <Image src="/logo.png" alt="PullUp Logo" width={40} height={40} className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-xl tracking-tight text-[#1A1513] group-hover:text-[#D4500A] transition-colors">
                  PullUp
                </span>
                <span className="text-[10px] font-semibold text-[#665A55] tracking-widest uppercase -mt-1">
                  Campus Mobility
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#665A55]">
              <Link href="/" className="hover:text-[#D4500A] transition-colors">
                Home
              </Link>
              <Link href="/support" className="hover:text-[#D4500A] transition-colors">
                Support
              </Link>
              <Link href="/privacy" className="hover:text-[#D4500A] transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-[#D4500A] transition-colors">
                Terms of Service
              </Link>
              <Link href="/contact" className="hover:text-[#D4500A] transition-colors">
                Contact
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href="/support"
                className="hidden sm:inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#D4500A] text-white text-sm font-semibold hover:bg-[#B84206] transition-all shadow-sm hover:shadow"
              >
                Get Support
              </Link>
            </div>
          </div>

          {/* Mobile Navigation sub-bar */}
          <div className="md:hidden border-t border-[#EADDD0] bg-[#FDFBF7] px-4 py-2 flex items-center justify-between text-xs font-medium text-[#665A55] overflow-x-auto">
            <Link href="/" className="px-2 py-1 hover:text-[#D4500A]">Home</Link>
            <Link href="/support" className="px-2 py-1 hover:text-[#D4500A]">Support</Link>
            <Link href="/privacy" className="px-2 py-1 hover:text-[#D4500A]">Privacy</Link>
            <Link href="/terms" className="px-2 py-1 hover:text-[#D4500A]">Terms</Link>
            <Link href="/contact" className="px-2 py-1 hover:text-[#D4500A]">Contact</Link>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-grow">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-[#EADDD0] mt-16 text-[#665A55] text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#D4500A] flex items-center justify-center text-white font-bold text-sm overflow-hidden">
                    <Image src="/logo.png" alt="PullUp Logo" width={28} height={28} className="w-full h-full object-cover" />
                  </div>
                  <span className="font-bold text-lg text-[#1A1513]">PullUp</span>
                </div>
                <p className="text-xs text-[#665A55] leading-relaxed max-w-md">
                  PullUp is a campus mobility platform designed to help university students and staff coordinate carpools and taxi-pools cleanly, safely, and affordably.
                </p>
                <p className="text-xs text-[#665A55]">
                  Official Support Contact: <a href="mailto:krish@pullupapp.in" className="text-[#D4500A] font-semibold hover:underline">krish@pullupapp.in</a>
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-[#1A1513] mb-3 text-xs uppercase tracking-wider">Quick Links</h4>
                <ul className="space-y-2 text-xs">
                  <li><Link href="/" className="hover:text-[#D4500A] transition-colors">About PullUp</Link></li>
                  <li><Link href="/support" className="hover:text-[#D4500A] transition-colors">Support & Help Center</Link></li>
                  <li><Link href="/privacy" className="hover:text-[#D4500A] transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="hover:text-[#D4500A] transition-colors">Terms of Service</Link></li>
                  <li><Link href="/contact" className="hover:text-[#D4500A] transition-colors">Contact Us</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-[#1A1513] mb-3 text-xs uppercase tracking-wider">App Store Compliance</h4>
                <p className="text-xs text-[#665A55] leading-relaxed mb-3">
                  This official support website is maintained for Apple App Store listing and user support fulfillment.
                </p>
                <div className="text-[11px] text-[#665A55] bg-[#FDFBF7] p-3 rounded-lg border border-[#EADDD0]">
                  Support Response Time: Within 24-48 business hours.
                </div>
              </div>
            </div>

            <div className="border-t border-[#EADDD0] mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-[#665A55] gap-4">
              <p>© {new Date().getFullYear()} PullUp Mobility. All rights reserved.</p>
              <div className="flex gap-4">
                <Link href="/privacy" className="hover:underline">Privacy</Link>
                <Link href="/terms" className="hover:underline">Terms</Link>
                <Link href="/support" className="hover:underline">Support</Link>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
