/* DEINE WAHL — перевірка сценарію у форматі організаторів (+ розширення «podacha»).
   Один файл для браузера (імпорт сценарію викладачем) і для Node (tools/build.mjs).
   1) Схема: data/schema/stsenarii.schema.json — мінімальний валідатор, як у zibraty.py організаторів.
   2) Звʼязки: ті самі перевірки, що в zibraty.py (вузли, досяжність, норми, роль користувача, 3–4 варіанти на старті).
   3) Наші додаткові: цикли, мінімальна глибина маршрутів, «очевидно правильний» варіант, статус звірки норм, podacha.
   Повідомлення — простими реченнями, щоб їх міг прочитати автор без програміста. */
(function (root) {
'use strict';

const TYPES = {
 object: v => v !== null && typeof v === 'object' && !Array.isArray(v), array: Array.isArray, string: v => typeof v === 'string',
 boolean: v => typeof v === 'boolean', integer: Number.isInteger, number: v => typeof v === 'number', null: v => v === null
};
const AXES = ['dobrochesnist', 'efektyvnist', 'dovira'];

function schemaCheck(value, schema, rootSchema, path, out) {
 if (schema.$ref) schema = schema.$ref.slice(2).split('/').reduce((n, p) => n[p], rootSchema);
 if (schema.type) {
  const ts = [].concat(schema.type);
  if (!ts.some(t => TYPES[t](value))) { out.push(`${path}: очікувано ${ts.join(' або ')}.`); return; }
 }
 if (schema.const !== undefined && value !== schema.const) out.push(`${path}: має бути ${JSON.stringify(schema.const)}.`);
 if (schema.enum && !schema.enum.includes(value)) out.push(`${path}: «${value}» не з переліку: ${schema.enum.join(', ')}.`);
 if (typeof value === 'string') {
  if (schema.minLength && value.length < schema.minLength) out.push(`${path}: занадто короткий текст.`);
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${path}: «${value}» не відповідає шаблону ${schema.pattern}.`);
 }
 if (Number.isInteger(value)) {
  if (schema.minimum !== undefined && value < schema.minimum) out.push(`${path}: ${value} менше за ${schema.minimum}.`);
  if (schema.maximum !== undefined && value > schema.maximum) out.push(`${path}: ${value} більше за ${schema.maximum}.`);
 }
 if (Array.isArray(value)) {
  if (schema.minItems && value.length < schema.minItems) out.push(`${path}: потрібно щонайменше ${schema.minItems}.`);
  if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${path}: не більше ${schema.maxItems}.`);
  if (schema.items) value.forEach((it, i) => schemaCheck(it, schema.items, rootSchema, `${path}[${i}]`, out));
 }
 if (TYPES.object(value)) {
  (schema.required || []).forEach(k => { if (!(k in value)) out.push(`${path}: немає обовʼязкового поля «${k}».`); });
  const props = schema.properties || {};
  if (schema.additionalProperties === false) Object.keys(value).forEach(k => { if (!(k in props)) out.push(`${path}: зайве поле «${k}».`); });
  Object.keys(props).forEach(k => { if (k in value) schemaCheck(value[k], props[k], rootSchema, `${path}.${k}`, out); });
 }
}

/* opts: { normy: {id: норма}, schema, minDepth: 3 } */
function validateScenario(s, opts) {
 const errors = [], warnings = [];
 const o = opts || {};
 const normy = o.normy || {};
 const minDepth = o.minDepth === undefined ? 3 : o.minDepth;
 if (!TYPES.object(s)) return { errors: ['Файл не містить обʼєкта сценарію.'], warnings, depth: 0, minDepth: 0, paths: 0 };
 if (o.schema) schemaCheck(s, o.schema, o.schema, s.id || 'сценарій', errors);
 if (errors.length) return { errors, warnings, depth: 0, minDepth: 0, paths: 0 };

 const P = s.id;
 const vuzly = {};
 s.vuzly.forEach(v => { if (vuzly[v.id]) errors.push(`${P}: повторюваний id вузла ${v.id}.`); vuzly[v.id] = v; });
 const start = vuzly[s.pochatkovyi_vuzol];
 if (!start) { errors.push(`${P}: початкового вузла ${s.pochatkovyi_vuzol} немає.`); return { errors, warnings, depth: 0, minDepth: 0, paths: 0 }; }
 if (start.varianty.length < 3 || start.varianty.length > 4) errors.push(`${P}: у першому вузлі має бути 3–4 варіанти, маємо ${start.varianty.length}.`);
 const allVar = s.vuzly.flatMap(v => v.varianty.map(x => x.id));
 if (new Set(allVar).size !== allVar.length) errors.push(`${P}: повторювані id варіантів.`);
 const roles = s.diiovi_osoby.map(r => r.id);
 if (new Set(roles).size !== roles.length) errors.push(`${P}: повторювані id дійових осіб.`);
 if (s.diiovi_osoby.filter(r => r.hravets).length !== 1) errors.push(`${P}: має бути рівно одна роль користувача (hravets: true).`);

 // Норми
 const sNorm = new Set(s.normy.map(n => n.id));
 sNorm.forEach(n => {
  if (!normy[n]) errors.push(`${P}: норми ${n} немає в normy.json.`);
  else if (normy[n].status_zvirky === 'ne-zvireno') warnings.push(`${P}: норма ${n} має статус «не звірено» — не наводьте її як певну.`);
 });
 s.vuzly.forEach(vz => vz.varianty.forEach(v => v.normy.forEach(n => {
  if (!normy[n]) errors.push(`${P}: варіант ${v.id} посилається на відсутню норму ${n}.`);
  else if (!sNorm.has(n)) errors.push(`${P}: норма ${n} з варіанта ${v.id} не наведена в normy сценарію.`);
 })));

 // Граф: досяжність, цикли, глибина
 const seen = new Set();
 let paths = 0, dMin = Infinity, dMax = 0;
 (function walk(id, d, stack) {
  const v = vuzly[id];
  if (!v) return;
  if (stack.has(id)) { errors.push(`${P}: цикл через вузол ${id}.`); return; }
  seen.add(id); stack.add(id);
  v.varianty.forEach(x => {
   if (x.nastupnyi_vuzol === null) { paths++; dMin = Math.min(dMin, d); dMax = Math.max(dMax, d); }
   else if (!vuzly[x.nastupnyi_vuzol]) errors.push(`${P}: варіант ${x.id} веде до неіснуючого вузла ${x.nastupnyi_vuzol}.`);
   else if (paths < 2000) walk(x.nastupnyi_vuzol, d + 1, stack);
  });
  stack.delete(id);
 })(start.id, 1, new Set());
 Object.keys(vuzly).forEach(id => { if (!seen.has(id)) errors.push(`${P}: вузол ${id} недосяжний.`); });
 if (minDepth && dMax < minDepth) errors.push(`${P}: найдовший маршрут має ${dMax} етап(и); у сценаріях команди потрібно щонайменше ${minDepth} послідовні етапи.`);
 else if (minDepth && dMin < minDepth) warnings.push(`${P}: деякі маршрути коротші за ${minDepth} етапи (найкоротший — ${dMin}).`);

 // Без «очевидно правильного» варіанта: жоден не кращий за інші за всіма трьома вимірами
 s.vuzly.forEach(vz => {
  const vs = vz.varianty;
  vs.forEach((a, i) => {
   const dominates = vs.every((b, j) => i === j || (AXES.every(k => a.baly[k] >= b.baly[k]) && AXES.some(k => a.baly[k] > b.baly[k])));
   if (dominates && vs.length > 1) warnings.push(`${P}, вузол ${vz.id}: варіант ${a.id} кращий за інші за всіма трьома вимірами — дилема може виглядати очевидною.`);
  });
  const pd = vz.podacha;
  if (pd && pd.inertsiia && !vs.some(x => x.id === pd.inertsiia)) errors.push(`${P}, вузол ${vz.id}: podacha.inertsiia «${pd.inertsiia}» — такого варіанта у вузлі немає.`);
  if (pd && (pd.replika && !pd.khto)) warnings.push(`${P}, вузол ${vz.id}: є репліка, але не вказано, хто говорить (podacha.khto).`);
 });
 if (s.perevirka_zmistu.fakhivets_dzpk === 'не проведено') warnings.push(`${P}: перегляд фахівцем з питань запобігання корупції ще не проведено.`);

 return { errors, warnings, depth: dMax, minDepth: dMin === Infinity ? 0 : dMin, paths };
}

/* Строга копія для zibraty.py організаторів: без розширення podacha. */
function strip(s) {
 const c = JSON.parse(JSON.stringify(s));
 delete c.podacha; delete c.$schema;
 c.vuzly.forEach(v => delete v.podacha);
 return c;
}

const api = { validateScenario, strip, AXES };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.DWValidate = api;
})(typeof self !== 'undefined' ? self : this);
