import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { ConnectButton } from '../ui/ConnectButton';
import { AccountModal } from '../ui/AccountModal';

interface LayoutProps {
  children: ReactNode;
  className?: string;
}

export function Layout({ children, className }: LayoutProps) {
  return (
    <div className={cn('min-h-screen bg-bg', className)}>
      
      {/* --- Sticky Glass Header --- */}
      <header className="sticky top-0 z-40 w-full bg-bg/80 backdrop-blur-xl">
        <div className="relative max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          
          {/* Gradient bottom border - only spans the content width */}
          <div className="absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-border-hover to-transparent" />

          {/* Structured Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <span className="text-[15px] font-semibold tracking-tight text-white">
              Midnight <span className="text-text-muted">App</span>
            </span>
          </Link>

          {/* Connect Button */}
          <ConnectButton />
          
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        {children}
      </main>
      
      {/* --- Global Modals --- */}
      <AccountModal />
    </div>
  );
}