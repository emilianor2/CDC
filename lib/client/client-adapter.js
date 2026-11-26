let account={status:'loading'},busy=false,enrollmentAttempt=null;
async function readResponse(r){let d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo completar la operación.');return d}
function adopt(d){account=d;if(d.status==='ready'){db=d.data;db.ownerRequests=d.ownerRequests||[];if(d.canonicalURL&&!d.tenantId&&portal==='superadmin'&&location.pathname+location.search!==d.canonicalURL)history.replaceState(null,'',d.canonicalURL);if(d.tenantId){ownerCommerce=d.tenantId;cafe=d.tenantId;if(d.canonicalURL&&location.pathname+location.search!==d.canonicalURL)history.replaceState(null,'',d.canonicalURL)}if(d.clientId)customerSessions[cafe]=d.clientId;else if(isCustomer())delete customerSessions[cafe]}}
async function refreshRemote(silent=false){try{let d=await readResponse(await fetch('/api/state'+location.search,{cache:'no-store'})),before=JSON.stringify(db),beforeStatus=account.status;adopt(d);if(!silent||beforeStatus!==account.status||before!==JSON.stringify(db))render()}catch(e){if(!silent){account={status:'error',error:e.message};render()}}}
async function mutate(action,data={},key=createUUID()){if(busy)return null;if(portal==='owner'&&account.readOnly){toast('Estás consultando este panel como superadmin. Para operar, ingresá con la cuenta del dueño aprobado.');return null}busy=true;try{let d=await readResponse(await fetch('/api/action'+location.search,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,local:isCustomer()?cafe:portal==='owner'?ownerCommerce:undefined,data,key})}));adopt(d);render();return d}catch(e){toast(e.message);return null}finally{busy=false}}
function render(){if(account.status==='ready'){renderApp();prepareCardPush();if(account.user?.adminLogin&&portal==='superadmin'){let link=document.querySelector('a[href^="/signout-with-chatgpt"]');if(link){link.href='#';link.onclick=e=>{e.preventDefault();logoutAdmin()}}document.querySelector('header .row')?.insertAdjacentHTML('beforeend','<a class="button-link secondary mini" target="_top" href="'+esc(adminPasswordSetupURL())+'">Cambiar mi contraseña</a>')}if(account.user?.localLogin){let link=document.querySelector('a[href^="/signout-with-chatgpt"]');if(link){link.href='#';link.onclick=e=>{e.preventDefault();logoutOwner()}}}if(account.readOnly&&portal==='owner'){document.querySelector('main')?.insertAdjacentHTML('afterbegin','<div class="notice" style="margin-bottom:20px">Vista de consulta de superadmin. Podés ver este emprendimiento; para gestionar sellos y premios, ingresá con la cuenta de su dueño aprobado.</div>')}}else renderAccount()}
function adminPasswordSetupURL(){return '/signin-with-chatgpt?return_to='+encodeURIComponent('/?panel=superadmin&password=setup')}
function adminPasswordInput(id,name,label,autocomplete){return '<div><label for="'+id+'">'+label+'</label><input id="'+id+'" name="'+name+'" type="password" required minlength="10" maxlength="128" autocomplete="'+autocomplete+'"><label style="display:flex;align-items:center;gap:8px;margin-top:12px"><input type="checkbox" style="width:auto" aria-controls="'+id+'" onchange="document.getElementById(\''+id+'\').type=this.checked?\'text\':\'password\'">Mostrar contraseña</label></div>'}
function adminAccessForm(){let setup=account.status==='admin-password';return '<h1>'+ (setup?'Creá tu contraseña de superadmin.':'Ingresar como superadmin.')+'</h1><p>'+(setup?'Cuenta verificada: <strong>'+esc(account.user.email)+'</strong>. Elegí una contraseña de al menos 10 caracteres.':'Ingresá con tu correo autorizado y tu contraseña de Club de Fans.')+'</p><form class="stack" onsubmit="submitAdminAccess(event,'+setup+')">'+(setup?'':'<div><label for="admin-email">Correo</label><input id="admin-email" name="email" type="email" required maxlength="160" autocomplete="username" value="'+esc(account.user?.email||'')+'"></div>')+adminPasswordInput('admin-password','password',setup?'Nueva contraseña':'Contraseña',setup?'new-password':'current-password')+(setup?adminPasswordInput('admin-password-confirm','confirmPassword','Repetí la contraseña','new-password'):'')+'<button class="full">'+(setup?'Guardar contraseña e ingresar':'Ingresar')+'</button><p id="admin-access-error" role="alert"></p></form>'+(setup?'':'<p><a href="'+esc(adminPasswordSetupURL())+'" target="_top">Crear o restablecer mi contraseña</a></p><p class="muted">Para crearla o recuperarla, verificaremos tu cuenta autorizada con ChatGPT.</p>')}
async function submitAdminAccess(e,setup){e.preventDefault();if(busy)return;busy=true;let form=e.target,button=form.querySelector('button');button.disabled=true;try{let data=Object.fromEntries(new FormData(form));let d=await readResponse(await fetch(setup?'/api/admin-password':'/api/admin-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}));adopt(d);render()}catch(err){document.getElementById('admin-access-error').textContent=err.message;button.disabled=false}finally{busy=false}}
async function logoutAdmin(){try{await readResponse(await fetch('/api/admin-logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));location.href='/?panel=superadmin'}catch(e){toast(e.message)}}
function toggleLoginPassword(show){document.getElementById('login-password').type=show?'text':'password'}
function ownerLoginForm(){return '<h1>Ingresá a tu comercio.</h1>'+(account.loginTenant?'<p><strong>'+esc(account.loginTenant.name)+'</strong></p>':'')+'<p>Usá el usuario y la contraseña que te entregó el superadmin.</p><form class="stack" onsubmit="loginOwner(event)"><div><label for="login-user">Usuario</label><input id="login-user" name="username" required autocomplete="username" autocapitalize="none" maxlength="80"></div><div><label for="login-password">Contraseña</label><input id="login-password" name="password" type="password" required autocomplete="current-password" maxlength="128"><label style="display:flex;align-items:center;gap:8px;margin-top:12px"><input type="checkbox" style="width:auto" aria-controls="login-password" onchange="toggleLoginPassword(this.checked)">Mostrar contraseña</label></div><button class="full">Ingresar al panel</button><p id="login-error" role="alert"></p></form>'}
async function loginOwner(e){e.preventDefault();if(busy)return;busy=true;let form=e.target;form.querySelector('button').disabled=true;try{let d=await readResponse(await fetch('/api/owner-login?panel=owner',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(form)),local:account.loginTenant?.id||undefined})}));adopt(d);render()}catch(e){document.getElementById('login-error').textContent=e.message;form.querySelector('button').disabled=false}finally{busy=false}}
async function logoutOwner(){await fetch('/api/owner-logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});location.href='/?panel=owner'}
function renderAccount(){let status=account.status,html='',signIn='/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search);if(['admin-login','admin-password'].includes(status))html=adminAccessForm();else if(status==='loading')html='<h1>Cargando tu club…</h1>';else if(status==='signin')html='<h1>Ingresá a tu panel.</h1><p>Identificá tu cuenta. Los dueños necesitan aprobación del superadmin.</p><a class="button-link" href="'+esc(signIn)+'" target="_top">Continuar con ChatGPT</a><p><a href="/?panel=owner">Solicitar acceso como dueño</a></p>';else if(status==='forbidden')html='<h1>Acceso reservado al superadmin.</h1><p>Tu cuenta no tiene permisos para administrar la plataforma.</p><a href="/?panel=owner" class="button-link">Solicitar acceso como dueño</a>';else if(['request','rejected'].includes(status))html='<h1>Solicitá el panel de tu emprendimiento.</h1><p>'+(status==='rejected'?'Tu solicitud fue rechazada. Podés corregir los datos y volver a solicitar acceso.':'El superadmin debe aprobar tu solicitud antes de habilitar el panel.')+'</p><form class="stack" onsubmit="requestOwner(event)"><div><label for="request-name">Tu nombre</label><input id="request-name" name="name" required maxlength="80" value="'+esc(account.request?.name||account.user?.name||'')+'"></div><div><label>Cuenta identificada</label><input readonly value="'+esc(account.user?.email||'')+'"></div><div><label for="business-name">Emprendimiento</label><input id="business-name" name="businessName" required maxlength="60" value="'+esc(account.request?.businessName||'')+'"></div><div><label for="request-city">Ciudad</label><input id="request-city" name="city" required maxlength="60" value="'+esc(account.request?.city||'')+'"></div><div><label for="request-sector">Rubro</label><select id="request-sector" name="sector">'+sectorOptions(account.request?.sector||'otro')+'</select></div><button class="full">Enviar solicitud al superadmin</button></form>';else if(status==='pending')html='<span class="badge">PENDIENTE DE APROBACIÓN</span><h1 style="margin-top:20px">Tu solicitud está en revisión.</h1><p>El superadmin debe aprobar el acceso de <b>'+esc(account.request.businessName)+'</b>. Hasta entonces no podés gestionar tarjetas.</p><button onclick="refreshRemote()">Consultar estado</button>';else if(status==='suspended')html='<h1>Tu acceso está suspendido.</h1><p>Contactá al superadmin para revisar tu acceso.</p><button onclick="refreshRemote()">Consultar estado</button>';else html='<h1>No pudimos abrir esta página.</h1><p>'+esc(account.error||'Intentá nuevamente.')+'</p><button onclick="refreshRemote()">Reintentar</button>';if(portal==='owner'&&['signin','request','rejected','suspended','pending'].includes(status))html=ownerLoginForm()+(account.ownerLoginOnly?'':'<details style="margin-top:24px"><summary>Acceso anterior con ChatGPT</summary>'+html+'</details>');$('#app').innerHTML='<div class="customer-shell"><header><strong>Club de Fans</strong>'+(account.user?'<a href="/signout-with-chatgpt?return_to='+encodeURIComponent('/?panel='+(portal==='superadmin'?'superadmin':'owner'))+'" target="_top">Cerrar sesión</a>':'')+'</header><main class="panel account-panel">'+html+'</main></div>'}
async function requestOwner(e){e.preventDefault();await mutate('request-owner',Object.fromEntries(new FormData(e.target).entries()))}
function adminOwners(){return head('Solicitudes de dueños.','Solo el superadmin puede aprobar, rechazar, suspender o eliminar un acceso.')+'<div class="panel">'+(db.ownerRequests.length?db.ownerRequests.map(r=>'<article class="owner-request"><h2>'+esc(r.businessName)+'</h2><span class="badge">'+esc({pending:'Pendiente',approved:'Aprobado',rejected:'Rechazado',suspended:'Suspendido'}[r.status])+'</span><p>'+esc(r.name)+' · '+esc(r.email)+'<br><small>'+esc(r.city)+'</small></p>'+(['pending','suspended'].includes(r.status)?(r.assignedTenantId?'<p>Comercio asignado: <b>'+esc(businessName(r.assignedTenantId))+'</b></p>':'<label>Emprendimiento al que tendrá acceso</label><select id="owner-local-'+r.id+'"><option value="">Crear el emprendimiento solicitado</option>'+db.cafes.map(t=>'<option value="'+t.id+'" '+(r.tenantId===t.id?'selected':'')+'>'+esc(t.name)+'</option>').join('')+'</select>')+'<div class="row" style="margin-top:15px"><button onclick="approveOwner(\''+r.id+'\')">Aprobar acceso</button>'+(r.status==='pending'?'<button class="secondary" onclick="reviewOwner(\'reject-owner\',\''+r.id+'\')">Rechazar solicitud</button>':'')+'</div>':r.status==='approved'?'<p>Panel: '+esc(businessName(r.tenantId))+'</p><p><a class="button-link" href="'+esc(portalURL('owner',r.tenantId))+'" target="_blank" rel="noopener">Abrir panel del dueño</a></p><button class="secondary" onclick="reviewOwner(\'suspend-owner\',\''+r.id+'\')">Suspender acceso</button>':'')+'<div style="margin-top:15px"><button class="danger" onclick="confirmDeleteOwner(\''+r.id+'\')">Eliminar solicitud</button></div></article>').join(''):'<p class="empty">Todavía no hay solicitudes.</p>')+'</div>'}
function confirmDeleteOwner(id){if(portal!=='superadmin')return;let r=db.ownerRequests.find(x=>x.id===id);if(!r)return;modal('<h2>Eliminar solicitud de dueño</h2><p>Vas a eliminar la solicitud de <strong>'+esc(r.name)+'</strong> para <strong>'+esc(r.businessName)+'</strong>.</p><p>Si tiene acceso al panel, también se eliminará y se cerrarán sus sesiones. El comercio, sus clientes y sus tarjetas se conservan.</p><div class="row"><button class="secondary" onclick="closeModal()">Cancelar</button><button class="danger" onclick="deleteOwner(\''+r.id+'\')">Eliminar definitivamente</button></div>')}
async function deleteOwner(id){if(await mutate('delete-owner',{requestId:id})){closeModal();toast('Solicitud y acceso del dueño eliminados')}}
async function approveOwner(id){if(await mutate('approve-owner',{requestId:id,tenantId:db.ownerRequests.find(r=>r.id===id)?.assignedTenantId||document.getElementById('owner-local-'+id)?.value}))toast('Acceso aprobado')}
async function reviewOwner(action,id){if(await mutate(action,{requestId:id}))toast('Solicitud actualizada')}
async function removeStamp(id){if(await mutate('unstamp',{clientId:id})){openClient(id);toast('Sello quitado. La corrección quedó registrada.')}}
async function stamp(id){if(await mutate('stamp',{clientId:id})){openClient(id);toast('Sello guardado en el servidor')}}
async function redeem(id,rewardId){let c=clients().find(c=>c.id===id),r=rewardId||availableRewards(c)[0]?.id;if(r&&await mutate('redeem',{clientId:id,rewardId:r})){openClient(id);toast('Premio canjeado')}}
async function restartCard(id){if(await mutate('restart',{clientId:id})){openClient(id);toast('Nueva tarjeta iniciada')}}
async function saveProgram(e){e.preventDefault();let f=new FormData(e.target),p=readProgram(f);if(p.error)return toast(p.error);if(await mutate('program',{plan:p,sector:f.get('sector')})){closeModal();toast('Programa guardado')}}
async function createCafe(e){e.preventDefault();let f=new FormData(e.target),p=readProgram(f);if(p.error)return toast(p.error);if(await mutate('create-business',{name:f.get('name'),city:f.get('city'),owner:f.get('owner'),username:f.get('username'),password:f.get('password'),sector:f.get('sector'),plan:p})){closeModal();toast('Comercio y acceso del dueño creados. Ya puede ingresar con su usuario y contraseña.')}}
function addOwnerForm(id){if(portal!=='superadmin')return;let t=db.cafes.find(t=>t.id===id);if(!t)return;modal('<h2>Agregar dueño</h2><p>Comercio: <strong>'+esc(t.name)+'</strong></p><p>El acceso quedará pendiente hasta que el superadmin lo apruebe en Solicitudes de dueños.</p><form class="stack" onsubmit="addBusinessOwner(event,\''+t.id+'\')"><div><label for="extra-owner-name">Nombre del dueño</label><input id="extra-owner-name" name="name" required maxlength="80"></div><div><label for="extra-owner-user">Usuario</label><input id="extra-owner-user" name="username" required minlength="3" maxlength="80" autocomplete="off" autocapitalize="none"><small>Usá un usuario único: letras, números, punto, guion o email.</small></div><div><label for="extra-owner-password">Contraseña</label><input id="extra-owner-password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password"><small>Mínimo 10 caracteres. Guardala para entregársela al dueño.</small></div><div class="row"><button type="button" class="secondary" onclick="closeModal()">Cancelar</button><button>Crear solicitud de dueño</button></div></form>')}
async function addBusinessOwner(e,id){e.preventDefault();let data=Object.fromEntries(new FormData(e.target));if(await mutate('add-owner',{...data,tenantId:id})){closeModal();view='adminOwners';render();toast('Solicitud creada. Aprobá el acceso para habilitar al nuevo dueño.')}}
function confirmDeleteBusiness(id){if(portal!=='superadmin')return;let t=db.cafes.find(x=>x.id===id);if(!t)return;modal('<h2>Eliminar comercio</h2><p>Vas a eliminar definitivamente <strong>'+esc(t.name)+'</strong>.</p><p>Se borrarán sus clientes, tarjetas, sellos, premios, mensajes, actividad y solicitudes de dueños. Se quitarán sus accesos y el QR dejará de funcionar. Esta acción no se puede deshacer.</p><form class="stack" onsubmit="deleteBusiness(event,\''+t.id+'\')"><div><label for="delete-business-name">Escribí el nombre exacto del comercio para confirmar</label><input id="delete-business-name" name="confirmName" required autocomplete="off" maxlength="60" placeholder="'+esc(t.name)+'"></div><div class="row"><button type="button" class="secondary" onclick="closeModal()">Cancelar</button><button class="danger">Eliminar definitivamente</button></div></form>')}
async function deleteBusiness(e,id){e.preventDefault();let name=new FormData(e.target).get('confirmName'),t=db.cafes.find(x=>x.id===id);if(!t||name!==t.name)return toast('Escribí el nombre exacto del comercio');if(await mutate('delete-business',{id,confirmName:name})){if(cafe===id)cafe=db.cafes[0]?.id;selected=undefined;closeModal();render();toast('Comercio y datos asociados eliminados')}}
async function toggleCafe(id){await mutate('toggle-business',{id})}
function campaignStatus(campaign) {
  if (!campaign.delivery) return 'SIMULADA';
  if (campaign.delivery.status === 'sending') return 'ENVÍO INICIADO';
  return campaign.delivery.accepted+' aceptados por el servicio push · '+campaign.delivery.failed+' fallidos';
}
async function sendCampaign(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  if (await mutate('campaign', {recipientIds:form.getAll('recipients'), message:form.get('message')})) {
    toast(account.pushEnabled ? 'Consultá el resultado en el historial' : 'Mensaje simulado guardado');
  }
}
async function register(e){e.preventDefault();let f=new FormData(e.target),email=String(f.get('email')||'').trim().toLowerCase();if(!enrollmentAttempt||enrollmentAttempt.email!==email)enrollmentAttempt={email,token:createUUID()+createUUID(),key:createUUID()};if(await mutate('enroll',{name:f.get('name'),email,consent:f.get('consent')==='on',enrollmentToken:enrollmentAttempt.token},enrollmentAttempt.key)){enrollmentAttempt=null;enrollmentDraft={name:'',email:'',consent:false};render();toast('Tu tarjeta ya está guardada')}}
let cardPushSetup, cardPushRegistration, cardPushSetupError = false, cardPushEnabled = false;

function prepareCardPush() {
  if (cardPushSetup || !account.pushPublicKey || !document.getElementById('card-push-enable')) return;
  cardPushSetup = navigator.serviceWorker.register('/club-push.js')
    .then(() => navigator.serviceWorker.ready)
    .then(async registration => {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && Notification.permission === 'granted') {
        const status = await cardPushRequest(subscription, true);
        cardPushEnabled = status.enabled === true;
      }
      cardPushRegistration = registration;
    })
    .catch(() => { cardPushSetupError = true; })
    .finally(render);
}

async function cardPushRequest(subscription, check = false) {
  return readResponse(await fetch('/api/push-subscription', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({local:cafe, subscription, check}),
  }));
}

async function enableCardPush(button) {
  button.disabled = true;
  const status = document.getElementById('card-push-status');
  try {
    const key = account.pushPublicKey.replace(/-/g,'+').replace(/_/g,'/');
    const applicationServerKey = Uint8Array.from(atob(key.padEnd(Math.ceil(key.length/4)*4,'=')), char=>char.charCodeAt(0));
    // Safari requires subscribe() to run directly from the tap, before any asynchronous work.
    const subscription = await cardPushRegistration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey});
    await cardPushRequest(subscription);
    cardPushEnabled = true;
    render();
  } catch (error) {
    if (Notification.permission === 'denied') {
      render();
      return;
    }
    status.textContent = error.message || 'No se pudieron activar los avisos. Volvé a intentar.';
    button.disabled = false;
  }
}
function cardPushTools() {
  if (!account.pushPublicKey) return '';

  let controls;
  if (!isSecureContext) {
    controls = '<p>Abrí tu tarjeta por HTTPS para activar los avisos.</p>'
      + (account.pushSecureCard ? '<a class="button-link" href="'+esc(account.pushSecureCard)+'">Abrir tarjeta por HTTPS</a>' : '');
  } else if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    controls = '<p>En Safari, tocá Compartir → Agregar a pantalla de inicio. Después abrí la tarjeta desde su ícono.</p>';
  } else if (Notification.permission === 'denied') {
    controls = '<p>Los avisos están bloqueados. En el iPhone, revisá Ajustes → Notificaciones → Club de Fans.</p>';
  } else if (cardPushEnabled) {
    controls = '<p role="status">Avisos activados en este dispositivo.</p>';
  } else if (cardPushSetupError) {
    controls = '<p role="status">No se pudieron preparar los avisos. Volvé a abrir la tarjeta.</p>';
  } else {
    controls = '<button id="card-push-enable" type="button" class="secondary" onclick="enableCardPush(this)"'
      + (cardPushRegistration ? '' : ' disabled') + '>Activar avisos del comercio</button>'
      + '<p id="card-push-status" role="status">'+(cardPushRegistration ? '' : 'Preparando los avisos…')+'</p>';
  }
  return '<section class="hint"><h3>Avisos del comercio</h3>'+controls+'</section>';
}
function personalCardTools() {
  return '<section class="hint"><h3>Guardá tu tarjeta</h3>'
    + '<p>Para abrirla de nuevo en este navegador, escaneá el QR del comercio o agregá esta página a tu pantalla de inicio.</p>'
    + '</section>';
}

async function bootShared(){try{let token=location.hash.startsWith('#card=')?location.hash.slice(6):null;if(token&&isCustomer()){await readResponse(await fetch('/api/card-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({local:cafe,token})}));history.replaceState(null,'',location.pathname+location.search)}await refreshRemote();setInterval(()=>{if(document.visibilityState==='visible'&&!busy&&((isCustomer()&&ownedCard())||(portal==='owner'&&account.status==='pending')))refreshRemote(true)},5000)}catch(e){account={status:'error',error:e.message};render()}}
render();bootShared();
