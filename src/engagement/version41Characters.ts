function portrait(label: string, accent: string, shadow: string, figure: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img"><title>${label}</title><defs><radialGradient id="g"><stop stop-color="${accent}" stop-opacity=".34"/><stop offset="1" stop-color="${shadow}"/></radialGradient></defs><rect width="160" height="160" rx="80" fill="url(#g)"/><circle cx="80" cy="72" r="61" fill="none" stroke="${accent}" stroke-opacity=".45" stroke-width="3"/>${figure}<rect x="31" y="126" width="98" height="24" rx="12" fill="#020817" fill-opacity=".88" stroke="${accent}"/><text x="80" y="143" fill="#fff" font-family="system-ui,sans-serif" font-size="14" font-weight="900" text-anchor="middle" letter-spacing="1.5">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// High-contrast, name-stamped silhouettes stay legible in the 50–125 px HUD
// placements without adding another raster payload to the mobile release.
export const VERSION41_CHARACTER_PORTRAITS = Object.freeze({
  miri: portrait("MIRI", "#6dffe2", "#073b55", `
    <path d="M36 79c15-31 62-42 87-7-23-9-39-7-51 7-11 13-24 16-36 0Z" fill="#61ead7" opacity=".28"/>
    <path d="M53 85c22-14 48-15 67 0-19 4-30 16-34 35-8-16-19-27-33-35Z" fill="#53d6cc"/>
    <path d="M84 113c-17 3-29 11-36 22 17 1 30-2 39-10 8 8 19 11 32 9-8-12-18-19-35-21Z" fill="#a7fff0"/>
    <circle cx="82" cy="60" r="25" fill="#9bffe9"/><path d="M58 57c4-26 40-32 52-6-17-8-33-6-52 6Z" fill="#19527a"/>
    <circle cx="73" cy="61" r="3" fill="#09223c"/><circle cx="92" cy="61" r="3" fill="#09223c"/><path d="M74 73q9 7 18 0" fill="none" stroke="#14506b" stroke-width="3" stroke-linecap="round"/>
    <path d="M41 39l10 5-10 5-5 10-5-10-10-5 10-5 5-10Z" fill="#fff3a7"/>
  `),
  neri: portrait("NERI", "#c393ff", "#271153", `
    <path d="M25 88c25-35 74-44 112-10-30-3-50 5-61 25-14-10-31-15-51-15Z" fill="#9c63e8" opacity=".34"/>
    <path d="M48 91c21-19 49-19 75-3-20 5-32 16-38 33-7-15-19-25-37-30Z" fill="#8d5bd6"/>
    <path d="M84 114c-13 4-25 12-34 23 17 0 29-3 37-10 8 7 20 10 34 8-8-11-20-18-37-21Z" fill="#d6b5ff"/>
    <circle cx="83" cy="62" r="25" fill="#d8c0ff"/><path d="M58 58c8-27 43-29 52-4l-16-7-5 10-9-11-8 10Z" fill="#5d2e9d"/>
    <path d="M69 36l7-14 8 13 10-12 2 17" fill="#ffe289" stroke="#fff0ae" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="74" cy="63" r="3" fill="#281047"/><circle cx="93" cy="63" r="3" fill="#281047"/><path d="M75 75q9 4 17-2" fill="none" stroke="#5d2e9d" stroke-width="3" stroke-linecap="round"/>
  `),
  duskmaw: portrait("DUSKMAW", "#ff69bd", "#23051f", `
    <path d="M18 92c12-51 75-70 127-29-34-4-59 4-72 24 24-5 45 3 63 26-43-20-76-10-98 22 2-24-5-35-20-43Z" fill="#180c26" stroke="#fa61b7" stroke-width="4" stroke-linejoin="round"/>
    <path d="M44 75c22-25 61-29 91-8-22-2-39 5-51 20-12-7-25-11-40-12Z" fill="#4d174c"/>
    <path d="M91 58l12-8-4 14m17 1 15-3-11 11" fill="none" stroke="#ff82cc" stroke-width="5" stroke-linecap="round"/>
    <path d="M86 86q20 18 40-2-4 31-36 25" fill="#070611" stroke="#ff69bd" stroke-width="3"/>
    <path d="M99 92l6 11 6-13 7 9" fill="#fff0f8"/>
    <circle cx="99" cy="70" r="5" fill="#ffde75"/><circle cx="121" cy="72" r="5" fill="#ffde75"/>
  `)
});
