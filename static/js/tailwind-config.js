/**
 * Tailwind CSS Play CDN Custom Configuration
 * Configures fonts, custom colors (obsidian, emeraldGlow, amberGlow), and dark mode.
 */
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
                script: ['Caveat', 'cursive'],
                loveSerif: ['"Cinzel Decorative"', 'Georgia', 'serif'],
                serifPaper: ['"Times New Roman"', 'Times', 'Georgia', 'serif'],
                monoFeature: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
            },
            colors: {
                obsidian: '#070A09',
                emeraldGlow: '#2EE57D',
                amberGlow: '#FACC15',
                hubSidebar: '#1B1B1B',
                hubCanvas: '#202020',
                hubCard: '#232323',
                readitGreen: '#76B843',
                readitPurple: '#8B5CF6',
            }
        }
    }
};
