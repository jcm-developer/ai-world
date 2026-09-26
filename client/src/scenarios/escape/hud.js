// Inventario en pantalla (esquina inferior izquierda): lo que lleva encima la IA.

const ICONS = {
  linterna_uv: '<path d="M5 15l4 4 9-9-4-4z"/><path d="M14 6l2-2 4 4-2 2"/><circle cx="18.5" cy="5.5" r="1" fill="currentColor"/>',
  tarjeta: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  nota_a: '<path d="M6 3h8v18H6zM14 3l-2 3 2 3-2 3 2 3-2 3 2 3"/>',
  nota_b: '<path d="M18 3h-8v18h8zM10 3l2 3-2 3 2 3-2 3 2 3-2 3"/>',
  nota_completa: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};

export function createInventoryHud() {
  const el = document.createElement('div');
  el.className = 'inventory';
  el.innerHTML = '<div class="inventory-title">Inventario</div><ul class="inventory-list"></ul>';
  document.body.append(el);
  const list = el.querySelector('.inventory-list');
  let known = new Set();

  return {
    set(inventory) {
      const firstRender = known.size === 0 && list.children.length === 0;
      list.replaceChildren();
      if (!inventory.length) {
        const li = document.createElement('li');
        li.className = 'inventory-empty';
        li.textContent = 'Vacío';
        list.append(li);
      }
      for (const item of inventory) {
        const li = document.createElement('li');
        li.className = 'inventory-item';
        if (!firstRender && !known.has(item.id)) li.classList.add('new');
        li.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[item.id] ?? ''}</svg><span></span>`;
        li.querySelector('span').textContent = item.label;
        list.append(li);
      }
      known = new Set(inventory.map((i) => i.id));
    },
  };
}
