import { getOpenFlightMapsTiles, OPEN_FLIGHT_MAPS_ATTRIBUTION, SATELLITE_ATTRIBUTION, SATELLITE_TILE_URL } from '@/data/openFlightMaps';
import { LEAFLET_SOURCE, LEAFLET_STYLES } from '@/vendor/leafletScripts.generated';

const json = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

export function buildAeronauticalMapHtml(cycle: string, dark: boolean, initialCenter?: { latitude: number; longitude: number }, retainedView?: { latitude: number; longitude: number; zoom: number }): string {
  const tiles = getOpenFlightMapsTiles(cycle);
  const background = dark ? '#122126' : '#dbe4e6';
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${LEAFLET_STYLES}
html,body,#map{height:100%;width:100%;margin:0;background:${background};overflow:hidden}*{box-sizing:border-box}
.leaflet-control-attribution{font:8px/12px system-ui,sans-serif!important;background:rgba(255,255,255,.82)!important;max-width:82%;white-space:normal}
.route-number{display:flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 3px;border:3px solid #fff;border-radius:13px;background:#087f8c;color:#fff;font:800 10px/1 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.45);white-space:nowrap}
</style></head><body><div id="map"></div><script>window.onerror=function(message){try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'mapScriptError',message:String(message).slice(0,200)}));}catch(e){}};</script><script>${LEAFLET_SOURCE}</script><script>
(function(){
  var send=function(message){try{window.ReactNativeWebView.postMessage(JSON.stringify(message));}catch(e){}};
  var initialCenter=${json(initialCenter ?? { latitude: 20, longitude: 0 })};
  var retainedView=${json(retainedView ?? null)};
  var mapZoomLimit=function(base,aeroVisible){return base==='satellite'&&!aeroVisible?19:13;};
  var CHART_NATIVE_MAX_ZOOM=11;
  var CHART_USEFUL_MAX_ZOOM=13;
  var baseLayerName='chart';
  var aeroVisible=true;
  var map=L.map('map',{zoomControl:false,attributionControl:true,tapHold:true,worldCopyJump:true,minZoom:2,maxZoom:CHART_USEFUL_MAX_ZOOM,bounceAtZoomLimits:false,zoomAnimation:true,fadeAnimation:true}).setView([retainedView?retainedView.latitude:initialCenter.latitude,retainedView?retainedView.longitude:initialCenter.longitude],retainedView?retainedView.zoom:initialCenter.latitude===20&&initialCenter.longitude===0?2:10);
  map.attributionControl.setPrefix(false);
  var attribution=${json(OPEN_FLIGHT_MAPS_ATTRIBUTION)};
  var base=L.tileLayer(${json(tiles.base)},{tileSize:256,minZoom:2,maxZoom:CHART_USEFUL_MAX_ZOOM,minNativeZoom:7,maxNativeZoom:CHART_NATIVE_MAX_ZOOM,detectRetina:false,updateWhenZooming:false,keepBuffer:4,attribution:attribution}).addTo(map);
  var satellite=L.tileLayer(${json(SATELLITE_TILE_URL)},{tileSize:256,minZoom:2,maxZoom:19,maxNativeZoom:19,detectRetina:false,attribution:${json(SATELLITE_ATTRIBUTION)}});
  map.createPane('aeroPane');map.getPane('aeroPane').style.zIndex='350';
  var aero=L.tileLayer(${json(tiles.aeronautical)},{pane:'aeroPane',tileSize:256,minZoom:2,maxZoom:CHART_USEFUL_MAX_ZOOM,minNativeZoom:7,maxNativeZoom:CHART_NATIVE_MAX_ZOOM,detectRetina:false,updateWhenZooming:false,keepBuffer:4,attribution:attribution});
  aero.addTo(map);
  map.createPane('routeLines');map.getPane('routeLines').style.zIndex='450';
  var route=L.featureGroup().addTo(map);
  var locationLayer=L.featureGroup().addTo(map);
  var failures=0;
  var tileError=function(){failures+=1;if(failures===4)send({type:'tileError'});};
  base.on('tileerror',tileError);satellite.on('tileerror',tileError);aero.on('tileerror',tileError);
  map.on('click',function(){send({type:'mapPress'});});
  map.on('moveend',function(){var center=map.getCenter();send({type:'mapView',latitude:center.lat,longitude:center.lng,zoom:map.getZoom()});});
  map.on('contextmenu',function(event){send({type:'mapPress'});send({type:'longPress',longitude:event.latlng.lng,latitude:event.latlng.lat});});
  window.setAeroBriefRoute=function(payload){
    var points=typeof payload==='string'?JSON.parse(payload):payload;
    route.clearLayers();
    var latLngs=points.map(function(point){return [point.latitude,point.longitude];});
    if(latLngs.length>1){L.polyline(latLngs,{pane:'routeLines',interactive:false,color:'#fff',weight:8,opacity:.94,lineJoin:'round'}).addTo(route);L.polyline(latLngs,{pane:'routeLines',interactive:false,color:'#087f8c',weight:4,opacity:1,lineJoin:'round'}).addTo(route);}
    var markerGroups=[];
    points.forEach(function(point,index){
      var key=point.latitude.toFixed(6)+','+point.longitude.toFixed(6);
      var group=markerGroups.find(function(item){return item.key===key;});
      if(group)group.numbers.push(index+1);
      else markerGroups.push({key:key,latitude:point.latitude,longitude:point.longitude,numbers:[index+1]});
    });
    markerGroups.forEach(function(group){
      var label=group.numbers.join('/');
      var width=Math.max(24,12+label.length*7);
      L.marker([group.latitude,group.longitude],{interactive:false,icon:L.divIcon({className:'',html:'<div class="route-number">'+label+'</div>',iconSize:[width,24],iconAnchor:[width/2,12]})}).addTo(route);
    });
  };
  window.refreshAeroBriefTiles=function(){
    var stamp='&refresh='+Date.now();
    base.setUrl(${json(tiles.base)}+stamp);
    aero.setUrl(${json(tiles.aeronautical)}+stamp);
    satellite.setUrl(${json(SATELLITE_TILE_URL)}+((${json(SATELLITE_TILE_URL)}).indexOf('?')===-1?'?':'&')+'refresh='+Date.now());
    failures=0;
  };
  var reportMapStatus=function(){var limit=mapZoomLimit(baseLayerName,aeroVisible);send({type:'mapStatus',atDetailLimit:limit===CHART_USEFUL_MAX_ZOOM&&map.getZoom()>=limit});};
  var syncLayers=function(){
    var useSatellite=baseLayerName==='satellite';
    var limit=mapZoomLimit(baseLayerName,aeroVisible);
    if(map.getMaxZoom()!==limit)map.setMaxZoom(limit);
    if(useSatellite){if(map.hasLayer(base))map.removeLayer(base);if(!map.hasLayer(satellite))satellite.addTo(map);}
    else{if(map.hasLayer(satellite))map.removeLayer(satellite);if(!map.hasLayer(base))base.addTo(map);}
    if(aeroVisible){if(!map.hasLayer(aero))aero.addTo(map);}
    else if(map.hasLayer(aero)){map.removeLayer(aero);}
    reportMapStatus();
  };
  map.on('zoomend',reportMapStatus);
  window.setAeroBriefLayerVisible=function(visible){if(aeroVisible===visible)return;aeroVisible=visible;syncLayers();};
  window.setAeroBriefBaseLayer=function(layer){
    if(layer!=='chart'&&layer!=='satellite')return;
    if(baseLayerName===layer)return;
    baseLayerName=layer;
    syncLayers();
  };
  window.clearAeroBriefLocation=function(){locationLayer.clearLayers();};
  window.setAeroBriefLocation=function(longitude,latitude,accuracy){
    locationLayer.clearLayers();
    if(accuracy&&accuracy>0)L.circle([latitude,longitude],{radius:accuracy,color:'#087f8c',weight:1,fillColor:'#56cbd4',fillOpacity:.13,interactive:false}).addTo(locationLayer);
    L.circleMarker([latitude,longitude],{radius:7,color:'#fff',weight:3,fillColor:'#087f8c',fillOpacity:1,interactive:false}).addTo(locationLayer);
  };
  window.fitAeroBriefRoute=function(){var bounds=route.getBounds&&route.getBounds();if(bounds&&bounds.isValid())map.fitBounds(bounds.pad(.16),{animate:true,duration:.5,maxZoom:map.getMaxZoom()});};
  window.flyAeroBriefTo=function(longitude,latitude,zoom){map.flyTo([latitude,longitude],Math.min(zoom||11,map.getMaxZoom()),{animate:true,duration:.55});};
  syncLayers();
  send({type:'ready'});
})();
</script></body></html>`;
}
