// Play's own small pictures, drawn (never an emoji standing in for one): a
// race's marshal boards (the safety car's yellow SC board, the VSC board, the
// red flag), a pick's state on a ticket, a free bet's gift. Each comes as a
// span holding an inline SVG, sized by the class it's given.
const SVG = (body, view = '0 0 24 24') => `<svg viewBox="${view}" width="100%" height="100%" aria-hidden="true" focusable="false">${body}</svg>`;
const LINE = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  // The boards F1's marshals and screens show.
  f1sc: SVG('<rect x="1" y="5" width="30" height="22" rx="4" fill="#facc15"/><text x="16" y="21" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="13" font-weight="900" fill="#111">SC</text>', '0 0 32 32'),
  f1vsc: SVG('<rect x="1" y="5" width="30" height="22" rx="4" fill="#111" stroke="#facc15" stroke-width="2.2"/><text x="16" y="20.5" text-anchor="middle" font-family="-apple-system,Helvetica,Arial,sans-serif" font-size="10" font-weight="900" fill="#facc15">VSC</text>', '0 0 32 32'),
  f1red: SVG('<path d="M7 4v24" stroke="#9ca3af" stroke-width="2.4" stroke-linecap="round"/><path d="M8 5c4-2 7 2 11 0s6-1 8 0v12c-2-1-4-2-8 0s-7-2-11 0z" fill="#dc2626"/>', '0 0 32 32'),
  // A pick's state on a ticket.
  won: SVG(`<path d="M5 12.5l4.5 4.5L19 7.5" ${LINE}/>`),
  lost: SVG(`<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" ${LINE}/>`),
  void: SVG(`<path d="M5 12a7 7 0 1 0 2.2-5.1M5 4.5v4h4" ${LINE}/>`),
  live: SVG('<circle cx="12" cy="12" r="5" fill="currentColor"/>'),
  waiting: SVG(`<circle cx="12" cy="12" r="8.5" ${LINE}/><path d="M12 7.5V12l3 2" ${LINE}/>`),
  cashed: SVG(`<path d="M6 12h12" ${LINE}/>`),
  gift: SVG(`<rect x="3.5" y="9" width="17" height="11.5" rx="2" ${LINE}/><path d="M2.5 9h19M12 9v11.5M12 9c-1.5-3.5-6-4.5-6-1.5C6 9 9 9 12 9zm0 0c1.5-3.5 6-4.5 6-1.5C18 9 15 9 12 9z" ${LINE}/>`)
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `pi pi-${name}${cls ? ` ${cls}` : ''}`;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name] || '';
  return span;
}
