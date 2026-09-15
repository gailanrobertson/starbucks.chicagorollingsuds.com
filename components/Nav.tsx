'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/upload', label: 'Upload' },
  { href: '/oneoff', label: 'One-Off' },
  { href: '/generate', label: 'Generate Docs' },
  { href: '/settings', label: 'Settings' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-[#111827] border-b border-[#1f2937]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-2">
            <span className="bg-white text-[#00A4C7] font-serif font-bold px-2 py-0.5 rounded text-sm">RS</span>
            <span className="text-[#00A4C7] font-semibold text-sm hidden sm:inline">Rolling Suds</span>
          </Link>
          <div className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  pathname === link.href
                    ? 'bg-[#00A4C7] text-white'
                    : 'text-gray-400 hover:text-white hover:bg-[#1f2937]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
