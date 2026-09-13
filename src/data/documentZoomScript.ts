/** Shared PDF/image focal anchoring. No browser-native page zoom or end-of-pinch reflow. */
export const DOCUMENT_ZOOM_SCRIPT = `
function installDocumentZoom(viewport, records, getZoom, resize, report, sharpen) {
  var pinch=null, frame=0, pending=null;
  function capture(x,y){
    var closest=null, distance=Infinity;
    records.forEach(function(record){var r=record.shell.getBoundingClientRect();var d=Math.max(r.top-y,0,y-r.bottom);if(d<distance){distance=d;closest=record;}});
    if(!closest)return null;
    var rect=closest.shell.getBoundingClientRect();
    return {record:closest,u:(x-rect.left)/rect.width,v:(y-rect.top)/rect.height};
  }
  function apply(next,x,y,anchor){
    if(!Number.isFinite(next))return;
    anchor=anchor||capture(x,y);
    resize(Math.max(1,Math.min(4,next)));
    if(anchor){
      var rect=anchor.record.shell.getBoundingClientRect();
      viewport.scrollLeft+=rect.left+anchor.u*rect.width-x;
      viewport.scrollTop+=rect.top+anchor.v*rect.height-y;
    }
  }
  function center(){var r=viewport.getBoundingClientRect();return {x:r.left+viewport.clientWidth/2,y:r.top+viewport.clientHeight/2};}
  function midpoint(t){return {x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2};}
  function distance(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
  function flush(){if(!pending)return;apply(pending.zoom,pending.x,pending.y,pinch&&pinch.anchor);pending=null;}
  window.setAeroBriefZoom=function(next){var c=center();apply(Number(next),c.x,c.y);sharpen();};
  viewport.addEventListener('touchstart',function(event){
    if(event.touches.length!==2)return;
    var c=midpoint(event.touches);pinch={distance:distance(event.touches),zoom:getZoom(),anchor:capture(c.x,c.y)};
    event.preventDefault();
  },{passive:false});
  viewport.addEventListener('touchmove',function(event){
    if(!pinch||event.touches.length!==2||pinch.distance<=0)return;
    var c=midpoint(event.touches);pending={zoom:pinch.zoom*distance(event.touches)/pinch.distance,x:c.x,y:c.y};
    if(!frame)frame=requestAnimationFrame(function(){flush();frame=0;});
    event.preventDefault();
  },{passive:false});
  function finish(event){
    if(!pinch||event.touches.length>=2)return;
    if(frame)cancelAnimationFrame(frame);frame=0;flush();pinch=null;report();sharpen();
  }
  viewport.addEventListener('touchend',finish,{passive:true});
  viewport.addEventListener('touchcancel',finish,{passive:true});
  viewport.addEventListener('scroll',sharpen,{passive:true});
}
`;
