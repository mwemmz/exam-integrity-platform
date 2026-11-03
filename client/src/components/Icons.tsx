import type { ReactNode } from 'react';

const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

function make(children: ReactNode) {
    return function Icon({ size = 20 }: { size?: number }) {
        return <svg {...base} width={size} height={size}>{children}</svg>;
    };
}

export const IconExams = make(<><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4.5h6M9 10h6M9 14h6M9 18h3" /></>);
export const IconShield = make(<><path d="M12 3l7 3v5.5c0 4.2-2.9 7.8-7 9.5-4.1-1.7-7-5.3-7-9.5V6l7-3z" /><path d="M12 8.5v4M12 15.5h.01" /></>);
export const IconAdmin = make(<><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3.3 2.9-5 5.5-5s4.9 1.7 5.5 5" /><path d="M16 5.5a3 3 0 010 6M17.5 14.3c1.8.6 3 2.1 3.5 4.7" /></>);
export const IconPalette = make(<><path d="M12 3.5a8.5 8.5 0 100 17c1.3 0 2-.8 2-1.7 0-1-.9-1.3-.9-2.3 0-.9.7-1.5 1.7-1.5H17a3.5 3.5 0 003.5-3.5C20.5 6.7 16.7 3.5 12 3.5z" /><circle cx="7.8" cy="11" r="1" /><circle cx="10.2" cy="7.4" r="1" /><circle cx="14.6" cy="7.4" r="1" /></>);
export const IconLogout = make(<><path d="M10 4H6.5A1.5 1.5 0 005 5.5v13A1.5 1.5 0 006.5 20H10" /><path d="M15 8l4 4-4 4M19 12H9.5" /></>);
export const IconMenu = make(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconClose = make(<path d="M6 6l12 12M18 6L6 18" />);
export const IconCheck = make(<path d="M5 12.5l4.2 4.2L19 7" />);
export const IconArrow = make(<path d="M7 17L17 7M9 7h8v8" />);
export const IconLogo = make(<><path d="M12 3l7.5 3v5.4c0 4.4-3 8-7.5 9.6-4.5-1.6-7.5-5.2-7.5-9.6V6L12 3z" /><path d="M8.7 12.2l2.2 2.2 4.4-4.6" /></>);
