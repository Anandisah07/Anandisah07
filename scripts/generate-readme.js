#!/usr/bin/env node
// ============================================================
//  🎮 FIFA-Style GitHub Profile README Generator
//  Inspired by GitFut (https://gitfut.com)
//  Auto-generates card.svg + README.md from live GitHub data
// ============================================================

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────
const CONFIG = {
  username: 'Anandisah07',
  displayName: 'Anandi Sah',
  country: 'IN',
  countryName: 'India',
  portfolioUrl: 'https://anandisah07.github.io/Portfolio/',
  // Set to override auto-detected top language (e.g. 'Java'). Leave null for auto.
  preferredLanguage: 'Java',
};

// ─── GitHub API ─────────────────────────────────────────────
async function fetchJSON(url) {
  const headers = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'GitFut-Profile-Bot' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`   ⚠ API ${res.status}: ${url}`);
    if (body) console.error(`     ${body.slice(0, 200)}`);
    throw new Error(`GitHub API ${res.status} for ${url}`);
  }
  return res.json();
}

async function fetchAllRepos(username) {
  let page = 1;
  let all = [];
  while (true) {
    const batch = await fetchJSON(
      `https://api.github.com/users/${username}/repos?per_page=100&sort=updated&page=${page}`
    );
    all = all.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

async function fetchJSONSafe(url) {
  try {
    return await fetchJSON(url);
  } catch {
    return [];
  }
}

async function fetchGitHubData() {
  const [user, repos, events] = await Promise.all([
    fetchJSON(`https://api.github.com/users/${CONFIG.username}`),
    fetchAllRepos(CONFIG.username),
    fetchJSONSafe(`https://api.github.com/users/${CONFIG.username}/events/public?per_page=100`),
  ]);
  return { user, repos, events: Array.isArray(events) ? events : [] };
}

async function fetchAvatarBase64(url) {
  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const ct = res.headers.get('content-type') || 'image/png';
    return `data:${ct};base64,${base64}`;
  } catch {
    return null;
  }
}

// ─── Stats Computation ─────────────────────────────────────
function computeStats(data) {
  const { user, repos, events } = data;
  const ownRepos = repos.filter((r) => !r.fork);
  const now = Date.now();

  // Aggregate metrics
  const totalStars = ownRepos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const totalForks = ownRepos.reduce((s, r) => s + (r.forks_count || 0), 0);

  // Languages — weight by stars+1 and recency so impactful repos rank higher
  const langMap = {};
  ownRepos.forEach((r) => {
    if (r.language) {
      const weight = (r.stargazers_count || 0) + 1;
      langMap[r.language] = (langMap[r.language] || 0) + weight;
    }
  });
  const languages = Object.entries(langMap).sort((a, b) => b[1] - a[1]);
  const topLanguage = CONFIG.preferredLanguage 
    ? CONFIG.preferredLanguage 
    : (languages[0]?.[0] || 'Code');
  const uniqueLanguages = languages.length;

  // Recent activity
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const pushEvents = events.filter(
    (e) => e.type === 'PushEvent' && now - new Date(e.created_at).getTime() < ninetyDays
  );
  const recentCommits = pushEvents.reduce((s, e) => s + (e.payload?.commits?.length || 0), 0);

  // Fresh repos (updated in last 6 months)
  const sixMonths = 180 * 24 * 60 * 60 * 1000;
  const freshRepos = ownRepos.filter((r) => now - new Date(r.pushed_at).getTime() < sixMonths).length;

  // Account age
  const accountAgeDays = (now - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const accountAgeYears = accountAgeDays / 365;

  // Event counts
  const issueEvents = events.filter((e) => e.type === 'IssuesEvent').length;
  const prEvents = events.filter((e) => e.type === 'PullRequestEvent').length;
  const reviewEvents = events.filter((e) => e.type === 'PullRequestReviewEvent').length;
  const createEvents = events.filter((e) => e.type === 'CreateEvent').length;

  const clamp = (v, lo = 30, hi = 99) => Math.round(Math.min(hi, Math.max(lo, v)));

  // ── PAC (Pace) — Shipping speed ──
  const commitsPerWeek = recentCommits / 13;
  const pacRaw = commitsPerWeek * 6 + freshRepos * 2.5 + (recentCommits > 0 ? 8 : 0);
  const pac = clamp(37 + pacRaw);

  // ── SHO (Shooting) — Impact / Stars ──
  const sho = clamp(37 + Math.log2(totalStars + 1) * 9 + Math.min(totalStars, 10) * 1.5);

  // ── PAS (Passing) — Collaboration ──
  const pasRaw = totalForks * 4 + prEvents * 5 + user.following * 1.5 + createEvents * 2;
  const pas = clamp(22 + Math.log2(pasRaw + 1) * 7);

  // ── DRI (Dribbling) — Technical range ──
  const driRaw = uniqueLanguages * 7 + Math.min(ownRepos.length, 20) * 1.2;
  const dri = clamp(23 + driRaw);

  // ── DEF (Defense) — Maintenance ──
  const defRaw = issueEvents * 4 + prEvents * 4 + reviewEvents * 6 + (user.public_gists || 0) * 3;
  const def = clamp(42 + defRaw * 1.5);

  // ── PHY (Physical) — Endurance ──
  const phyRaw = Math.min(accountAgeYears * 7, 22) + Math.min(ownRepos.length, 18) * 1.2 + user.followers * 1;
  const phy = clamp(23 + phyRaw);

  // ── OVR — Weighted for CAM position ──
  const ovr = clamp(
    Math.round(dri * 0.22 + pas * 0.17 + pac * 0.18 + sho * 0.16 + phy * 0.14 + def * 0.13)
  );

  // ── Attributes ──
  const skillMoves = Math.min(5, Math.max(1, uniqueLanguages));
  const weakFootAvg = [pac, sho, pas, dri, def, phy].sort((a, b) => a - b).slice(0, 3);
  const weakFoot = Math.min(5, Math.max(1, Math.round(weakFootAvg.reduce((a, b) => a + b, 0) / weakFootAvg.length / 20)));

  const attackWork = recentCommits + totalStars * 3;
  const defenseWork = issueEvents + prEvents + reviewEvents;
  const atkRate = attackWork > 25 ? 'High' : attackWork > 8 ? 'Med' : 'Low';
  const defRate = defenseWork > 10 ? 'High' : defenseWork > 3 ? 'Med' : 'Low';

  // Recent burst detection
  const recentWeek = events.filter(
    (e) => e.type === 'PushEvent' && now - new Date(e.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;
  const playStyle = recentWeek > 5 ? 'Explosive' : recentCommits > 20 ? 'Consistent' : freshRepos > 5 ? 'Creative' : 'Emerging';

  return {
    pac, sho, pas, dri, def, phy, ovr,
    topLanguage, languages, uniqueLanguages,
    totalStars, totalForks, recentCommits, accountAgeYears,
    ownRepos, user, freshRepos,
    skillMoves, weakFoot, atkRate, defRate, playStyle,
  };
}

// ─── Position & Tier ────────────────────────────────────────
const POSITIONS = {
  Java: 'CAM', JavaScript: 'RW', TypeScript: 'CF', Python: 'CDM',
  C: 'CB', 'C++': 'CB', 'C#': 'CM', Go: 'CM', Rust: 'CB',
  PHP: 'LM', Ruby: 'LW', Swift: 'ST', Kotlin: 'AM', HTML: 'RB',
  CSS: 'LB', Dart: 'RW', R: 'GK', Shell: 'CDM', Jupyter: 'GK',
};

function getPosition(lang) {
  return POSITIONS[lang] || 'CAM';
}

function getArchetype(lang, numLangs) {
  if (numLangs >= 4) return 'Fantasista';
  const map = {
    Java: 'Architect', JavaScript: 'Speedster', TypeScript: 'Playmaker',
    Python: 'Strategist', 'C++': 'Tank', Go: 'Engine', Rust: 'Sentinel',
    HTML: 'Creator', CSS: 'Artist', Ruby: 'Craftsman',
  };
  return map[lang] || 'Versatile';
}

function getCardTier(ovr) {
  if (ovr >= 85) return {
    name: 'ICON', bg1: '#1e1638', bg2: '#0d0a1e',
    border: '#e6c200', text: '#e6c200', secondary: '#ffe066', glow: 'rgba(230,194,0,0.35)',
  };
  if (ovr >= 75) return {
    name: 'GOLD', bg1: '#c9a92c', bg2: '#a08520',
    border: '#e8d44d', text: '#4a3d0a', secondary: '#fff5a0', glow: 'rgba(232,212,77,0.35)',
  };
  if (ovr >= 65) return {
    name: 'SILVER', bg1: '#8fa3b5', bg2: '#6d8494',
    border: '#a0b4c4', text: '#1e2c38', secondary: '#d0dde6', glow: 'rgba(138,155,174,0.35)',
  };
  return {
    name: 'BRONZE', bg1: '#c8903c', bg2: '#9a6a22',
    border: '#cd7f32', text: '#3a2717', secondary: '#F0CFA8', glow: 'rgba(205,127,50,0.35)',
  };
}

// ─── SVG Card Generation ────────────────────────────────────
function generateCardSVG(stats, avatarDataUri) {
  const { pac, sho, pas, dri, def, phy, ovr, topLanguage } = stats;
  const tier = getCardTier(ovr);
  const position = getPosition(topLanguage);
  const lastName = CONFIG.displayName.split(' ').pop().toUpperCase();

  // Stat formatting helper
  const pad = (n) => String(n).padStart(2, ' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="460" viewBox="0 0 320 460">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="320" y2="460" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${tier.bg1}"/>
      <stop offset="100%" stop-color="${tier.bg2}"/>
    </linearGradient>
    <linearGradient id="sh" x1="0" y1="0" x2="280" y2="180" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="rgba(255,255,255,0.16)"/>
      <stop offset="45%" stop-color="rgba(255,255,255,0.03)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
    <radialGradient id="ag" cx="185" cy="130" r="95" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${tier.glow}"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <radialGradient id="og" cx="48" cy="75" r="38" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${tier.glow}"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <clipPath id="ac"><ellipse cx="188" cy="125" rx="72" ry="82"/></clipPath>
    <clipPath id="cc"><rect x="6" y="6" width="308" height="448" rx="14"/></clipPath>
    <style>
      @keyframes shimmer{0%,100%{opacity:.12}50%{opacity:.32}}
      @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
      .shim{animation:shimmer 5s ease-in-out infinite}
      .pul{animation:pulse 3s ease-in-out infinite}
      .vb{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif}
      .vn{font-family:'Segoe UI Condensed','Arial Narrow','Roboto Condensed',sans-serif}
    </style>
  </defs>

  <!-- shadow -->
  <rect x="10" y="12" width="306" height="446" rx="18" fill="rgba(0,0,0,0.35)" opacity=".6"/>

  <!-- card body -->
  <rect x="6" y="6" width="308" height="448" rx="16" fill="url(#bg)" stroke="${tier.border}" stroke-width="1.5"/>

  <!-- shine -->
  <rect x="6" y="6" width="308" height="448" rx="16" fill="url(#sh)" class="shim"/>

  <!-- inner border -->
  <rect x="18" y="18" width="284" height="424" rx="11" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width=".5"/>

  <!-- avatar glow -->
  <ellipse cx="188" cy="130" rx="95" ry="100" fill="url(#ag)" opacity=".7"/>

  <!-- avatar -->${avatarDataUri ? `
  <g clip-path="url(#ac)">
    <image href="${avatarDataUri}" x="104" y="32" width="168" height="192" preserveAspectRatio="xMidYMid slice"/>
  </g>
  <!-- avatar fade -->
  <ellipse cx="188" cy="125" rx="72" ry="82" fill="none" stroke="url(#bg)" stroke-width="8" opacity=".25"/>` : ''}

  <!-- ── OVR panel ── -->
  <ellipse cx="48" cy="75" rx="34" ry="34" fill="url(#og)" opacity=".5"/>
  <text x="48" y="90" class="vb" font-size="50" font-weight="900" fill="${tier.text}" text-anchor="middle">${ovr}</text>
  <text x="48" y="113" class="vn" font-size="19" font-weight="700" fill="${tier.text}" text-anchor="middle" letter-spacing=".1em">${position}</text>

  <!-- divider under pos -->
  <line x1="28" y1="121" x2="68" y2="121" stroke="${tier.text}" stroke-width=".5" opacity=".35"/>

  <!-- India flag -->
  <g transform="translate(33,128)">
    <rect width="30" height="6.5" rx="1.5" fill="#FF9933"/>
    <rect y="6.5" width="30" height="6.5" fill="#FFFFFF"/>
    <rect y="13" width="30" height="6.5" rx="1.5" fill="#138808"/>
    <circle cx="15" cy="9.75" r="2.8" fill="none" stroke="#000080" stroke-width=".45"/>
  </g>

  <!-- divider under flag -->
  <line x1="28" y1="155" x2="68" y2="155" stroke="${tier.text}" stroke-width=".5" opacity=".35"/>

  <!-- top language -->
  <text x="48" y="172" class="vn" font-size="12" font-weight="600" fill="${tier.text}" text-anchor="middle" opacity=".65">${topLanguage}</text>

  <!-- ── NAME ── -->
  <line x1="48" y1="238" x2="272" y2="238" stroke="${tier.text}" stroke-width=".5" opacity=".3"/>
  <text x="160" y="268" class="vb" font-size="34" font-weight="900" fill="${tier.text}" text-anchor="middle" letter-spacing=".14em">${lastName}</text>
  <line x1="48" y1="278" x2="272" y2="278" stroke="${tier.text}" stroke-width=".5" opacity=".3"/>

  <!-- ── STATS ── -->
  <!-- left col -->
  <text x="80" y="310" class="vb" font-size="22" font-weight="800" fill="${tier.text}" text-anchor="end">${pad(pac)}</text>
  <text x="86" y="310" class="vn" font-size="18" font-weight="500" fill="${tier.text}" letter-spacing=".05em" opacity=".65">PAC</text>

  <text x="80" y="338" class="vb" font-size="22" font-weight="800" fill="${tier.text}" text-anchor="end">${pad(sho)}</text>
  <text x="86" y="338" class="vn" font-size="18" font-weight="500" fill="${tier.text}" letter-spacing=".05em" opacity=".65">SHO</text>

  <text x="80" y="366" class="vb" font-size="22" font-weight="800" fill="${tier.text}" text-anchor="end">${pad(pas)}</text>
  <text x="86" y="366" class="vn" font-size="18" font-weight="500" fill="${tier.text}" letter-spacing=".05em" opacity=".65">PAS</text>

  <!-- right col -->
  <text x="212" y="310" class="vb" font-size="22" font-weight="800" fill="${tier.text}" text-anchor="end">${pad(dri)}</text>
  <text x="218" y="310" class="vn" font-size="18" font-weight="500" fill="${tier.text}" letter-spacing=".05em" opacity=".65">DRI</text>

  <text x="212" y="338" class="vb" font-size="22" font-weight="800" fill="${tier.text}" text-anchor="end">${pad(def)}</text>
  <text x="218" y="338" class="vn" font-size="18" font-weight="500" fill="${tier.text}" letter-spacing=".05em" opacity=".65">DEF</text>

  <text x="212" y="366" class="vb" font-size="22" font-weight="800" fill="${tier.text}" text-anchor="end">${pad(phy)}</text>
  <text x="218" y="366" class="vn" font-size="18" font-weight="500" fill="${tier.text}" letter-spacing=".05em" opacity=".65">PHY</text>

  <!-- center divider -->
  <line x1="160" y1="293" x2="160" y2="372" stroke="${tier.text}" stroke-width=".4" opacity=".2"/>

  <!-- row dividers -->
  <line x1="55" y1="317" x2="133" y2="317" stroke="${tier.text}" stroke-width=".25" opacity=".13"/>
  <line x1="55" y1="345" x2="133" y2="345" stroke="${tier.text}" stroke-width=".25" opacity=".13"/>
  <line x1="187" y1="317" x2="262" y2="317" stroke="${tier.text}" stroke-width=".25" opacity=".13"/>
  <line x1="187" y1="345" x2="262" y2="345" stroke="${tier.text}" stroke-width=".25" opacity=".13"/>

  <!-- ── FOOTER ── -->
  <line x1="38" y1="394" x2="282" y2="394" stroke="${tier.text}" stroke-width=".3" opacity=".18"/>

  <text x="38" y="416" class="vn" font-size="9" font-weight="700" fill="${tier.text}" letter-spacing=".14em" opacity=".45">POWERED BY GITHUB</text>
  <text x="282" y="416" class="vn" font-size="9" font-weight="700" fill="${tier.text}" text-anchor="end" letter-spacing=".14em" opacity=".45">@${CONFIG.username}</text>

  <!-- tier label -->
  <text x="160" y="440" class="vn pul" font-size="11" font-weight="800" fill="${tier.secondary}" text-anchor="middle" letter-spacing=".22em" opacity=".55">${tier.name}</text>
</svg>`;
}

// ─── README Generation ──────────────────────────────────────
function generateREADME(stats) {
  const {
    ovr, topLanguage, languages, uniqueLanguages, totalStars, totalForks,
    ownRepos, user, skillMoves, weakFoot, atkRate, defRate, playStyle, recentCommits
  } = stats;

  const tier = getCardTier(ovr);
  const position = getPosition(topLanguage);
  const archetype = getArchetype(topLanguage, uniqueLanguages);
  const now = new Date().toISOString();

  // Stars helper
  const stars = (n, max = 5) => '★'.repeat(n) + '☆'.repeat(max - n);

  const nameUpper = encodeURIComponent(CONFIG.displayName.toUpperCase());
  const statsString = `${ovr} OVR · ${position} · ${archetype.toUpperCase()} · ONE TO WATCH 🌟`;
  const encodedStats = encodeURIComponent(statsString);

  // Language icons for skillicons.dev
  const langIconMap = {
    Java: 'java', JavaScript: 'js', TypeScript: 'ts', Python: 'py',
    HTML: 'html', CSS: 'css', 'C++': 'cpp', C: 'c', 'C#': 'cs',
    Go: 'go', Rust: 'rust', Ruby: 'ruby', PHP: 'php', Swift: 'swift',
    Kotlin: 'kotlin', Dart: 'dart', Shell: 'bash', R: 'r',
  };
  const langIcons = languages
    .slice(0, 14)
    .map(([l]) => langIconMap[l])
    .filter(Boolean)
    .join(',');
    
  const activeDays = Math.min(365, recentCommits * 2 + 5); // Approximate active days for stats
  const contributions = recentCommits + (user.public_repos * 3) + 12; // Approximate contributions

  let md = '';

  md += `<div align="center">\n\n`;

  // ──────────────── ANIMATED HEADER ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- ⚽ ANIMATED HEADER — CINEMATIC INTRO                       -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,50:1a3a1a,100:39D353&height=220&section=header&text=${nameUpper}&fontSize=52&fontColor=F0CFA8&fontAlignY=35&desc=${encodedStats}&descSize=16&descColor=8b949e&descAlignY=55&animation=fadeIn" width="100%" alt="Header"/>\n\n`;
  md += `<br/>\n\n`;

  // ──────────────── TYPING ANIMATION ────────────────
  md += `<!-- ⚽ TYPING ANIMATION -->\n`;
  const topLangsStr = languages.slice(0,5).map(l => l[0].toUpperCase()).join(' | ');
  md += `<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=22&duration=3000&pause=1000&color=39D353&center=true&vCenter=true&width=600&height=40&lines=%E2%9A%BD+THE+MAGICIAN+%7C+POLYGLOT+DEVELOPER;${uniqueLanguages}+LANGUAGES+%C2%B7+${user.public_repos}+REPOS+%C2%B7+BUILDING+%F0%9F%94%A5;${encodeURIComponent(topLangsStr)}" alt="Typing SVG" />\n\n`;
  md += `<br/><br/>\n\n`;

  // ──────────────── THE CARD ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- ⚽ THE CARD — CENTERPIECE                                  -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<a href="https://gitfut.com/Anandisah07">\n`;
  md += `<img src="https://gitfut.com/Anandisah07.png?country=in" width="280" alt="FIFA Card — ${CONFIG.displayName}"/>\n`;
  md += `</a>\n\n`;
  md += `<br/>\n\n`;
  md += `<sub>⚽ <i>Card generated by GitFut</i></sub>\n\n`;
  md += `</div>\n\n`;
  md += `---\n\n`;

  // ──────────────── SCOUT REPORT ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- ⚽ SCOUT REPORT — ATTRIBUTES & PLAYSTYLES                  -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<div align="center">\n\n`;
  md += `## 📋 SCOUT REPORT\n\n`;
  md += `</div>\n\n`;

  md += `<table align="center">\n`;
  md += `<tr>\n`;
  md += `<td width="50%" valign="top">\n\n`;
  md += `### 🧬 ATTRIBUTES\n\n`;
  md += `| | |\n`;
  md += `|:---|---:|\n`;
  md += `| 🤹 **Skill Moves** | ${stars(skillMoves)} |\n`;
  md += `| 🦶 **Weak Foot** | ${stars(weakFoot)} |\n`;
  md += `| 🔋 **Work Rate** | \`${atkRate} / ${defRate}\` |\n`;
  md += `| 🎯 **Style** | \`${playStyle.toUpperCase()}\` |\n\n`;
  md += `</td>\n`;
  md += `<td width="50%" valign="top">\n\n`;
  md += `### 📈 SCOUTING METRICS\n\n`;
  md += `| Metric | Value |\n`;
  md += `|:---|---:|\n`;
  md += `| 💻 **Commits** | \`${recentCommits}\` |\n`;
  md += `| 👥 **Followers** | \`${user.followers}\` |\n`;
  md += `| 🗣️ **Languages** | \`${uniqueLanguages}\` |\n`;
  md += `| 🔨 **Contributions** | \`${contributions}\` |\n`;
  md += `| 🗓️ **Account Age** | \`${stats.accountAgeYears.toFixed(1)} yrs\` |\n`;
  md += `| ⚡ **Active Days** | \`${activeDays}\` |\n`;
  md += `| 📂 **Repositories** | \`${user.public_repos}\` |\n\n`;
  md += `</td>\n`;
  md += `</tr>\n`;
  md += `</table>\n\n`;

  md += `<div align="center">\n\n`;
  md += `### 🥇 PLAYSTYLES\n\n`;
  if (uniqueLanguages >= 4) {
    md += `<img src="https://img.shields.io/badge/🔮_Polyglot+-F0CFA8?style=for-the-badge&labelColor=0d1117" alt="Polyglot+"/>\n`;
    md += `<sub>&nbsp;&nbsp;${uniqueLanguages} languages — elite tier</sub>\n`;
  } else {
    md += `<img src="https://img.shields.io/badge/🎯_Specialist+-F0CFA8?style=for-the-badge&labelColor=0d1117" alt="Specialist"/>\n`;
    md += `<sub>&nbsp;&nbsp;Elite focus on ${topLanguage}</sub>\n`;
  }
  md += `\n<br/><br/>\n\n`;
  
  md += `### 📊 DISTRIBUTION\n\n`;
  md += `<img src="https://img.shields.io/badge/TOP_10%25-of_GitHub-39D353?style=flat-square&labelColor=0d1117" alt="Top 10%"/>\n`;
  md += `&nbsp;\n`;
  md += `<img src="https://img.shields.io/badge/OVR_${ovr}-active_devs-F0CFA8?style=flat-square&labelColor=0d1117" alt="OVR"/>\n\n`;
  md += `</div>\n\n`;
  md += `---\n\n`;

  // ──────────────── TECH STACK ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- 🛠️ TECH STACK                                              -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<div align="center">\n\n`;
  md += `## 🛠️ TECH STACK\n\n`;
  if (langIcons) {
    md += `<img src="https://skillicons.dev/icons?i=${langIcons},git,github,vscode,linux&perline=7" alt="Tech Stack"/>\n\n`;
  }
  md += `</div>\n\n`;
  md += `---\n\n`;

  // ──────────────── MATCH STATS ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- 📊 MATCH STATS — LIVE UPDATING                             -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<div align="center">\n\n`;
  md += `## 📊 MATCH STATS\n\n`;
  md += `<br/>\n\n`;
  
  md += `<table align="center" border="0">\n`;
  md += `<tr>\n`;
  md += `<td>\n`;
  md += `<a href="https://github.com/${CONFIG.username}">\n`;
  md += `  <img src="https://github-stats-extended.vercel.app/api?username=${CONFIG.username}&show_icons=true&theme=dark&bg_color=0d1117&title_color=F0CFA8&text_color=c9d1d9&icon_color=39D353&border_color=30363d&hide_border=false&count_private=true&include_all_commits=true" alt="GitHub Stats"/>\n`;
  md += `</a>\n`;
  md += `</td>\n`;
  md += `<td>\n`;
  md += `<a href="https://github.com/${CONFIG.username}">\n`;
  md += `  <img src="https://streak-stats.demolab.com?user=${CONFIG.username}&theme=dark&background=0d1117&ring=F0CFA8&fire=F0CFA8&currStreakLabel=F0CFA8&sideLabels=c9d1d9&sideNums=c9d1d9&dates=8b949e&border=30363d" alt="GitHub Streak"/>\n`;
  md += `</a>\n`;
  md += `</td>\n`;
  md += `</tr>\n`;
  md += `</table>\n\n`;
  md += `<br/><br/>\n\n`;
  
  md += `<!-- Top Languages -->\n`;
  md += `<img src="https://github-stats-extended.vercel.app/api/top-langs/?username=${CONFIG.username}&layout=compact&theme=dark&bg_color=0d1117&title_color=F0CFA8&text_color=c9d1d9&border_color=30363d&hide_border=false&langs_count=10" alt="Top Languages"/>\n\n`;
  md += `</div>\n\n`;
  md += `---\n\n`;

  // ──────────────── CONTRIBUTION GRAPH ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- 📈 CONTRIBUTION GRAPH — LIVE                               -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<div align="center">\n\n`;
  md += `## 📈 CONTRIBUTION GRAPH\n\n`;
  md += `<img src="https://github-readme-activity-graph.vercel.app/graph?username=${CONFIG.username}&bg_color=0d1117&color=F0CFA8&line=39D353&point=F0CFA8&area_color=39D353&area=true&hide_border=false&custom_title=${nameUpper}'s%20Contribution%20Graph" width="95%" alt="Contribution Graph"/>\n\n`;
  md += `</div>\n\n`;
  md += `---\n\n`;

  // ──────────────── SNAKE ANIMATION ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- 🐍 SNAKE ANIMATION — UPDATED ON EVERY PUSH                 -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<div align="center">\n\n`;
  md += `## 🐍 WATCH MY CONTRIBUTIONS GET EATEN\n\n`;
  md += `<picture>\n`;
  md += `  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/${CONFIG.username}/${CONFIG.username}/output/github-snake-dark.svg" />\n`;
  md += `  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/${CONFIG.username}/${CONFIG.username}/output/github-snake.svg" />\n`;
  md += `  <img alt="Snake animation" src="https://raw.githubusercontent.com/${CONFIG.username}/${CONFIG.username}/output/github-snake-dark.svg" />\n`;
  md += `</picture>\n\n`;
  md += `</div>\n\n`;
  md += `---\n\n`;

  // ──────────────── CONNECT ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- 🔗 CONNECT                                                 -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<div align="center">\n\n`;
  md += `### 🤝 Connect with me\n\n`;
  
  if (CONFIG.portfolioUrl) {
    md += `[![Portfolio](https://img.shields.io/badge/Portfolio-Website-0A66C2?style=for-the-badge&logo=google-chrome&logoColor=white)](${CONFIG.portfolioUrl})\n`;
  }
  md += `[![GitHub](https://img.shields.io/badge/GitHub-${CONFIG.username}-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/${CONFIG.username})\n\n`;
  
  md += `<br/>\n\n`;
  md += `<img src="https://komarev.com/ghpvc/?username=${CONFIG.username}&style=for-the-badge&color=F0CFA8&label=PROFILE+VIEWS" alt="Profile Views"/>\n\n`;
  md += `<br/><br/>\n\n`;
  md += `</div>\n\n`;

  // ──────────────── FOOTER ────────────────
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n`;
  md += `<!-- 🏁 FOOTER                                                  -->\n`;
  md += `<!-- ═══════════════════════════════════════════════════════════ -->\n\n`;
  md += `<img src="https://capsule-render.vercel.app/api?type=waving&color=0:39D353,50:1a3a1a,100:0d1117&height=120&section=footer" width="100%" alt="Footer"/>\n`;

  return md;
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('🎮 Fetching GitHub data...');
  const data = await fetchGitHubData();
  console.log(`   ✓ User: ${data.user.login} (${data.user.name})`);
  console.log(`   ✓ Repos: ${data.repos.length} (${data.repos.filter(r => !r.fork).length} original)`);
  console.log(`   ✓ Events: ${data.events.length}`);

  console.log('📊 Computing stats...');
  const stats = computeStats(data);
  console.log(`   ✓ OVR: ${stats.ovr} (${getCardTier(stats.ovr).name})`);
  console.log(`   ✓ PAC:${stats.pac} SHO:${stats.sho} PAS:${stats.pas} DRI:${stats.dri} DEF:${stats.def} PHY:${stats.phy}`);
  console.log(`   ✓ Top language: ${stats.topLanguage} (${stats.uniqueLanguages} unique)`);

  console.log('🎨 Fetching avatar...');
  const avatarUrl = data.user.avatar_url.includes('?') 
    ? data.user.avatar_url + '&s=400' 
    : data.user.avatar_url + '?s=400';
  const avatarUri = await fetchAvatarBase64(avatarUrl);
  console.log(`   ✓ Avatar: ${avatarUri ? 'embedded' : 'skipped'}`);

  console.log('🃏 Generating card SVG...');
  const svg = generateCardSVG(stats, avatarUri);
  const svgPath = path.join(__dirname, '..', 'card.svg');
  fs.writeFileSync(svgPath, svg, 'utf-8');
  console.log(`   ✓ Saved: ${svgPath}`);

  console.log('📝 Generating README...');
  const readme = generateREADME(stats);
  const readmePath = path.join(__dirname, '..', 'README.md');
  fs.writeFileSync(readmePath, readme, 'utf-8');
  console.log(`   ✓ Saved: ${readmePath}`);

  console.log('✅ Done! Profile updated.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
