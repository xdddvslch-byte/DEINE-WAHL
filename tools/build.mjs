#!/usr/bin/env node
/* DEINE WAHL — збірка даних. Без залежностей, лише Node 18+.
   node tools/build.mjs            перевірити сценарії → data/bundle.js, docs/stsenarii.md, dist/strict/
   node tools/build.mjs --check    лише перевірка (для автора сценарію або CI)
   node tools/build.mjs --scorm    те саме + пакет SCORM 1.2 для Moodle у dist/

   dist/strict/ — копії сценаріїв без розширення «podacha»: їх приймає zibraty.py організаторів без змін. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateScenario, strip } = require(path.join(ROOT, 'validate.js'));
const args = new Set(process.argv.slice(2));
const rel = p => path.join(ROOT, p);
const readJSON = p => JSON.parse(fs.readFileSync(rel(p), 'utf8'));

const normyFile = readJSON('data/normy.json');
const normy = Object.fromEntries(normyFile.normy.map(n => [n.id, n]));
const schema = readJSON('data/schema/stsenarii.schema.json');
let failed = false;

function loadSet(dir, minDepth, label) {
 const list = [];
 const ids = new Set();
 console.log(`\n${label}`);
 for (const file of readJSON(`${dir}/index.json`).stsenarii) {
  let s;
  try { s = readJSON(`${dir}/${file}`); }
  catch (e) { console.error(`✗ ${file}: не вдалося прочитати JSON — ${e.message}`); failed = true; continue; }
  const r = validateScenario(s, { normy, schema, minDepth });
  if (ids.has(s.id)) r.errors.push(`id ${s.id} повторюється.`);
  ids.add(s.id);
  console.log(`${r.errors.length ? '✗' : '✓'} ${file}: ${r.paths} маршрутів, етапів ${r.minDepth}–${r.depth}`);
  r.errors.forEach(e => console.log(`   помилка: ${e}`));
  r.warnings.forEach(w => console.log(`   увага: ${w}`));
  if (r.errors.length) failed = true;
  list.push({ file, s, r });
 }
 return list;
}
const team = loadSet('data/stsenarii', 3, 'Сценарії команди (щонайменше 3 етапи):');
const examples = loadSet('data/pryklady', 0, 'Приклади формату від організаторів (лише для демонстрації сумісності):');
const clash = team.filter(t => examples.some(e => e.s.id === t.s.id));
if (clash.length) { console.error(`✗ id збігаються з прикладами: ${clash.map(c => c.s.id).join(', ')}`); failed = true; }
if (failed) { console.error('\nЗбірку зупинено: виправте помилки вище.'); process.exit(1); }
if (args.has('--check')) process.exit(0);

/* 1. Bundle для офлайн-запуску (file://, Electron, SCORM) */
const bundle = `/* Згенеровано tools/build.mjs з data/*.json — не редагуйте вручну. */\nwindow.DW_DATA = ${JSON.stringify({
 normy: normyFile, schema, stsenarii: team.map(t => t.s), pryklady: examples.map(t => t.s)
})};\n`;
fs.writeFileSync(rel('data/bundle.js'), bundle);
console.log(`\n→ data/bundle.js (${(bundle.length / 1024).toFixed(0)} КБ)`);

/* 2. Строгі копії для zibraty.py організаторів */
fs.mkdirSync(rel('dist/strict'), { recursive: true });
team.forEach(t => fs.writeFileSync(rel(`dist/strict/${t.file}`), JSON.stringify(strip(t.s), null, 2) + '\n'));
console.log('→ dist/strict/ — сценарії без «podacha» для перевірки zibraty.py організаторів');

