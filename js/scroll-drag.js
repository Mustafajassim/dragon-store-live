(function(){
  function findRow(el){
    while(el&&el!==document.body){
      if(el.classList&&el.classList.contains('prod-row'))return el;
      el=el.parentElement;
    }
    return null;
  }
  function isFormEl(el){
    return el&&el.tagName&&/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName);
  }

  // Only hijack the wheel when there's genuine horizontal intent (trackpad swipe or
  // Shift+wheel) — a normal mouse wheel always reports deltaX===0, so it always
  // passes through untouched and scrolls the page vertically as expected.
  document.addEventListener('wheel',function(e){
    var row=findRow(e.target);
    if(!row)return;
    if(row.scrollWidth<=row.clientWidth)return;
    var horizontalIntent=e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY);
    if(!horizontalIntent)return;
    row.scrollBy({left:e.shiftKey?e.deltaY:e.deltaX});
    e.preventDefault();
  },{passive:false});

  // Unified press-and-drag: horizontal inside a product row, vertical (page scroll)
  // everywhere else. A single "moved" flag is reset at the START of every new press,
  // so a leftover flag from a previous drag can never swallow an unrelated later click.
  var mode=null; // 'row' | 'page' | null
  var dragRow=null,startX=0,startY=0,startScrollX=0,startScrollY=0,moved=false;

  document.addEventListener('mousedown',function(e){
    if(e.button!==0)return; // left click only
    moved=false;
    var row=findRow(e.target);
    if(row&&row.scrollWidth>row.clientWidth){
      mode='row';dragRow=row;startX=e.pageX;startScrollX=row.scrollLeft;
      row.classList.add('dragging');
    }else if(!isFormEl(e.target)){
      mode='page';startY=e.pageY;startScrollY=window.scrollY;
    }else{
      mode=null;
    }
  });
  document.addEventListener('mousemove',function(e){
    if(mode==='row'&&dragRow){
      var dx=e.pageX-startX;
      if(Math.abs(dx)>6)moved=true;
      dragRow.scrollLeft=startScrollX-dx;
    }else if(mode==='page'){
      var dy=e.pageY-startY;
      if(Math.abs(dy)>6)moved=true;
      if(moved)window.scrollTo(0,startScrollY-dy);
    }
  });
  function endDrag(){
    if(dragRow)dragRow.classList.remove('dragging');
    dragRow=null;mode=null;
  }
  document.addEventListener('mouseup',endDrag);
  document.addEventListener('mouseleave',function(e){
    if(e.target===document.documentElement)endDrag();
  });
  // Prevent the drag gesture from also triggering a click (only for the click that
  // immediately follows a real drag — moved is reset on every new mousedown above,
  // so this can never leak into an unrelated later click).
  document.addEventListener('click',function(e){
    if(moved){e.stopPropagation();e.preventDefault();moved=false;}
  },true);
})();
