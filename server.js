const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const STATE_FILE = path.join(__dirname, 'state.json');

// ESPN 3-letter abbreviation → app team key
const ESPN = {
  MEX:'mexico', RSA:'south_africa', KOR:'south_korea', CZE:'czechia',
  CAN:'canada', BIH:'bosnia', QAT:'qatar', SUI:'switzerland',
  BRA:'brazil', MAR:'morocco', HAI:'haiti', HTI:'haiti', SCO:'scotland',
  USA:'usa', PAR:'paraguay', AUS:'australia', TUR:'turkey',
  GER:'germany', CUW:'curacao', CIV:'ivory_coast', ECU:'ecuador',
  NED:'netherlands', JPN:'japan', SWE:'sweden', TUN:'tunisia',
  BEL:'belgium', EGY:'egypt', IRN:'iran', NZL:'new_zealand',
  ESP:'spain', CPV:'cabo_verde', KSA:'saudi_arabia', SAU:'saudi_arabia', URU:'uruguay',
  FRA:'france', SEN:'senegal', IRQ:'iraq', NOR:'norway',
  ARG:'argentina', ALG:'algeria', AUT:'austria', JOR:'jordan',
  POR:'portugal', COD:'dr_congo', UZB:'uzbekistan', COL:'colombia',
  ENG:'england', CRO:'croatia', GHA:'ghana', PAN:'panama'
};

// All group-stage dates (June 11 – July 6 2026)
const STAGE_DATES = [];
for (let d = new Date('2026-06-11'); d <= new Date('2026-07-06'); d.setDate(d.getDate() + 1)) {
  STAGE_DATES.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
}

let results = {};       // { "mexico_south_africa": {h:2,a:0}, ... }
let lastFetch = 0;

async function fetchResults() {
  const now = Date.now();
  if (now - lastFetch < 60_000) return;
  lastFetch = now;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const past = STAGE_DATES.filter(d => d <= today);
  const fresh = {};

  for (const date of past) {
    try {
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`
      );
      const data = await r.json();
      for (const ev of data.events || []) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        const status = comp.status?.type?.name;
        if (status !== 'STATUS_FULL_TIME' && status !== 'STATUS_FINAL') continue;
        const home = comp.competitors?.find(c => c.homeAway === 'home');
        const away = comp.competitors?.find(c => c.homeAway === 'away');
        if (!home || !away) continue;
        const hk = ESPN[home.team.abbreviation];
        const ak = ESPN[away.team.abbreviation];
        if (!hk || !ak) continue;
        fresh[`${hk}_${ak}`] = { h: parseInt(home.score), a: parseInt(away.score) };
      }
    } catch (_) {}
  }
  results = fresh;
}

fetchResults();
setInterval(fetchResults, 2 * 60_000);

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {}
  return { players: ['אור', 'ליהי', 'גל', 'איתי'], preds: {} };
}

let state = loadState();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (_req, res) => res.json(state));

app.post('/api/state', (req, res) => {
  state = req.body;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (_) {}
  res.json({ ok: true });
});

app.get('/api/results', async (_req, res) => {
  await fetchResults();
  res.json(results);
});

app.listen(process.env.PORT || 3000);