/* 3. Карта рішень і логіка оцінювання */
const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
const esc = t => t.replace(/["«»]/g, '\'');
const short = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
const REV = { 'не проведено': 'не проведено', 'проведено': '✓ проведено', 'проведено із зауваженнями': '✓ із зауваженнями' };
let md = `# Сценарії і логіка оцінювання\n\n> Згенеровано \`node tools/build.mjs\` з \`data/stsenarii/*.json\`. Не редагуйте вручну — змініть JSON і перезберіть.\n\n`;
md += `## Логіка оцінювання (явні правила, без ШІ)\n\n`;
md += `- Кожен варіант має бали від −2 до +2 за трьома вимірами: **Д** — доброчесність, **Е** — ефективність, **Дв** — довіра (як у форматі організаторів). Поруч — текстове пояснення «чому такі бали».\n`;
md += `- Бал за вимір на маршруті = сума балів обраних варіантів. Виміри між собою **не додаються**: загального балу і «правильного» маршруту немає.\n`;
md += `- Наслідки двох видів: «одразу» (показується на наступному кроці) і «згодом» (відкладений, у розборі).\n`;
md += `- Режим тиску часу: якщо вийшов час, спрацьовує варіант \`podacha.inertsiia\`, заданий автором; якщо його немає — варіант із найвищою ефективністю, за рівності — з найнижчою доброчесністю (шлях найменшого опору).\n`;
md += `- Однакові вибори завжди дають однаковий розбір.\n\n`;
md += `| ID | Назва | Тема | Конфлікт цінностей | Етапів | Маршрутів | Норми | Фахівець ДЗПК | ШІ | Джерело |\n|---|---|---|---|---|---|---|---|---|---|\n`;
team.forEach(({ s, r }) => {
 md += `| ${s.id} | ${s.nazva} | ${s.tema} | ${s.tsinnosti_v_konflikti.map(c => `${c.tsinnist_a} ↔ ${c.tsinnist_b}`).join('; ')} | ${r.minDepth === r.depth ? r.depth : r.minDepth + '–' + r.depth} | ${r.paths} | ${s.normy.map(n => n.id).join(', ')} | ${REV[s.perevirka_zmistu.fakhivets_dzpk]} | ${s.shi.vykorystano ? 'так' : 'ні'} | ${short(s.dzherelo_vypadku.opys, 90)} |\n`;
});
team.forEach(({ s }) => {
 const hr = s.diiovi_osoby.find(x => x.hravets);
 md += `\n## ${s.id}. ${s.nazva}\n\n**Роль користувача:** ${hr.rol}. **Аудиторія:** ${s.audytoriia.join('; ')}. **Тривалість у груповому режимі:** ≈${s.tryvalist_khv} хв.\n\n${s.sytuatsiia}\n\n`;
 s.tsinnosti_v_konflikti.forEach(c => { md += `- **${c.tsinnist_a} ↔ ${c.tsinnist_b}.** ${c.poiasnennia}\n`; });
 md += '\n```mermaid\nflowchart LR\n';
 s.vuzly.forEach(v => { md += `  ${v.id}["${v.id}: ${esc(short((v.podacha && v.podacha.zagolovok) || v.zapytannia, 30))}"]\n`; });
 s.vuzly.forEach(v => v.varianty.forEach(x => {
  md += `  ${v.id} -->|"${x.id}: ${esc(short(x.tekst, 32))}<br/>Д${sign(x.baly.dobrochesnist)} Е${sign(x.baly.efektyvnist)} Дв${sign(x.baly.dovira)}"| ${x.nastupnyi_vuzol || 'fin((кінець))'}\n`;
 }));
 md += '```\n\n| Вузол | Варіант | Д | Е | Дв | Чому такі бали | Норми |\n|---|---|---|---|---|---|---|\n';
 s.vuzly.forEach(v => v.varianty.forEach(x => {
  md += `| ${v.id} | **${x.id}.** ${x.tekst.replace(/\|/g, '/')} | ${sign(x.baly.dobrochesnist)} | ${sign(x.baly.efektyvnist)} | ${sign(x.baly.dovira)} | ${x.chomu_taki_baly.replace(/\|/g, '/')} | ${x.normy.join(', ') || '—'} |\n`;
 }));
 md += `\n**Норми і застосування.**\n\n${s.normy.map(n => `- **${n.id}** (${normy[n.id].punkt.split(' — ')[0]}; ${normy[n.id].redaktsiia}) — ${n.yak_zastosovuietsia}`).join('\n')}\n\n**Застосовність.** ${s.zastosovnist}\n\n**Перевірка змісту.** Фахівець ДЗПК: ${s.perevirka_zmistu.fakhivets_dzpk}. ${s.perevirka_zmistu.prymitka} ШІ: ${s.shi.vykorystano ? `${s.shi.instrument} — ${s.shi.shcho_zrobleno} ${s.shi.perevirka_liudynoiu}` : 'не використовувався.'}\n`;
});
fs.mkdirSync(rel('docs'), { recursive: true });
fs.writeFileSync(rel('docs/stsenarii.md'), md);
console.log('→ docs/stsenarii.md');

/* 4. SCORM 1.2 */
if (args.has('--scorm')) {
 const files = ['index.html', 'style.css', 'fonts.css', 'app.js', 'fx.js', 'scorm.js', 'validate.js', 'data/bundle.js',
  ...walk('assets').filter(f => !f.endsWith('logo-original.png'))];
 const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="ua.deinewahl.trainer" version="1.0"
 xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
 <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
 <organizations default="dw">
  <organization identifier="dw"><title>DEINE WAHL — тренажер етичних рішень</title>
   <item identifier="i1" identifierref="r1" isvisible="true"><title>Етичні дилеми: ${team.length} сценарії</title></item>
  </organization>
 </organizations>
 <resources>
  <resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${files.map(f => `   <file href="${f}"/>`).join('\n')}
  </resource>
 </resources>
</manifest>
`;
 const entries = [{ name: 'imsmanifest.xml', data: Buffer.from(manifest) }, ...files.map(f => ({ name: f, data: fs.readFileSync(rel(f)) }))];
 const out = rel('dist/deine-wahl-scorm12.zip');
 fs.writeFileSync(out, zip(entries));
 console.log(`→ dist/deine-wahl-scorm12.zip (${(fs.statSync(out).size / 1024).toFixed(0)} КБ) — у Moodle: «Додати діяльність → Пакет SCORM»`);
}

function walk(dir) {
 return fs.readdirSync(rel(dir), { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]);
}

/* Мінімальний ZIP (deflate) без сторонніх бібліотек. */
function crc32(buf) {
 if (zlib.crc32) return zlib.crc32(buf) >>> 0;
 let c, crc = 0xFFFFFFFF;
 for (let n = 0; n < buf.length; n++) {
  c = (crc ^ buf[n]) & 0xFF;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  crc = (crc >>> 8) ^ c;
 }
 return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zip(entries) {
 const parts = [], central = [];
 let offset = 0;
 for (const { name, data } of entries) {
  const nameBuf = Buffer.from(name, 'utf8');
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
  parts.push(local, nameBuf, comp);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
  central.push(cen, nameBuf);
  offset += 30 + nameBuf.length + comp.length;
 }
 const cenBuf = Buffer.concat(central);
 const end = Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
 end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
 return Buffer.concat([...parts, cenBuf, end]);
}
