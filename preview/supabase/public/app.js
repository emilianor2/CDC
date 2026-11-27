const login = document.querySelector('#login');
const panel = document.querySelector('#panel');
const status = document.querySelector('#status');
const cards = document.querySelector('#cards');
const submit = login.querySelector('button');
const labels = { cliente: 'Mis tarjetas', dueno: 'Mi comercio', superadmin: 'Superadmin' };
let session = null;
let config;

async function api(path, options = {}) {
  const headers = { apikey: config.key };
  if (session) headers.Authorization = 'Bearer ' + session.access_token;
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(new URL(path, config.url), {
    method: options.method, body: JSON.stringify(options.body), headers,
  });
  if (response.status === 401) resetSession();
  if (!response.ok) throw new Error('No se pudo completar la operación.');
  const content = await response.text();
  return content ? JSON.parse(content) : null;
}

function resetSession() {
  session = null;
  cards.replaceChildren();
  panel.hidden = true;
  login.hidden = false;
}

async function renderCards(role) {
  const [visible, stamps, prizes] = await Promise.all([
    api('/rest/v1/tarjetas?select=id,objetivo,clientes(nombre,comercios(id,nombre))&order=id'),
    api('/rest/v1/sellos?select=tarjeta_id'),
    api('/rest/v1/premios?select=comercio_id,descripcion,sellos_requeridos'),
  ]);
  cards.replaceChildren();
  if (visible.length === 0) cards.textContent = 'Todavía no hay tarjetas asignadas.';
  for (const card of visible) {
    const store = card.clientes.comercios;
    const article = document.createElement('article');
    const title = document.createElement('h3');
    title.textContent = role === 'cliente' ? store.nombre : card.clientes.nombre + ' · ' + store.nombre;
    const progress = document.createElement('p');
    const total = stamps.filter(stamp => stamp.tarjeta_id === card.id).length;
    progress.textContent = `${total} / ${card.objetivo} sellos`;
    const rewards = document.createElement('ul');
    for (const prize of prizes.filter(prize => prize.comercio_id === store.id)) {
      const item = document.createElement('li');
      item.textContent = `${prize.descripcion} (${prize.sellos_requeridos} sellos)`;
      rewards.append(item);
    }
    article.append(title, progress, rewards);
    if (role !== 'cliente') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Agregar sello';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await api('/rest/v1/sellos', { method: 'POST', body: { tarjeta_id: card.id } });
          await renderCards(role);
          status.textContent = 'Sello agregado.';
        } catch {
          status.textContent = 'No se pudo actualizar la tarjeta.';
        } finally {
          button.disabled = false;
        }
      });
      article.append(button);
    }
    cards.append(article);
  }
}

login.addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;
  status.textContent = 'Entrando…';
  const form = new FormData(login);
  try {
    const response = await fetch('/config');
    if (!response.ok) throw new Error('El entorno de pruebas todavía no está configurado.');
    config = await response.json();
    session = await api('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email: form.get('email'), password: form.get('password') },
    }).catch(() => { throw new Error('Revisá el correo y la contraseña e intentá de nuevo.'); });
    const [profile] = await api('/rest/v1/perfiles?select=rol&usuario_id=eq.' + session.user.id);
    if (!labels[profile?.rol]) throw new Error('La cuenta todavía no tiene un perfil asignado.');
    await renderCards(profile.rol);
    document.querySelector('#role').textContent = labels[profile.rol];
    login.reset();
    login.hidden = true;
    panel.hidden = false;
    status.textContent = '';
  } catch (error) {
    resetSession();
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('#logout').addEventListener('click', () => {
  void api('/auth/v1/logout?scope=local', { method: 'POST' }).catch(() => {});
  resetSession();
  status.textContent = 'Sesión cerrada.';
});
