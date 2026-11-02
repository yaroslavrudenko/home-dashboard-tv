/* The attention sound itself: one ring of the chime of tools/make-chime.mjs (three soft bell tones B5, G5, B5, about
 * 2 s), made on the spot with Web Audio. The TV's media pipeline (<audio>) may be held by the companion player playing
 * music behind the dashboard (js/player-behind.js), and a 2017 TV may not decode the bundled WAV; Web Audio needs
 * neither. The bundled WAV (sounds/alert.wav) is played only where Web Audio is missing or fails. ES5.
 *   Chime.create(deps)   deps: { AudioContext (the constructor, or undefined where there is none), makeAudio() (an
 *                        <audio> element with the bundled WAV; made on its first use), setTimeout, log(message) }
 *   .play()              one ring; a failure is logged, never thrown
 * One AudioContext, made on the first ring and reused (a TV allows only a few); every ring's nodes are disconnected
 * after it ends, so five rings leave nothing behind. */
var Chime = (function () {
  // The recipe of tools/make-chime.mjs: [start s, frequency Hz] per tone; each rings on, decaying, under the next one.
  var TONES = [[0, 987.77], [0.55, 783.99], [1.1, 987.77]];
  var SECONDS = 2, ATTACK = 0.008, DECAY = 3.2, OCTAVE = 0.25, FADE = 0.05;
  // The WAV's level: make-chime.mjs scales the summed tones (peak 1.2449) to 0.6 of full scale.
  var VOLUME = 0.48;
  var LEAD = 0.05;                                  // s: scheduled a moment ahead, so a just-resumed context keeps the attack
  var CLEANUP_MS = (SECONDS + LEAD + 0.5) * 1000;   // after the ring has ended: its nodes are disconnected

  function create(deps) {
    var Ctx = deps.AudioContext || null, ctx = null, audio = null;

    function logError(where) { return function (e) { deps.log('alert sound (' + where + '): ' + (e && e.message)); }; }
    function context() {
      if (!ctx) ctx = new Ctx();
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        var p = ctx.resume();
        if (p && typeof p.then === 'function') p.then(null, logError('resume'));
      }
      return ctx;
    }
    function disconnect(nodes) { for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { logError('disconnect')(e); } } }   // C-19: said, never silent

    // A sine at `freq` through a gain of `level` into `into`, from `at` to `end`.
    function partial(c, into, freq, level, at, end, nodes) {
      var osc = c.createOscillator(), amp = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      amp.gain.value = level;
      osc.connect(amp);
      amp.connect(into);
      osc.start(at);
      osc.stop(end);
      nodes.push(osc, amp);
    }
    // One bell tone: a quick start (no click), then the exponential fall; the fundamental and a little of its octave.
    function tone(c, out, at, end, freq, nodes) {
      var env = c.createGain(), g = env.gain;
      g.setValueAtTime(0, at);
      g.linearRampToValueAtTime(1, at + ATTACK);
      g.setTargetAtTime(0, at + ATTACK, 1 / DECAY);
      env.connect(out);
      nodes.push(env);
      partial(c, env, freq, 1, at, end, nodes);
      partial(c, env, 2 * freq, OCTAVE, at, end, nodes);
    }
    function ring() {
      var c = context(), t0 = c.currentTime + LEAD, end = t0 + SECONDS, out = c.createGain(), nodes = [out];
      try {
        out.gain.setValueAtTime(VOLUME, t0);
        out.gain.setValueAtTime(VOLUME, end - FADE);  // the last 50 ms fade to silence, as in the WAV
        out.gain.linearRampToValueAtTime(0, end);
        for (var i = 0; i < TONES.length; i++) tone(c, out, t0 + TONES[i][0], end, TONES[i][1], nodes);
        out.connect(c.destination);
      } catch (e) { disconnect(nodes); throw e; }
      deps.setTimeout(function () { disconnect(nodes); }, CLEANUP_MS);
    }

    // The bundled WAV. play() fails without a sound device or when the TV refuses it (Chromium 50+ answers a rejected
    // promise; 47 throws or returns nothing): logged.
    function playWav() {
      try {
        if (!audio) audio = deps.makeAudio();
        audio.currentTime = 0;
        var p = audio.play();
        if (p && typeof p.then === 'function') p.then(null, logError('audio'));
      } catch (e) { logError('audio')(e); }
    }

    return {
      play: function () {
        if (Ctx) {
          try { ring(); return; } catch (e) { logError('Web Audio')(e); Ctx = null; }   // broken here: the WAV from now on
        }
        playWav();
      }
    };
  }

  return { create: create };
})();
