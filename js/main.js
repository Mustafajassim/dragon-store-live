/* BOOTSTRAP — fetch data, then mount the React app into #root. */

/* If anything in the UI throws, show a friendly reload screen instead of a frozen/blank page. */
class ErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(err){return{err};}
  componentDidCatch(err,info){console.error('[Dragon Store] UI error',err,info);}
  render(){
    if(!this.state.err)return this.props.children;
    return React.createElement('div',{className:'boot-loader'},
      React.createElement('div',{className:'boot-logo'},'DRAGON STORE'),
      React.createElement('div',{className:'boot-sub'},'حدث خطأ غير متوقع. أعد تحميل الصفحة وسيعمل كل شيء بإذن الله.'),
      React.createElement('button',{className:'btn-fire',onClick:()=>location.reload()},'إعادة التحميل'));
  }
}

function renderApp(data){
  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(ErrorBoundary,null,React.createElement(App,{store:data.store,products:data.products}))
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

/* LITE MODE — heavy blur/animation effects are switched off automatically on slow GPUs / busy PCs.
   Force it with  ?lite=1  (or disable the check with  ?lite=0 ). */
function perfProbe(){
  const root=document.documentElement,flag=new URLSearchParams(location.search).get('lite');
  if(flag==='1'){root.classList.add('lite');return;}
  if(flag==='0')return;
  setTimeout(()=>{
    let frames=0;const t0=performance.now();
    const tick=t=>{
      if(document.hidden||t-t0>4000)return;                 // tab was in background → measurement invalid
      frames++;
      if(t-t0<1500){requestAnimationFrame(tick);return;}
      if(frames*1000/(t-t0)<24)root.classList.add('lite');
    };
    requestAnimationFrame(tick);
  },1200);
}

fetchData().then(d=>{initAnalytics(d.store.analytics);renderApp(d);perfProbe();}).catch(showLoadError);
