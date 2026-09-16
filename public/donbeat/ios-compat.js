'use strict';

(function(){
  const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(!isiOS)return;

  // iOS/iPadOS Safari can suspend or warn on rapid keyboard/button input while
  // a page is using the native Fullscreen API. DON BEAT already has a compact
  // landscape play layout, so on Apple touch devices we deliberately keep the
  // page out of native fullscreen and use that layout instead.
  enterPlayFullscreen=async function(){
    document.body.classList.add('ios-play-mode');
  };
  leavePlayFullscreen=function(){
    document.body.classList.remove('ios-play-mode');
    try{screen.orientation?.unlock?.()}catch{}
  };
  requestLandscape=async function(){
    document.body.classList.add('ios-play-mode');
    $('status').textContent=window.innerWidth>=window.innerHeight?'横画面モードです。':'iPhone / iPadでは端末を横向きにしてください。';
  };
  $('landscapeOpen').onclick=requestLandscape;

  for(const pad of document.querySelectorAll('[data-hit]')){
    pad.tabIndex=-1;
    pad.style.webkitTouchCallout='none';
    pad.style.webkitUserSelect='none';
    pad.addEventListener('contextmenu',e=>e.preventDefault());
  }
})();
