// Vector art for the arena. Each sprite is an SVG drawn in world units, rasterised once
// at high resolution so the game can stamp it cheaply every frame.
(function () {
  const O = '#2b3445';          // outline ink
  const SW = 'stroke="#2b3445" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
  const SW2 = 'stroke="#2b3445" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';
  const SHADOW = '#5d7a99';
  const WOOD = '#8f5d36', WOOD_DARK = '#6b4428', WOOD_LIGHT = '#d9a86a', WOOD_MID = '#b57a43';
  const SNOW = '#ffffff', SNOW_SHADE = '#dbe8f4';
  const shadow = (cx, cy, rx, ry, op = 0.22) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${SHADOW}" opacity="${op}"/>`;

  // Branch drawn as an ink outline with a coloured core.
  const branch = (d, w, col = '#7a5233') => `<path d="${d}" fill="none" stroke="${O}" stroke-width="${w + 5}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  // Birch log standing upright.
  function birch(x, y, w, h) {
    const cx = x + w / 2;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.3}" fill="#f3efe6" ${SW2}/>
      <path d="M${x + w * 0.62} ${y + 4} L${x + w * 0.62} ${y + h - 6}" stroke="#d6cfc0" stroke-width="${w * 0.28}" opacity=".7"/>
      <path d="M${x + 3} ${y + h * 0.28} l${w * 0.35} 1 M${x + w - 4} ${y + h * 0.45} l-${w * 0.3} 1 M${x + 3} ${y + h * 0.62} l${w * 0.28} 0 M${x + w - 4} ${y + h * 0.78} l-${w * 0.35} 1" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>
      <ellipse cx="${cx}" cy="${y + 3}" rx="${w / 2 - 1}" ry="${w * 0.22}" fill="${WOOD_LIGHT}" ${SW2}/>
      <ellipse cx="${cx}" cy="${y + 3}" rx="${w * 0.22}" ry="${w * 0.1}" fill="none" stroke="#b07a42" stroke-width="1.6"/>
      <path d="M${x + 1} ${y + 3} Q${cx - 2} ${y - 6} ${x + w - 1} ${y + 2} Q${cx} ${y + 8} ${x + 1} ${y + 3}Z" fill="${SNOW}" ${SW2}/>`;
  }

  const DEFS = {
    pine: {
      w: 130, h: 158, ax: 65, ay: 82,
      svg: `${shadow(74, 146, 48, 12)}
        <rect x="58" y="122" width="14" height="24" rx="3" fill="${WOOD}" ${SW}/>
        <path d="M65 50 L114 124 Q65 136 16 124 Z" fill="#2c7046" ${SW}/>
        <path d="M65 50 L114 124 Q92 132 66 133 Z" fill="#000" opacity=".13"/>
        <path d="M16 124 Q24 112 34 119 Q42 108 52 118 Q60 107 70 118 Q79 108 87 119 Q97 110 104 120 Q110 116 114 124 Q65 136 16 124 Z" fill="${SNOW}" ${SW}/>
        <path d="M65 26 L100 90 Q65 100 30 90 Z" fill="#34814f" ${SW}/>
        <path d="M65 26 L100 90 Q84 97 66 98 Z" fill="#000" opacity=".13"/>
        <path d="M30 90 Q37 80 45 86 Q52 77 60 85 Q67 76 75 85 Q83 78 89 87 Q96 84 100 90 Q65 100 30 90 Z" fill="${SNOW}" ${SW}/>
        <path d="M65 4 L87 57 Q65 65 43 57 Z" fill="#3e955c" ${SW}/>
        <path d="M65 4 L87 57 Q76 62 66 63 Z" fill="#000" opacity=".13"/>
        <path d="M43 57 Q49 48 55 53 Q62 45 68 53 Q75 46 81 53 Q85 51 87 57 Q65 65 43 57 Z" fill="${SNOW}" ${SW}/>
        <path d="M65 4 L73 23 Q69 19 65 24 Q61 19 57 23 Z" fill="${SNOW}" ${SW2}/>
        <circle cx="48" cy="104" r="2.4" fill="#fff"/><circle cx="84" cy="70" r="2" fill="#fff"/><circle cx="56" cy="40" r="1.8" fill="#fff"/>`,
    },
    bare: {
      w: 120, h: 140, ax: 60, ay: 128,
      svg: `${shadow(64, 131, 32, 8)}
        ${branch('M60 128 L60 70', 11)}
        ${branch('M60 94 L38 66 L30 40', 7)}
        ${branch('M38 66 L17 58', 5)}
        ${branch('M60 82 L82 54 L92 30', 7)}
        ${branch('M82 54 L105 48', 5)}
        ${branch('M60 72 L62 38 L54 15', 6)}
        ${branch('M62 46 L75 28', 4)}
        ${branch('M30 40 L22 27', 3)}${branch('M92 30 L101 19', 3)}
        <ellipse cx="38" cy="62" rx="7" ry="3.2" fill="${SNOW}" ${SW2}/>
        <ellipse cx="82" cy="50" rx="7" ry="3.2" fill="${SNOW}" ${SW2}/>
        <ellipse cx="62" cy="42" rx="6" ry="3" fill="${SNOW}" ${SW2}/>
        <ellipse cx="103" cy="45" rx="5" ry="2.6" fill="${SNOW}" ${SW2}/>
        <path d="M40 130 Q48 118 60 121 Q72 118 80 130 Q60 136 40 130Z" fill="${SNOW}" ${SW2}/>`,
    },
    igloo: {
      w: 162, h: 132, ax: 81, ay: 74,
      svg: `${shadow(86, 118, 76, 12)}
        <path d="M8 112 C8 40 40 12 81 12 C122 12 154 40 154 112 Z" fill="#e6f4fd" ${SW}/>
        <path d="M81 12 C122 12 154 40 154 112 L114 112 C118 70 106 30 81 12 Z" fill="#bcdff5" opacity=".85"/>
        <g stroke="#8db9d9" stroke-width="2" fill="none" stroke-linecap="round">
          <path d="M13 88 Q81 77 149 88"/><path d="M23 62 Q81 51 139 62"/><path d="M42 36 Q81 27 120 36"/>
          <path d="M30 90 L30 111 M140 89 L140 111"/>
          <path d="M44 64 L42 86 M72 60 L72 81 M100 60 L100 81 M128 64 L130 87"/>
          <path d="M58 38 L56 60 M84 33 L84 56 M110 38 L112 60"/>
          <path d="M70 14 L68 34 M94 15 L95 34"/>
        </g>
        <path d="M30 76 Q34 46 58 28" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".9"/>
        <path d="M55 116 L55 86 C55 64 107 64 107 86 L107 116 Z" fill="#d5eafa" ${SW}/>
        <path d="M65 116 L65 90 C65 76 97 76 97 90 L97 116 Z" fill="#3c6a9b" ${SW2}/>
        <path d="M71 116 L71 93 C71 84 91 84 91 93 L91 116 Z" fill="#284e78"/>
        <path d="M55 96 L65 96 M97 96 L107 96" stroke="#8db9d9" stroke-width="2"/>
        <path d="M8 112 Q81 122 154 112" fill="none" ${SW}/>`,
    },
    mound: {
      w: 200, h: 96, ax: 100, ay: 66,
      svg: `${shadow(106, 84, 94, 13)}
        <path d="M6 80 Q18 28 100 18 Q182 26 194 80 Q100 93 6 80 Z" fill="${SNOW}" ${SW}/>
        <path d="M100 18 Q182 26 194 80 Q160 87 128 88 Q166 56 100 18 Z" fill="${SNOW_SHADE}"/>
        <path d="M10 76 Q100 88 190 76" fill="none" stroke="${SNOW_SHADE}" stroke-width="5" stroke-linecap="round"/>
        <path d="M40 52 Q58 34 84 30" fill="none" stroke="#eef5fb" stroke-width="5" stroke-linecap="round"/>
        <path d="M6 80 Q100 93 194 80" fill="none" ${SW}/>`,
    },
    moundS: {
      w: 100, h: 60, ax: 50, ay: 40,
      svg: `${shadow(54, 51, 46, 8)}
        <path d="M6 50 Q12 16 50 11 Q88 15 94 50 Q50 58 6 50 Z" fill="${SNOW}" ${SW}/>
        <path d="M50 11 Q88 15 94 50 Q76 55 62 55 Q82 34 50 11 Z" fill="${SNOW_SHADE}"/>
        <path d="M6 50 Q50 58 94 50" fill="none" ${SW}/>`,
    },
    snowman: {
      w: 82, h: 124, ax: 41, ay: 100,
      svg: `${shadow(45, 116, 28, 7)}
        <path d="M24 66 L6 52 M10 55 L3 47" stroke="${WOOD_DARK}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
        <path d="M58 66 L76 50 M72 53 L79 45" stroke="${WOOD_DARK}" stroke-width="3.4" stroke-linecap="round" fill="none"/>
        <circle cx="41" cy="94" r="24" fill="${SNOW}" ${SW}/><path d="M52 74 A24 24 0 0 1 41 118 A26 26 0 0 0 52 74Z" fill="${SNOW_SHADE}"/>
        <circle cx="41" cy="62" r="18" fill="${SNOW}" ${SW}/><path d="M50 47 A18 18 0 0 1 41 80 A20 20 0 0 0 50 47Z" fill="${SNOW_SHADE}"/>
        <circle cx="41" cy="34" r="14" fill="${SNOW}" ${SW}/>
        <circle cx="41" cy="58" r="2.4" fill="${O}"/><circle cx="41" cy="68" r="2.4" fill="${O}"/>
        <path d="M25 46 Q41 54 57 46 L58 52 Q41 60 24 52 Z" fill="#3d8b5f" ${SW2}/>
        <path d="M48 52 L53 69 L45 69 L42 54 Z" fill="#3d8b5f" ${SW2}/>
        <circle cx="36" cy="32" r="2.2" fill="${O}"/><circle cx="46" cy="32" r="2.2" fill="${O}"/>
        <path d="M41 36 L54 39 L41 41 Z" fill="#f08a2c" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/>
        <rect x="30" y="4" width="22" height="19" rx="2" fill="#2b2f3a" ${SW2}/>
        <rect x="30" y="16" width="22" height="4" fill="#c8423b"/>
        <rect x="24" y="21" width="34" height="5" rx="2" fill="#2b2f3a" ${SW2}/>`,
    },
    crate: {
      w: 76, h: 76, ax: 38, ay: 42,
      svg: `${shadow(42, 72, 36, 6)}
        <rect x="3" y="8" width="70" height="12" rx="3" fill="${WOOD_LIGHT}" ${SW}/>
        <rect x="3" y="14" width="70" height="58" rx="4" fill="${WOOD_MID}" ${SW}/>
        <rect x="11" y="22" width="54" height="42" rx="2" fill="#c98c52" stroke="${WOOD_DARK}" stroke-width="2.2"/>
        <path d="M13 62 L63 24" stroke="${WOOD_DARK}" stroke-width="8" stroke-linecap="round"/>
        <path d="M13 62 L63 24" stroke="${WOOD_MID}" stroke-width="4" stroke-linecap="round"/>
        <path d="M3 43 L73 43" stroke="${WOOD_DARK}" stroke-width="1.6" opacity=".5"/>
        <circle cx="8" cy="19" r="1.6" fill="${O}"/><circle cx="68" cy="19" r="1.6" fill="${O}"/><circle cx="8" cy="67" r="1.6" fill="${O}"/><circle cx="68" cy="67" r="1.6" fill="${O}"/>
        <path d="M5 13 Q14 3 25 9 Q36 2 47 8 Q59 2 71 11 L71 16 L5 16 Z" fill="${SNOW}" ${SW2}/>`,
    },
    iceTall: {
      w: 54, h: 116, ax: 27, ay: 60,
      svg: `${shadow(31, 110, 24, 5)}
        <rect x="4" y="10" width="46" height="100" rx="4" fill="#9dd3f3" ${SW}/>
        <rect x="10" y="18" width="34" height="84" rx="2" fill="#c3e6fb"/>
        <rect x="4" y="88" width="46" height="22" rx="4" fill="#80c0ea" opacity=".75"/>
        <rect x="4" y="3" width="46" height="13" rx="4" fill="#e8f7ff" ${SW}/>
        <path d="M14 34 L28 24 M14 50 L38 32 M30 82 L40 74" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
        <rect x="4" y="10" width="46" height="100" rx="4" fill="none" ${SW}/>`,
    },
    iceWide: {
      w: 110, h: 70, ax: 55, ay: 38,
      svg: `${shadow(59, 64, 50, 5)}
        <rect x="4" y="10" width="102" height="54" rx="4" fill="#9dd3f3" ${SW}/>
        <rect x="11" y="17" width="88" height="38" rx="2" fill="#c3e6fb"/>
        <path d="M4 46 Q30 40 55 47 Q80 54 106 44 L106 60 Q106 64 102 64 L8 64 Q4 64 4 60 Z" fill="#80c0ea" opacity=".75"/>
        <rect x="4" y="3" width="102" height="13" rx="4" fill="#e8f7ff" ${SW}/>
        <path d="M18 32 L32 22 M26 40 L50 24 M80 44 L92 36" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
        <rect x="4" y="10" width="102" height="54" rx="4" fill="none" ${SW}/>`,
    },
    logpile: {
      w: 72, h: 136, ax: 36, ay: 66,
      svg: `${shadow(40, 130, 34, 6)}
        ${birch(4, 8, 21, 118)}${birch(25, 6, 22, 120)}${birch(47, 8, 21, 118)}
        <ellipse cx="14" cy="124" rx="9" ry="5" fill="${WOOD_LIGHT}" ${SW2}/><ellipse cx="36" cy="125" rx="9" ry="5" fill="${WOOD_LIGHT}" ${SW2}/><ellipse cx="58" cy="124" rx="9" ry="5" fill="${WOOD_LIGHT}" ${SW2}/>`,
    },
    post: {
      w: 38, h: 96, ax: 19, ay: 48,
      svg: `${shadow(22, 90, 16, 4)}
        ${birch(5, 8, 28, 78)}
        <path d="M5 74 L5 82 Q19 92 33 82 L33 74 Q19 82 5 74 Z" fill="${WOOD_LIGHT}" ${SW2}/>`,
    },
    bench: {
      w: 126, h: 54, ax: 63, ay: 28,
      svg: `${shadow(66, 48, 58, 6)}
        <rect x="14" y="34" width="9" height="15" rx="2" fill="#4a3a2e" ${SW2}/><rect x="103" y="34" width="9" height="15" rx="2" fill="#4a3a2e" ${SW2}/>
        <rect x="5" y="6" width="116" height="9" rx="3" fill="${WOOD_DARK}" ${SW}/>
        <rect x="5" y="14" width="116" height="24" rx="4" fill="${WOOD}" ${SW}/>
        <path d="M8 26 L118 26" stroke="${WOOD_DARK}" stroke-width="2"/>
        <path d="M18 18 Q30 12 44 17 Q58 11 72 17 Q84 13 92 19 Q70 24 44 23 Q28 24 18 18Z" fill="${SNOW}" ${SW2}/>`,
    },
    stump: {
      w: 52, h: 48, ax: 26, ay: 27,
      svg: `${shadow(28, 40, 22, 5)}
        <path d="M8 22 L8 34 Q26 44 44 34 L44 22 Z" fill="${WOOD}" ${SW}/>
        <path d="M16 26 L16 38 M28 28 L28 41 M38 26 L38 37" stroke="${WOOD_DARK}" stroke-width="1.8"/>
        <ellipse cx="26" cy="22" rx="18" ry="8" fill="${WOOD_LIGHT}" ${SW}/>
        <ellipse cx="26" cy="22" rx="9" ry="3.6" fill="none" stroke="#b07a42" stroke-width="1.6"/>
        <path d="M11 20 Q17 11 26 14 Q35 10 41 19 Q33 24 26 21 Q17 25 11 20 Z" fill="${SNOW}" ${SW2}/>`,
    },
    log: {
      w: 114, h: 46, ax: 57, ay: 25,
      svg: `${shadow(60, 40, 52, 5)}
        <rect x="8" y="12" width="98" height="26" rx="12" fill="${WOOD}" ${SW}/>
        <path d="M24 28 L44 28 M56 22 L80 22 M70 32 L92 32" stroke="${WOOD_DARK}" stroke-width="2" stroke-linecap="round"/>
        <ellipse cx="12" cy="25" rx="7" ry="13" fill="${WOOD_LIGHT}" ${SW}/>
        <ellipse cx="12" cy="25" rx="3" ry="6" fill="none" stroke="#b07a42" stroke-width="1.6"/>
        <path d="M14 15 Q30 4 46 10 Q62 3 78 9 Q92 4 104 14 L104 18 Q60 21 14 19 Z" fill="${SNOW}" ${SW2}/>`,
    },
    fenceH: {
      w: 74, h: 42, ax: 37, ay: 26,
      svg: `${shadow(39, 36, 34, 4)}
        <rect x="3" y="11" width="68" height="7" rx="2" fill="#9c6a3e" ${SW2}/>
        <rect x="3" y="24" width="68" height="7" rx="2" fill="#9c6a3e" ${SW2}/>
        <rect x="8" y="4" width="10" height="32" rx="2" fill="${WOOD}" ${SW2}/>
        <rect x="56" y="4" width="10" height="32" rx="2" fill="${WOOD}" ${SW2}/>
        <ellipse cx="13" cy="5" rx="6" ry="3" fill="${SNOW}" ${SW2}/><ellipse cx="61" cy="5" rx="6" ry="3" fill="${SNOW}" ${SW2}/>`,
    },
    fenceV: {
      w: 30, h: 140, ax: 15, ay: 70,
      svg: `${shadow(17, 136, 12, 4)}
        <rect x="7" y="6" width="6" height="128" rx="2" fill="#9c6a3e" ${SW2}/>
        <rect x="17" y="6" width="6" height="128" rx="2" fill="#9c6a3e" ${SW2}/>
        <rect x="5" y="2" width="20" height="18" rx="3" fill="${WOOD}" ${SW2}/>
        <rect x="5" y="61" width="20" height="18" rx="3" fill="${WOOD}" ${SW2}/>
        <rect x="5" y="120" width="20" height="18" rx="3" fill="${WOOD}" ${SW2}/>
        <ellipse cx="15" cy="5" rx="8" ry="3" fill="${SNOW}" ${SW2}/>`,
    },
    // ----- Snow Village -----
    locker: {
      w: 50, h: 74, ax: 25, ay: 44,
      svg: `${shadow(27, 70, 22, 4)}
        <rect x="3" y="3" width="44" height="66" rx="3" fill="#3d8fb3" ${SW}/>
        <rect x="8" y="8" width="34" height="56" rx="2" fill="#4aa0c4" stroke="#2b6a87" stroke-width="2"/>
        <path d="M14 15 L36 15 M14 20 L36 20 M14 25 L36 25 M14 50 L36 50 M14 55 L36 55" stroke="#25576f" stroke-width="2.4" stroke-linecap="round"/>
        <rect x="35" y="34" width="4" height="9" rx="1" fill="#e7eef3"/>
        <path d="M4 5 Q14 -1 25 3 Q36 -1 46 5 L46 8 L4 8 Z" fill="${SNOW}" ${SW2}/>`,
    },
    bin: {
      w: 90, h: 76, ax: 45, ay: 42,
      svg: `${shadow(48, 70, 42, 6)}
        <circle cx="18" cy="66" r="6" fill="#22303f" ${SW2}/><circle cx="72" cy="66" r="6" fill="#22303f" ${SW2}/>
        <path d="M8 22 L82 22 L78 64 L12 64 Z" fill="#3d7a4f" ${SW}/>
        <path d="M14 30 L76 30 M16 46 L74 46" stroke="#2e5e3d" stroke-width="2.4"/>
        <path d="M4 22 L86 22 L80 4 L10 4 Z" fill="#2e5e3d" ${SW}/>
        <path d="M14 6 Q30 -2 46 4 Q62 -2 78 6 L80 12 L12 12 Z" fill="${SNOW}" ${SW2}/>`,
    },
    drift: {
      w: 140, h: 96, ax: 70, ay: 58,
      svg: `${shadow(74, 86, 66, 10)}
        <path d="M8 82 Q4 52 26 46 Q30 18 62 16 Q84 4 104 22 Q132 26 132 58 Q138 80 126 84 Q70 94 8 82 Z" fill="${SNOW}" ${SW}/>
        <path d="M104 22 Q132 26 132 58 Q138 80 126 84 Q104 88 88 88 Q124 64 104 22 Z" fill="${SNOW_SHADE}"/>
        <path d="M30 60 Q40 40 60 34" fill="none" stroke="#eef5fb" stroke-width="5" stroke-linecap="round"/>
        <path d="M60 30 Q66 24 74 26" fill="none" stroke="${SNOW_SHADE}" stroke-width="3" stroke-linecap="round"/>`,
    },
    lamp: {
      w: 30, h: 78, ax: 15, ay: 70,
      svg: `${shadow(16, 72, 9, 3)}
        <rect x="12" y="22" width="6" height="50" rx="2" fill="#2b3445"/>
        <rect x="7" y="8" width="16" height="16" rx="2" fill="#ffe29a" ${SW2}/>
        <path d="M5 9 L15 1 L25 9 Z" fill="#2b3445" ${SW2}/>
        <circle cx="15" cy="16" r="10" fill="#ffd36b" opacity=".25"/>`,
    },
    stall: {
      w: 120, h: 92, ax: 60, ay: 52,
      svg: `${shadow(62, 84, 54, 7)}
        <rect x="8" y="46" width="104" height="34" rx="3" fill="#b57a43" ${SW}/>
        <circle cx="28" cy="46" r="5" fill="#e2453c" ${SW2}/><circle cx="48" cy="46" r="5" fill="#ffc93c" ${SW2}/><circle cx="68" cy="46" r="5" fill="#3a86ff" ${SW2}/><circle cx="88" cy="46" r="5" fill="#7ac74f" ${SW2}/>
        <path d="M4 34 L116 34 L108 8 L12 8 Z" fill="#fff6ea" ${SW}/>
        <path d="M18 8 L12 34 L28 34 L32 8 Z M46 8 L44 34 L60 34 L60 8 Z M74 8 L76 34 L92 34 L88 8 Z M102 8 L108 34 L116 34 L108 8 Z" fill="#e2453c"/>
        <path d="M4 34 L116 34 L108 8 L12 8 Z" fill="none" ${SW}/>
        <path d="M14 10 Q40 2 60 8 Q82 2 106 10 L106 14 L14 14 Z" fill="${SNOW}" ${SW2}/>`,
    },
    desk: {
      w: 62, h: 46, ax: 31, ay: 24,
      svg: `${shadow(33, 42, 28, 4)}
        <rect x="8" y="20" width="4" height="20" fill="#39424f"/><rect x="50" y="20" width="4" height="20" fill="#39424f"/>
        <rect x="3" y="8" width="56" height="16" rx="2" fill="#c98c52" ${SW}/>`,
    },
    hydrant: {
      w: 32, h: 44, ax: 16, ay: 32,
      svg: `${shadow(17, 40, 12, 3)}
        <rect x="8" y="12" width="16" height="28" rx="4" fill="#e2453c" ${SW}/>
        <rect x="2" y="20" width="28" height="7" rx="3" fill="#e2453c" ${SW2}/>
        <path d="M8 13 Q16 2 24 13 Z" fill="${SNOW}" ${SW2}/>`,
    },
    tuft: {
      w: 46, h: 22, ax: 23, ay: 13,
      svg: `<path d="M4 16 Q10 6 20 9 Q28 3 36 9 Q43 10 42 16 Q23 20 4 16Z" fill="${SNOW}" stroke="#c9d9e7" stroke-width="2"/>`,
    },
    // Border fence pieces, tiled around the arena edge.
    railH: {
      w: 40, h: 30, ax: 0, ay: 0,
      svg: `<rect x="-2" y="7" width="44" height="5" rx="2" fill="#9c6a3e" ${SW2}/>
        <rect x="-2" y="17" width="44" height="5" rx="2" fill="#9c6a3e" ${SW2}/>
        <rect x="15" y="1" width="9" height="27" rx="2" fill="${WOOD}" ${SW2}/>
        <ellipse cx="19.5" cy="2.5" rx="5.5" ry="2.5" fill="${SNOW}" ${SW2}/>`,
    },
    railV: {
      w: 30, h: 40, ax: 0, ay: 0,
      svg: `<rect x="7" y="-2" width="5" height="44" rx="2" fill="#9c6a3e" ${SW2}/>
        <rect x="17" y="-2" width="5" height="44" rx="2" fill="#9c6a3e" ${SW2}/>
        <rect x="3" y="14" width="22" height="12" rx="3" fill="${WOOD}" ${SW2}/>
        <ellipse cx="14" cy="15" rx="7" ry="2.4" fill="${SNOW}" ${SW2}/>`,
    },
  };

  DEFS.crateS = { ...DEFS.crate, scale: 0.68 };

  const RES = 2.5; // raster pixels per world unit
  const canvases = {};
  const ready = Promise.all(Object.entries(DEFS).filter(([, d]) => !d.scale).map(([k, d]) => new Promise((resolve) => {
    const pad = 4;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${d.w + pad * 2} ${d.h + pad * 2}" width="${(d.w + pad * 2) * RES}" height="${(d.h + pad * 2) * RES}">${d.svg}</svg>`;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      canvases[k] = { c, pad };
      resolve();
    };
    img.onerror = () => { console.warn('sprite failed', k); resolve(); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  })));

  // Draw sprite `k` with its anchor at world (x, y), optionally scaled.
  function draw(ctx, k, x, y, alpha = 1, scale = 1) {
    const d = DEFS[k];
    if (d && d.scale) { k = Object.keys(DEFS).find((n) => DEFS[n].svg === d.svg && !DEFS[n].scale); scale *= d.scale; }
    const s = canvases[k];
    if (!s) return false;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    const q = scale;
    ctx.drawImage(s.c, x - (d.ax + s.pad) * q, y - (d.ay + s.pad) * q, (d.w + s.pad * 2) * q, (d.h + s.pad * 2) * q);
    if (alpha !== 1) ctx.globalAlpha = 1;
    return true;
  }

  window.FFSprites = { DEFS, draw, ready, svgFor: (k) => DEFS[k] && DEFS[k].svg };
})();
