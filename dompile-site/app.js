const commands = {
  bundle: {
    title: 'Bundle your web source',
    description: 'Give Dompile your HTML, CSS, and JavaScript. It brings the pieces together in one DTML document.',
    code: 'node dompile.js -h index.html styles.css app.js -o site.dtml',
    result: 'Ready when you are'
  },
  website: {
    title: 'Compile a browser-ready website',
    description: 'Turn your DTML source into a standard HTML file that you can open locally or publish to a static host.',
    code: 'node dompile.js --website site.dtml -o index.html',
    result: 'HTML, ready for the browser'
  },
  app: {
    title: 'Create a desktop app starter',
    description: 'Generate an Electron project around your page, with context isolation and sandboxing enabled by default.',
    code: 'node dompile.js --application site.dtml -o desktop-app',
    result: 'A desktop project, ready to install'
  },
  check: {
    title: 'Check the document',
    description: 'Review tag nesting, duplicate IDs, fragment links, and common accessibility and security issues.',
    code: 'node dompile.js --check site.dtml --strict',
    result: 'Clear structure. Confident next step.'
  }
};

const tabs = [...document.querySelectorAll('.command-tab')];
const title = document.querySelector('#command-title');
const description = document.querySelector('#command-description');
const code = document.querySelector('#command-code');
const terminalResult = document.querySelector('#terminal-result');
const panel = document.querySelector('#command-panel');

function selectCommand(tab, moveFocus = false) {
  const item = commands[tab.dataset.command];
  if (!item) return;
  tabs.forEach(button => {
    const selected = button === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  panel.classList.remove('changing');
  requestAnimationFrame(() => {
    title.textContent = item.title;
    description.textContent = item.description;
    code.textContent = item.code;
    terminalResult.textContent = item.result;
    panel.classList.add('changing');
  });
  if (moveFocus) tab.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectCommand(tab));
  tab.addEventListener('keydown', event => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    selectCommand(tabs[next], true);
  });
});

async function copyText(text, button, success = 'Copied') {
  const original = button.textContent;
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (!copied) throw new Error('Clipboard copy is unavailable');
    }
    button.textContent = success;
    button.setAttribute('aria-live', 'polite');
    window.setTimeout(() => { button.textContent = original; }, 1500);
  } catch {
    button.textContent = 'Select & copy';
    window.setTimeout(() => { button.textContent = original; }, 1800);
  }
}

document.querySelector('.copy-command').addEventListener('click', event => copyText(code.textContent, event.currentTarget));
document.querySelector('.copy-install').addEventListener('click', event => copyText('node dompile.js --help', event.currentTarget));

const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  nav.classList.toggle('open', open);
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
}));

const sections = [...document.querySelectorAll('main section[id]')];
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      document.querySelectorAll('.main-nav a').forEach(link => {
        link.classList.toggle('current', link.hash === `#${entry.target.id}`);
      });
    }
  }, { rootMargin: '-25% 0px -65% 0px' });
  sections.forEach(section => observer.observe(section));
}
