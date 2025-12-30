'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Compatibility redirect: /create/drop-it -> /create
 * The unified create flow now handles all input types including Drop IT functionality.
 */
export default function DropItPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/create');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <p className="text-zinc-400">Redirecting to unified create flow...</p>
    </div>
  );
}
