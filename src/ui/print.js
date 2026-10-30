// Printing: the document on screen (an invoice, statement, receipt, order…) is copied into a
// clean print frame outside the app, so nothing of the page layout pushes it down the sheet.
// Page margins are drawn by the frame itself (@page margin is 0), which also stops the browser
// from printing its own header and footer (the page address, date and title).
export function initPrint() {
  if (typeof window === 'undefined' || window.__mzPrint) return;
  window.__mzPrint = true;
  let root = null;
  const before = () => {
    // The document on top (the last one opened); never the small logo preview in Settings.
    const docs = [...document.querySelectorAll('.print-doc:not(.in-print):not(.mini)')];
    const doc = docs[docs.length - 1];
    if (!doc) return;
    document.getElementById('print-root')?.remove();
    root = document.createElement('div');
    root.id = 'print-root';
    root.dir = doc.getAttribute('dir') || document.documentElement.dir;
    const space = () => '<tr><td><div class="pr-space"></div></td></tr>';
    root.innerHTML = `<table class="pr-frame"><thead>${space()}</thead><tfoot>${space()}</tfoot><tbody><tr><td class="pr-body"></td></tr></tbody></table>`;
    const copy = doc.cloneNode(true);
    copy.classList.add('in-print');
    root.querySelector('.pr-body').appendChild(copy);
    document.body.appendChild(root);
    document.documentElement.classList.add('printing');
  };
  const after = () => {
    root?.remove(); root = null;
    document.documentElement.classList.remove('printing');
  };
  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);
}
