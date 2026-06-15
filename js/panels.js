/* Control panels, indicators, annunciator, checklist — DOM construction and binding. */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {}) : {};

PWR.Panels = function (sim) {
  var $ = function (id) { return document.getElementById(id); };
  var acked = {}, lastEvtCount = 0;

  /* ---------------- side panels ---------------- */
  function seg(id, opts) {
    return '<div class="seg" id="' + id + '">' + opts.map(function (o, i) {
      return '<button data-i="' + i + '">' + o + '</button>';
    }).join('') + '</div>';
  }
  function slider(id, label, min, max, val, unit, step) {
    step = step || 1;
    return '<div class="row"><label>' + label + '</label>' +
      '<button class="btn nudge" id="' + id + 'Dn" title="−' + step + ' ' + unit + '">−</button>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '">' +
      '<button class="btn nudge" id="' + id + 'Up" title="+' + step + ' ' + unit + '">+</button>' +
      '<span class="val" id="' + id + 'V">' + val + ' ' + unit + '</span></div>';
  }

  $('side').innerHTML =
    '<div class="pnl" id="pnlFuel"><h3>FUEL HANDLING</h3><div class="bd">' +
      '<div class="row"><button class="btn go" id="btnLoad">LOAD CORE</button>' +
      '<div class="posbar"><div id="loadBar"></div></div><span class="val" id="loadPct">0%</span></div>' +
      '<div class="row"><button class="btn" id="btnHead">INSTALL VESSEL HEAD</button>' +
      '<button class="btn" id="btnFill">FILL &amp; VENT RCS</button></div>' +
    '</div></div>' +

    '<div class="pnl"><h3>P-T DIAGRAM — "CHAUSSETTE"</h3><div class="bd" style="padding:5px">' +
      '<canvas id="ptCanvas" width="368" height="250" style="width:100%;display:block"></canvas>' +
    '</div></div>' +

    '<div class="pnl"><h3>REACTIVITY CONTROL</h3><div class="bd">' +
      '<div class="row"><label>Control bank</label>' + seg('segCB', ['IN', 'HOLD', 'OUT']) +
      '<div class="posbar"><div id="cbBar"></div></div><span class="val" id="cbPos">0%</span></div>' +
      '<div class="row"><label>Shutdown banks</label>' + seg('segSD', ['IN', 'HOLD', 'OUT']) +
      '<div class="posbar"><div id="sdBar"></div></div><span class="val" id="sdPos">0%</span></div>' +
      '<div class="row"><label>CVCS makeup</label>' + seg('segBor', ['BORATE', 'NORMAL', 'DILUTE']) +
      '<span class="val" id="boronV"></span></div>' +
      '<div class="row"><button class="btn" id="btnReset">RESET RX TRIP</button>' +
      '<span class="mini" id="tripMsg"></span></div>' +
    '</div></div>' +

    '<div class="pnl"><h3>PRESSURIZER</h3><div class="bd">' +
      slider('slHeat', 'Prop. heaters', 0, 100, 0, '%') +
      '<div class="row"><label>Backup heaters</label><button class="btn" id="btnBkup">OFF</button>' +
      '<span class="lamp" id="lpBkup"></span><label style="min-width:0">PORV</label><span class="lamp red" id="lpPorv"></span></div>' +
      slider('slSpray', 'Spray valve', 0, 100, 0, '%') +
    '</div></div>' +

    '<div class="pnl"><h3>CVCS — CHARGING / LETDOWN</h3><div class="bd">' +
      slider('slChg', 'Charging flow', 0, 40, 5, 'kg/s', 0.1) +
      slider('slLtd', 'Letdown flow', 0, 40, 5, 'kg/s', 0.1) +
      '<div class="row mini"><span id="cvcsNet"></span></div>' +
    '</div></div>' +

    '<div class="pnl"><h3>REACTOR COOLANT PUMPS</h3><div class="bd"><div class="row" id="rcpRow">' +
      [0, 1, 2, 3].map(function (i) {
        return '<button class="btn" data-rcp="' + i + '">RCP ' + (i + 1) + ' <span class="lamp" id="lpRcp' + i + '"></span></button>';
      }).join('') +
    '</div></div></div>' +

    '<div class="pnl"><h3>STEAM DUMP &amp; FEEDWATER</h3><div class="bd">' +
      slider('slDump', 'Steam dump', 0, 100, 0, '%') +
      slider('slFeed', 'Feedwater', 0, 110, 0, '%') +
      '<div class="row mini"><span id="sgFlows"></span></div>' +
    '</div></div>' +

    '<div class="pnl"><h3>TURBINE — GENERATOR</h3><div class="bd">' +
      '<div class="row"><button class="btn" id="btnLatch">LATCH &amp; ROLL</button>' +
      '<button class="btn" id="btnSync">SYNC BREAKER</button><span class="lamp" id="lpSync"></span>' +
      '<span class="val" id="rpmV">0 rpm</span></div>' +
      slider('slLoad', 'Load setpoint', 0, 1120, 0, 'MWe', 10) +
    '</div></div>';

  /* segment switches */
  function bindSeg(id, fn, def) {
    var el = $(id), btns = el.querySelectorAll('button');
    function set(i) {
      btns.forEach(function (b, j) { b.classList.toggle('on', j === i); b.classList.toggle('down', j === i && i === 0); });
      fn(i);
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () { set(+b.dataset.i); });
    });
    set(def);
    el._set = set;
  }
  bindSeg('segCB', function (i) { sim.ctrl.rodDir = i - 1; }, 1);
  bindSeg('segSD', function (i) { sim.ctrl.sdDir = i - 1; }, 1);
  bindSeg('segBor', function (i) { sim.ctrl.cvcs = ['borate', 'normal', 'dilute'][i]; }, 1);

  function bindSlider(id, fn, unit) {
    var el = $(id);
    var step = parseFloat(el.step) || 1;
    var dec = step < 1 ? 1 : 0;
    var mn = parseFloat(el.min), mx = parseFloat(el.max);
    function apply() {
      var v = +el.value;
      fn(v); $(id + 'V').textContent = v.toFixed(dec) + ' ' + unit;
    }
    el.addEventListener('input', apply);
    function nudge(d) {
      // snap to the step grid so repeated taps stay tidy (e.g. 5.0, 5.1, 5.2)
      var v = Math.min(mx, Math.max(mn, Math.round((+el.value + d) / step) * step));
      el.value = v; apply();
    }
    holdRepeat($(id + 'Dn'), function () { nudge(-step); });
    holdRepeat($(id + 'Up'), function () { nudge(step); });
  }
  // fire once on press, then auto-repeat while held (mouse or touch)
  function holdRepeat(btn, fn) {
    var iv, to;
    function stop() { clearTimeout(to); clearInterval(iv); }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault(); fn();
      to = setTimeout(function () { iv = setInterval(fn, 90); }, 350);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, stop); });
  }
  bindSlider('slHeat', function (v) { sim.ctrl.heater = v; }, '%');
  bindSlider('slSpray', function (v) { sim.ctrl.spray = v; }, '%');
  bindSlider('slChg', function (v) { sim.ctrl.charging = v; }, 'kg/s');
  bindSlider('slLtd', function (v) { sim.ctrl.letdown = v; }, 'kg/s');
  bindSlider('slDump', function (v) { sim.ctrl.dump = v; }, '%');
  bindSlider('slFeed', function (v) { sim.ctrl.feed = v; }, '%');
  bindSlider('slLoad', function (v) { sim.ctrl.turbTarget = v; }, 'MWe');

  $('btnBkup').addEventListener('click', function () {
    sim.ctrl.heaterBackup = !sim.ctrl.heaterBackup;
    this.textContent = sim.ctrl.heaterBackup ? 'ON' : 'OFF';
  });
  $('btnLoad').addEventListener('click', function () { sim.loadFuel(); });
  $('btnHead').addEventListener('click', function () { sim.installHead(); });
  $('btnFill').addEventListener('click', function () { sim.fillAndVent(); });
  $('btnReset').addEventListener('click', function () {
    if (!sim.resetTrip() && sim.tripped) sim.log('Trip reset blocked: power/SUR not yet stable.', 'warn');
  });
  $('btnLatch').addEventListener('click', function () { sim.latchTurbine(); });
  $('btnSync').addEventListener('click', function () { sim.closeBreaker(); });
  document.querySelectorAll('[data-rcp]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = +b.dataset.rcp;
      if (sim.ctrl.rcp[i]) { sim.ctrl.rcp[i] = false; sim.log('RCP ' + (i + 1) + ' stopped.', 'info'); }
      else sim.startRcp(i);
    });
  });

  /* ---------------- footer indicators ---------------- */
  var inds = [
    ['PWR RANGE', function (s) { return s.powerPct().toFixed(1); }, '%', function (s, v) { return v > 103 ? 2 : v > 100.5 ? 1 : 0; }],
    ['SRC RANGE', function (s) { return (s.Pn * 1e9).toExponential(1); }, 'cps', 0],
    ['STARTUP RATE', function (s) { return s.sur.toFixed(2); }, 'dpm', function (s, v) { return v > 3 ? 2 : v > 1.5 ? 1 : 0; }],
    ['REACTIVITY', function (s) { return Math.max(-9999, Math.round(s.rho)); }, 'pcm', 0],
    ['BORON', function (s) { return Math.round(s.boron); }, 'ppm', 0],
    ['T AVG', function (s) { return s.Tavg.toFixed(1); }, '°C', function (s) { return s.alarms.HI_TAVG ? 2 : 0; }],
    ['T HOT/COLD', function (s) { return s.filled ? s.tHot().toFixed(0) + '/' + s.tCold().toFixed(0) : '--'; }, '°C', function (s) { return s.alarms.HI_TAVG ? 2 : 0; }],
    ['T REF PROG', function (s) { return PWR.phases.tref(s).toFixed(1); }, '°C', 0],
    ['HEATUP', function (s) { return s.heatupRate.toFixed(0); }, '°C/h', function (s, v) { return Math.abs(v) > PWR.C.HEATUP_LIMIT ? 2 : Math.abs(v) > 45 ? 1 : 0; }],
    ['PUMP HEAT', function (s) { return (s.nPumps() * PWR.C.PUMP_HEAT).toFixed(1); }, 'MW', 0],
    ['RCS PRESS', function (s) { return s.P.toFixed(1); }, 'bar', function (s, v) { return (s.alarms.PT_HI || s.alarms.PT_LO || v > 160) ? 2 : 0; }],
    ['P-T WINDOW', function (s) { return Math.round(PWR.ptMin(s.Tavg)) + '-' + Math.round(PWR.ptMax(s.Tavg)); }, 'bar', function (s) { return (s.alarms.PT_HI || s.alarms.PT_LO) ? 2 : 0; }],
    ['SUBCOOL', function (s) { return s.filled ? s.subcooling().toFixed(0) : '--'; }, 'K', function (s, v) { return s.alarms.LO_SUBCOOL ? 2 : 0; }],
    ['PRZ LEVEL', function (s) { return s.przLevel.toFixed(0); }, '%', function (s, v) { return (s.alarms.PRZ_HI_L || s.alarms.PRZ_LO_L) ? 2 : 0; }],
    ['PRZ TEMP', function (s) { return s.Tprz.toFixed(0); }, '°C', 0],
    ['SG PRESS', function (s) { return s.Psg.toFixed(1); }, 'bar', function (s) { return s.alarms.SG_SAFETY ? 2 : 0; }],
    ['SG LEVEL', function (s) { return s.sgLevel.toFixed(0); }, '%', function (s, v) { return v < 30 || v > 75 ? 2 : v < 40 || v > 65 ? 1 : 0; }],
    ['STM / FEED', function (s) { return Math.round(s.steamFlow) + '/' + Math.round(s.feedFlow); }, 'kg/s', 0],
    ['GENERATOR', function (s) { return Math.round(s.mwe); }, 'MWe', 0],
    ['SCORE', function (s) { return Math.round(s.score); }, 'pts', 0]
  ];
  document.querySelector('footer').innerHTML = inds.map(function (d, i) {
    return '<div class="ind"><span class="lb">' + d[0] + '</span><span class="vl" id="ind' + i + '"></span><span class="un">' + d[2] + '</span></div>';
  }).join('');

  /* ---------------- annunciator ---------------- */
  var annDefs = [
    ['RX_TRIP', 'REACTOR TRIP'], ['TURB_TRIP', 'TURBINE TRIP'], ['HI_FLUX', 'HI NEUTRON FLUX'],
    ['HI_SUR', 'HI STARTUP RATE'], ['PRZ_HI_P', 'PRZ PRESS HI'], ['PRZ_LO_P', 'PRZ PRESS LO'],
    ['PRZ_HI_L', 'PRZ LEVEL HI'], ['PRZ_LO_L', 'PRZ LEVEL LO'], ['PORV', 'PORV OPEN'],
    ['PT_HI', 'P-T ENV HIGH'], ['PT_LO', 'P-T ENV LOW'], ['LO_SUBCOOL', 'SUBCOOL LOW'], ['HI_HEATUP', 'HEATUP RATE HI'],
    ['SG_LO_L', 'SG LEVEL LO'], ['SG_HI_L', 'SG LEVEL HI'], ['SG_SAFETY', 'SG SAFETY VLV'],
    ['HI_TAVG', 'TAVG HI'], ['LO_FLOW', 'RCS FLOW LO'], ['HTR_UNCOV', 'PRZ HTR UNCOV']
  ];
  $('annunciator').innerHTML = annDefs.map(function (d) {
    return '<div class="ann" id="ann_' + d[0] + '">' + d[1] + '</div>';
  }).join('') + '<button id="ackBtn">ACK</button>';
  $('ackBtn').addEventListener('click', function () {
    for (var k in sim.alarms) if (sim.alarms[k]) acked[k] = true;
  });

  /* sound */
  var audioCtx = null, muted = false;
  function beep() {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.type = 'square';
      g.gain.setValueAtTime(0.06, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.36);
    } catch (e) { /* audio unavailable */ }
  }
  $('muteBtn').addEventListener('click', function () {
    muted = !muted; this.textContent = muted ? '🔇' : '🔊';
  });

  /* ---------------- per-frame refresh ---------------- */
  var wasTripped = false;
  this.refresh = function () {
    var s = sim;
    if (s.tripped && !wasTripped) { $('segCB')._set(1); $('segSD')._set(1); }
    wasTripped = s.tripped;
    // fueling panel visibility
    $('pnlFuel').style.display = s.phase === 0 ? '' : 'none';
    $('loadBar').style.width = s.coreLoaded + '%';
    $('loadPct').textContent = Math.round(s.coreLoaded) + '%';
    $('cbBar').style.width = s.cbPos + '%';
    $('cbPos').textContent = s.cbPos.toFixed(0) + '%';
    $('sdBar').style.width = s.sdPos + '%';
    $('sdPos').textContent = s.sdPos.toFixed(0) + '%';
    $('boronV').textContent = Math.round(s.boron) + ' ppm';
    $('lpBkup').classList.toggle('on', s.ctrl.heaterBackup);
    $('lpPorv').classList.toggle('on', s.porvOpen);
    $('tripMsg').textContent = s.tripped ? 'TRIPPED: ' + s.tripReason : '';
    for (var i = 0; i < 4; i++) $('lpRcp' + i).classList.toggle('on', s.ctrl.rcp[i]);
    $('rpmV').textContent = Math.round(s.rpm) + ' rpm';
    $('lpSync').classList.toggle('on', s.ctrl.breaker);
    $('sgFlows').textContent = 'steam ' + Math.round(s.steamFlow) + ' kg/s · feed ' + Math.round(s.feedFlow) +
      ' kg/s · dump ' + Math.round(s.qDump) + ' MW';
    var net = s.ctrl.charging - s.ctrl.letdown;
    $('cvcsNet').textContent = 'net ' + (net >= 0 ? '+' : '') + net.toFixed(1) + ' kg/s ' +
      (Math.abs(net) < 0.05 ? '(balanced)' : net > 0 ? '(filling →pressure/level up)' : '(draining →pressure/level down)');

    inds.forEach(function (d, i) {
      var el = $('ind' + i), v = d[1](s);
      el.textContent = v;
      var sev = typeof d[3] === 'function' ? d[3](s, parseFloat(v)) : 0;
      el.className = 'vl' + (sev === 2 ? ' alarm' : sev === 1 ? ' warn' : '');
    });

    var anyNew = false;
    annDefs.forEach(function (d) {
      var on = !!s.alarms[d[0]];
      var el = $('ann_' + d[0]);
      if (!on) acked[d[0]] = false;
      else if (!acked[d[0]] && !el.classList.contains('lit')) anyNew = true;
      el.classList.toggle('lit', on);
      el.classList.toggle('blink', on && !acked[d[0]]);
    });
    if (anyNew) beep();

    // event log
    if (s.events.length !== lastEvtCount) {
      lastEvtCount = s.events.length;
      $('eventLog').innerHTML = s.events.slice(-6).reverse().map(function (e) {
        var hh = Math.floor(e.t / 3600), mm = Math.floor(e.t / 60) % 60;
        return '<div class="' + e.kind + '">[' + pad(hh) + ':' + pad(mm) + '] ' + e.msg + '</div>';
      }).join('');
    }

    // checklist
    var ph = PWR.phases.list[s.phase];
    var cl = '<h2>PHASE ' + (s.phase + 1) + '/6 — ' + ph.name + '</h2><p>' + ph.brief + '</p><ul>';
    ph.objectives.forEach(function (o) {
      cl += '<li class="' + (o._ok ? 'ok' : '') + '">' + o.text + '</li>';
    });
    cl += '</ul>';
    var clEl = $('clBody');
    if (clEl.innerHTML !== cl) clEl.innerHTML = cl;

    if (s.win) {
      $('winBanner').classList.add('show');
      $('winScore').textContent = 'Final score: ' + Math.round(s.score) +
        (s.events.some(function (e) { return e.msg.indexOf('REACTOR TRIP') === 0; }) ? '' : ' — flawless, no reactor trips!');
    }
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
};
