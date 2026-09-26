const { chromium } = require(process.env.PW);
const fs = require('fs');
// 16x16 pixel art: teal tile, dotted white trail winding up to an amber flag
const GRID = [
  '..DDDDDDDDDDDD..',
  '.DTTTTTTTTTTTTD.',
  'DTTTTTTTTTWYYYTD',
  'DTTTTTTTTTWYYYYD',
  'DTTTTTTTTTWYYTTD',
  'DTTTTTTTTTWTTTTD',
  'DTTTTTTTWWWWTTTD',
  'DTTTTTTWWTTTTTTD',
  'DTTTTTTTTTTTTTTD',
  'DTTTTWWTTTTTTTTD',
  'DTTTWWTTTTTTTTTD',
  'DTTTTTTTTTTTTTTD',
  'DTTTWWTTTTTTTTTD',
  'DTTTTWWWTTTTTTTD',
  '.DTTTTTTTTTTTTD.',
  '..DDDDDDDDDDDD..'
];
const COLORS = { D: '#0b4f4a', T: '#0f766e', W: '#ffffff', Y: '#f59e0b' };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage();
  for (const size of [16, 32, 48, 128, 256]) {
    const data = await p.evaluate(({ GRID, COLORS, size }) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d'); const s = size / 16;
      GRID.forEach((row, y) => [...row].forEach((ch, x) => {
        if (COLORS[ch]) { ctx.fillStyle = COLORS[ch]; ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.ceil(s), Math.ceil(s)); }
      }));
      return c.toDataURL('image/png');
    }, { GRID, COLORS, size });
    fs.writeFileSync(`${process.env.OUT}/icon${size}.png`, Buffer.from(data.split(',')[1], 'base64'));
  }
  // Preview sheet
  await p.setContent(`<body style="background:#eee;display:flex;gap:20px;align-items:end;padding:20px">${[16,32,48,128,256].map(s=>`<img src="file://${process.env.OUT}/icon${s}.png">`).join('')}
    <div style="background:#202124;padding:10px"><img src="file://${process.env.OUT}/icon16.png"> <img src="file://${process.env.OUT}/icon32.png"></div></body>`);
  await p.screenshot({ path: `${process.env.OUT}/preview.png` });
  await b.close();
})();
