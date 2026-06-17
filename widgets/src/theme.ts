export const themeColors = {
  navy: '#1F2547',
  navy700: '#2C3360',
  navy500: '#4A5380',
  navy300: '#8C92B0',
  coral: '#FB7461',
  coral600: '#E87F67',
  teal: '#2BB5B5',
  cream: '#F8F6F3',
  creamElev: '#FFFFFF',
  border: '#E6E1D9',
  success: '#2BB573',
  danger: '#E0524C',
};

export const sharedStyles = `
  :root {
    color-scheme: light dark;
    --kc-navy: ${themeColors.navy};
    --kc-navy-700: ${themeColors.navy700};
    --kc-navy-500: ${themeColors.navy500};
    --kc-coral: ${themeColors.coral};
    --kc-coral-600: ${themeColors.coral600};
    --kc-teal: ${themeColors.teal};
    --kc-cream: ${themeColors.cream};
    --kc-cream-elev: ${themeColors.creamElev};
    --kc-success: ${themeColors.success};
    --kc-danger: ${themeColors.danger};
    --kc-border: ${themeColors.border};
    --font-sans: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

    /* Light Theme Defaults */
    --ui-bg: var(--kc-cream);
    --ui-bg-elevated: var(--kc-cream-elev);
    --ui-bg-muted: #F2EFEA;
    --ui-text: var(--kc-navy);
    --ui-text-muted: var(--kc-navy-500);
    --ui-border: var(--kc-border);
    --ui-primary: var(--kc-coral-600);
    --ui-primary-foreground: var(--kc-navy);
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --ui-bg: #0F1225;
      --ui-bg-elevated: #1F2547;
      --ui-bg-muted: #141836;
      --ui-text: #EEF0F8;
      --ui-text-muted: #9CA4C6;
      --ui-border: rgba(255, 255, 255, 0.09);
      --ui-primary: var(--kc-coral);
      --ui-primary-foreground: var(--kc-cream-elev);
    }
  }
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    font-family: var(--font-sans); 
    background: transparent; 
    color: var(--ui-text); 
  }
  .card { 
    padding: 20px; 
    background: var(--ui-bg-elevated); 
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--ui-border);
  }
  .btn { 
    padding: 11px 14px; 
    border-radius: 8px; 
    font-size: 14px; 
    font-weight: 600; 
    cursor: pointer; 
    border: none; 
    transition: opacity 0.15s, transform 0.1s; 
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .btn:hover:not(:disabled) { opacity: 0.85; }
  .btn:active:not(:disabled) { transform: scale(0.98); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  
  .btn-primary { 
    background: var(--ui-primary); 
    color: var(--ui-primary-foreground); 
  }
  .btn-secondary {
    background: var(--ui-text);
    color: var(--ui-bg);
  }
  .btn-outline { 
    background: transparent; 
    color: var(--ui-text); 
    border: 1.5px solid var(--ui-border); 
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .skeleton {
    background: linear-gradient(90deg, var(--ui-bg-muted) 25%, var(--ui-border) 50%, var(--ui-bg-muted) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }
`;
