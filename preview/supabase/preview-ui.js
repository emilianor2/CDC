const renderOriginal = render;
render = function () {
  renderOriginal();
  if (account.status !== 'ready' && account.status !== 'suspended') return;

  const banner = document.querySelector('#app .demo');
  if (banner) banner.textContent = 'Entorno de prueba · Datos ficticios';

  const header = document.querySelector('#app header');
  const links = header?.querySelector('.row') || header;
  if (!links) return;
  const logout = document.createElement('form');
  logout.action = '/logout';
  logout.method = 'post';
  const button = document.createElement('button');
  button.className = 'secondary mini';
  button.textContent = 'Cerrar sesión';
  logout.append(button);
  const original = links.querySelector('a[href^="/signout-with-chatgpt"]');
  if (original) original.replaceWith(logout);
  else links.append(logout);
};

const readOriginalResponse = readResponse;
readResponse = function (response) {
  if (response.status === 401) {
    location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search));
  }
  return readOriginalResponse(response);
};

const openOriginalCommerceForm = newCafe;
newCafe = function () {
  openOriginalCommerceForm();
  const form = document.querySelector('#overlay form');
  if (!form) return;
  for (const name of ['owner', 'username', 'password']) form.elements.namedItem(name)?.closest('div')?.remove();
  form.querySelector('button[type="submit"], button:not([type])').textContent = 'Crear comercio';
  form.onsubmit = async event => {
    event.preventDefault();
    const fields = new FormData(form);
    const plan = readProgram(fields);
    if (plan.error) return toast(plan.error);
    if (await mutate('create-business', {
      name: fields.get('name'), city: fields.get('city'), sector: fields.get('sector'), plan,
    })) {
      closeModal();
      toast('Comercio creado');
    }
  };
};

addOwnerForm = function () {
  toast('La prueba usa las cuentas de Supabase ya creadas.');
};
