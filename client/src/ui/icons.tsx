// Clean line icons (Lucide-style) for the dock — consistent + crisp at any size.
import type { ReactNode } from 'react';

const mk = (children: ReactNode) => (props: any) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>{children}</svg>
);

export const Icon = {
  build: mk(<><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M12 12 4 7.5M12 12v9M12 12l8-4.5" /></>),
  army: mk(<><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M12 10V6" /><circle cx="12" cy="4.5" r="1.6" /><path d="M9 14.5h.01M15 14.5h.01" /></>),
  campaign: mk(<><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>),
  raid: mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" /></>),
  quests: mk(<><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8" /><path d="M15 3v5h5" /><path d="M8 12h7M8 16h7" /></>),
  gems: mk(<><path d="M6 3h12l4 6-10 13L2 9z" /><path d="M11 3 8 9l4 13 4-13-3-6M2 9h20" /></>),
  defense: mk(<path d="M12 2.5 5 5.5V11c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V5.5z" />),
  clan: mk(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3.5" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.5a4 4 0 0 1 0 7" /></>),
  logout: mk(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>),
  trophy: mk(<><path d="M6 4h12v4a6 6 0 0 1-12 0z" /><path d="M6 6H3.5a2.5 2.5 0 0 0 3 2.4M18 6h2.5a2.5 2.5 0 0 1-3 2.4" /><path d="M12 14v3M8.5 21h7M9.5 21c0-1.5 1-2 2.5-2s2.5.5 2.5 2" /></>),
  camera: mk(<><path d="M12 3a9 9 0 1 0 9 9" /><path d="m21 3-4 4-2-2" /><circle cx="12" cy="12" r="3" /></>),
  reset: mk(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>),
  war: mk(<><path d="M14.5 17.5 4 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M5 14l-2 2v3h3l2-2M5 14l4 4" /></>),
};

// brand glyphs (filled) for social links
const mkF = (children: ReactNode) => (props: any) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...props}>{children}</svg>
);
export const Brand = {
  x: mkF(<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />),
  telegram: mkF(<path d="M21.97 4.06 18.9 19.5c-.23 1.02-.84 1.27-1.7.79l-4.7-3.46-2.27 2.18c-.25.25-.46.46-.94.46l.34-4.78 8.7-7.86c.38-.34-.08-.53-.59-.19L6.78 13.1l-4.64-1.45c-1.01-.32-1.03-1.01.21-1.5L20.7 2.6c.84-.31 1.57.2 1.27 1.46z" />),
  github: mkF(<path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.3-.5-1.5.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z" />),
};
