/* DEINE WAHL — SCORM 1.2 (Moodle та інші LMS).
   Свідомо передаємо в LMS лише факт проходження: cmi.core.lesson_status = "completed".
   Вибори, бали й голоси НЕ передаються — щоб результати не використовували для оцінки чи відбору людей.
   Поза LMS цей файл нічого не робить. */
(() => {
 'use strict';
 function findAPI(win) {
  for (let i = 0; win && i < 10; i++) {
   try { if (win.API) return win.API; } catch (e) { return null; }
   if (win.parent === win) break;
   win = win.parent;
  }
  return null;
 }
 let api = findAPI(window);
 try { if (!api && window.opener) api = findAPI(window.opener); } catch (e) { api = null; }
 let started = false, done = false;
 if (api) {
  try { const r = api.LMSInitialize(''); started = r === 'true' || r === true; } catch (e) { started = false; }
  if (started) {
   try { if (api.LMSGetValue('cmi.core.lesson_status') === 'not attempted') { api.LMSSetValue('cmi.core.lesson_status', 'incomplete'); api.LMSCommit(''); } } catch (e) { /* LMS без статусу */ }
   addEventListener('pagehide', () => { try { api.LMSFinish(''); } catch (e) { /* вже завершено */ } });
  }
 }
 window.DWScorm = {
  active: started,
  complete() {
   if (!started || done) return;
   done = true;
   try { api.LMSSetValue('cmi.core.lesson_status', 'completed'); api.LMSCommit(''); } catch (e) { /* ігноруємо */ }
  }
 };
})();
