function escapeXml(unsafe: string): string {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function makeModCoverSvg(
  title: string,
  subtitle: string,
  themeColor: string,
  accentColor: string,
  badgeText: string,
  motif: 'vampire' | 'fox' | 'rat' | 'fire' | 'chains' | 'blade' | 'stars' = 'vampire'
): string {
  const safeTitle = escapeXml(title);
  const safeSubtitle = escapeXml(subtitle);
  const safeBadge = escapeXml(badgeText);
  const motifPaths = {
    vampire: `
      <!-- Bat Wings & Blood Moon -->
      <path d="M 500 130 Q 530 80 570 95 Q 545 130 575 160 Q 535 155 500 190 Q 500 155 465 160 Q 495 130 470 95 Q 510 80 500 130 Z" fill="${themeColor}" fill-opacity="0.28" stroke="${accentColor}" stroke-width="1.5"/>
      <circle cx="500" cy="140" r="45" fill="none" stroke="${themeColor}" stroke-width="2" stroke-dasharray="10 6" opacity="0.4"/>
      <!-- Fangs / Rose Petals -->
      <path d="M 485 240 Q 500 270 515 240" fill="none" stroke="${accentColor}" stroke-width="2.5"/>
    `,
    fox: `
      <!-- Kitsune Fox Mask / Fireflies -->
      <polygon points="500,90 540,150 520,200 480,200 460,150" fill="${themeColor}" fill-opacity="0.22" stroke="${accentColor}" stroke-width="2"/>
      <polygon points="480,100 460,60 495,95" fill="${accentColor}" fill-opacity="0.4"/>
      <polygon points="520,100 540,60 505,95" fill="${accentColor}" fill-opacity="0.4"/>
      <circle cx="490" cy="145" r="4" fill="${accentColor}"/>
      <circle cx="510" cy="145" r="4" fill="${accentColor}"/>
    `,
    rat: `
      <!-- Sleek Stinger Blade / Tail Silhouette -->
      <path d="M 460 220 Q 520 180 510 120 Q 500 70 540 60 Q 530 110 550 150 Q 560 210 490 230 Z" fill="${themeColor}" fill-opacity="0.3" stroke="${accentColor}" stroke-width="1.8"/>
      <circle cx="505" cy="150" r="48" fill="none" stroke="${themeColor}" stroke-width="1" stroke-dasharray="6 6" opacity="0.5"/>
    `,
    fire: `
      <!-- Gothic Flame Wisps -->
      <path d="M 500 80 Q 540 130 520 170 Q 550 160 535 210 Q 480 230 470 180 Q 450 160 480 130 Z" fill="${themeColor}" fill-opacity="0.3" stroke="${accentColor}" stroke-width="2"/>
      <circle cx="505" cy="165" r="5" fill="#FFE600"/>
    `,
    chains: `
      <!-- Chains & Shield Crest -->
      <polygon points="500,85 545,115 545,175 500,215 455,175 455,115" fill="${themeColor}" fill-opacity="0.2" stroke="${accentColor}" stroke-width="2.2"/>
      <line x1="440" y1="90" x2="560" y2="210" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="8 6" opacity="0.6"/>
    `,
    blade: `
      <!-- Crossed Gothic Daggers -->
      <line x1="450" y1="80" x2="550" y2="220" stroke="${accentColor}" stroke-width="3" stroke-linecap="round"/>
      <line x1="550" y1="80" x2="450" y2="220" stroke="${themeColor}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="500" cy="150" r="30" fill="none" stroke="${accentColor}" stroke-width="1.5" stroke-opacity="0.5"/>
    `,
    stars: `
      <!-- Celestial Ethereal Sigil -->
      <polygon points="500,75 512,125 565,125 522,155 538,205 500,175 462,205 478,155 435,125 488,125" fill="${themeColor}" fill-opacity="0.25" stroke="${accentColor}" stroke-width="1.5"/>
      <circle cx="500" cy="145" r="42" fill="none" stroke="${accentColor}" stroke-width="1" stroke-dasharray="4 8" opacity="0.6"/>
    `,
  }[motif];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <defs>
      <radialGradient id="card_bg" cx="70%" cy="40%" r="80%">
        <stop offset="0%" stop-color="#220D16"/>
        <stop offset="45%" stop-color="#140A0F"/>
        <stop offset="100%" stop-color="#080406"/>
      </radialGradient>
      <linearGradient id="glow_grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${themeColor}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#E11D48" stop-opacity="0.05"/>
      </linearGradient>
    </defs>
    <!-- Card Canvas -->
    <rect width="640" height="360" fill="url(#card_bg)"/>
    <rect width="640" height="360" fill="url(#glow_grad)"/>
    
    <!-- Delicate Crimson Web / Gothic Arc Borders -->
    <path d="M 0 0 C 180 30 260 140 300 360" fill="none" stroke="#E11D48" stroke-width="0.8" stroke-opacity="0.18"/>
    <path d="M 0 80 C 120 110 180 200 210 360" fill="none" stroke="${themeColor}" stroke-width="0.6" stroke-opacity="0.12"/>
    
    <!-- Right Motif Graphic -->
    ${motifPaths}

    <!-- Left Content Plate -->
    <rect x="28" y="26" width="130" height="24" rx="12" fill="#0A0608" stroke="#E11D48" stroke-width="1" stroke-opacity="0.8"/>
    <text x="93" y="42" text-anchor="middle" fill="#FB7185" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="10" letter-spacing="1.2">${safeBadge}</text>
    
    <!-- Title & Subtitle with Gothic Modern Flair -->
    <text x="32" y="245" fill="#FFFFFF" font-family="'Plus Jakarta Sans', 'Inter', sans-serif" font-weight="800" font-size="28" letter-spacing="-0.5">${safeTitle}</text>
    <text x="32" y="276" fill="${accentColor}" font-family="'JetBrains Mono', monospace" font-weight="600" font-size="13" letter-spacing="0.5">${safeSubtitle}</text>
    
    <!-- Bottom Accent Line -->
    <rect x="32" y="296" width="220" height="2" rx="1" fill="#E11D48" fill-opacity="0.8"/>
    <text x="32" y="322" fill="#A1A1AA" font-family="'JetBrains Mono', monospace" font-size="11">MOD READY &#8226; CLICK ANY CARD TO INSPECT &amp; CHANGE BINDS</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
