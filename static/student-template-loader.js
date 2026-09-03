/* JOES STUDIO STUDENT TEMPLATE LOADER */
(function () {
  'use strict';

  const selector = '#templateGrid';
  const filePattern = /student_card_(\d{2})/i;

  function findTemplateId(card) {
    if (!card) return null;
    const explicit = card.dataset && (card.dataset.templateId || card.dataset.template);
    if (explicit && filePattern.test(explicit)) return explicit.match(filePattern)[0];
    const text = card.getAttribute('onclick') || card.textContent || '';
    const match = text.match(filePattern);
    return match ? match[0] : null;
  }

  function closeWelcome() {
    document.querySelectorAll('.modal-backdrop').forEach(el => {
      if (el.querySelector(selector) || el.textContent.includes('Templates') || el.textContent.includes('New Template')) {
        el.style.display = 'none';
        el.classList.add('hidden');
      }
    });
    document.querySelectorAll('[role="dialog"]').forEach(el => {
      if (el.querySelector(selector)) {
        el.style.display = 'none';
        el.classList.add('hidden');
      }
    });
  }

  function notify(message, error) {
    if (window.Toastify) {
      Toastify({text: message, duration: 2200, gravity:'top', position:'center', close:false}).showToast();
    } else if (error) console.error(message);
  }

  async function loadTemplate(id) {
    const url = './templates/' + id + '.json?template=' + Date.now();
    notify('Downloading template…');
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) throw new Error('Template request failed: ' + response.status);
    const blob = await response.blob();
    const text = await blob.text();
    const project = JSON.parse(text);

    // Give the browser a real download while the same payload is loaded into the editor.
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = id + '.json';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

    let loaded = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (window.App && window.App.io && typeof window.App.io.loadProjectData === 'function') {
        closeWelcome();
        await Promise.resolve(window.App.io.loadProjectData(project));
        loaded = true;
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    if (!loaded) throw new Error('Joes Studio canvas loader is not ready.');
    closeWelcome();
    notify('Template opened in canvas.');
  }

  document.addEventListener('click', function (event) {
    const grid = event.target.closest(selector);
    if (!grid) return;
    const card = event.target.closest('.template-card, [data-template-id], [data-template]');
    if (!card || !grid.contains(card)) return;
    const id = findTemplateId(card);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loadTemplate(id).catch(err => {
      console.error('[Joes Studio] template load failed', err);
      notify('Could not open this template.', true);
    });
  }, true);

  window.JoesStudioStudentTemplates = {load: loadTemplate};
})();
