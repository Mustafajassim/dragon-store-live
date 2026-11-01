/* BOOTSTRAP — fetch data, then mount the React app into #root. */

function renderApp(data){
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(App,{store:data.store,products:data.products})
  );
}

function showLoadError(err){
  console.error('[Dragon Store] could not load store data',err);
  const sub=document.getElementById('bootSub');
  if(!sub)return;
  sub.id='bootError'; // stops the slow-connection message timers from overwriting the error
  sub.textContent='تعذّر تحميل بيانات المتجر. تحقق من اتصالك ثم أعد المحاولة.';
  const btn=document.createElement('button');
  btn.className='btn-fire';
  btn.textContent='إعادة المحاولة';
  btn.onclick=()=>location.reload();
  sub.insertAdjacentElement('afterend',btn);
}

fetchData().then(renderApp).catch(showLoadError);
