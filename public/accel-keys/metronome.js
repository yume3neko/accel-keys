// One click per beat. Tempo changes preserve fractional beat progress.
(() => {
  class AccelMetronome {
    constructor() {
      this.enabled = localStorage.getItem('accel-guide-enabled') !== 'off';
      const stored = Number(localStorage.getItem('accel-guide-volume') ?? .25);
      this.volume = Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : .25;
      this.voices = new Set();
      addEventListener('pointerdown', () => this.unlock(), {passive:true});
      addEventListener('keydown', () => this.unlock());
      addEventListener('pagehide', () => this.stop());
      addEventListener('visibilitychange', () => {if(document.hidden)this.silence();});
    }
    mount() {
      const toggle=document.getElementById('guideEnabled'), slider=document.getElementById('guideVolume');
      toggle.checked=this.enabled;slider.value=Math.round(this.volume*100);
      toggle.onchange=()=>{this.enabled=toggle.checked;localStorage.setItem('accel-guide-enabled',this.enabled?'on':'off');if(this.enabled)this.unlock();else this.silence();};
      slider.oninput=()=>{this.volume=Number(slider.value)/100;localStorage.setItem('accel-guide-volume',this.volume);if(this.master)this.master.gain.setValueAtTime(this.volume,this.audio.currentTime);};
    }
    unlock() {
      if(!this.enabled)return;
      try {
        const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!Audio)return;
        if(!this.audio){this.audio=new Audio();this.master=this.audio.createGain();this.master.gain.value=this.volume;this.master.connect(this.audio.destination);}
        if(this.audio.state==='suspended')this.audio.resume().catch(()=>{});
      } catch { /* Audio unavailable: gameplay remains usable. */ }
    }
    start(origin,bpm,step,active=()=>true) {
      this.stop();this.origin=origin;this.bpm=bpm;this.step=step;this.active=active;this.cursor=0;this.fraction=0;
      this.timer=setInterval(()=>this.pump(),25);this.pump();
    }
    pump() {
      if(!this.active()){this.stop();return;}
      const now=performance.now(), end=Math.max(0,now-this.origin+100);
      while(this.cursor<end){
        const boundary=(Math.floor(this.cursor/this.step)+1)*this.step;
        const until=Math.min(end,boundary), rate=this.bpm(this.cursor)/60000;
        const beats=this.fraction+(until-this.cursor)*rate;
        // Skip expired beats after a delayed callback rather than playing a burst.
        const first=Math.max(1,Math.ceil(this.fraction+(now-this.origin-this.cursor)*rate-1e-9));
        for(let k=first;k<=Math.floor(beats+1e-9);k++)this.click(this.origin+this.cursor+(k-this.fraction)/rate);
        this.fraction=beats-Math.floor(beats+1e-9);
        if(this.fraction<0)this.fraction=0;
        this.cursor=until;
      }
    }
    click(at) {
      if(!this.enabled||document.hidden||!this.audio||this.audio.state!=='running'||this.volume===0)return;
      const time=this.audio.currentTime+Math.max(0,(at-performance.now())/1000);
      const oscillator=this.audio.createOscillator(), envelope=this.audio.createGain();
      oscillator.type='sine';oscillator.frequency.setValueAtTime(1200,time);
      envelope.gain.setValueAtTime(0,time);envelope.gain.linearRampToValueAtTime(.35,time+.001);
      envelope.gain.exponentialRampToValueAtTime(.001,time+.035);
      oscillator.connect(envelope);envelope.connect(this.master);
      this.voices.add(oscillator);oscillator.onended=()=>{this.voices.delete(oscillator);oscillator.disconnect();envelope.disconnect();};
      oscillator.start(time);oscillator.stop(time+.04);
    }
    silence(){for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();}
    stop(){clearInterval(this.timer);this.timer=null;this.silence();}
  }
  globalThis.AccelMetronome=AccelMetronome;
})();
