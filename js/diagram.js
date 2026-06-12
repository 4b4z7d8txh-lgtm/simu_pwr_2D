/* 2D side-view rendering of the plant on a canvas.
 * World coordinates: 960 x 560, scaled to fit the canvas element. */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {}) : {};

PWR.Diagram = function (canvas) {
  var ctx = canvas.getContext('2d');
  var W = 960, H = 560;
  var dashOff = 0;

  function tempColor(t, a) {
    var x = Math.min(1, Math.max(0, (t - 20) / 330));
    var hue = 215 - 215 * x;
    return 'hsla(' + hue + ',75%,' + (38 + 18 * x) + '%,' + (a === undefined ? 1 : a) + ')';
  }

  function pipe(pts, color, width, flowing, speed) {
    ctx.save();
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    if (flowing) {
      ctx.lineWidth = Math.max(2, width - 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.setLineDash([6, 14]);
      ctx.lineDashOffset = -dashOff * (speed || 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function label(x, y, txt, color, size, align) {
    ctx.fillStyle = color || '#8fa1c4';
    ctx.font = (size || 10) + 'px Consolas, monospace';
    ctx.textAlign = align || 'center';
    ctx.fillText(txt, x, y);
  }

  function vessel(s) {
    var x = 130, y = 300, w = 110, h = 210;
    // vessel body
    ctx.fillStyle = '#3a4156';
    ctx.strokeStyle = '#5b6680'; ctx.lineWidth = 3;
    roundRect(x, y, w, h, 18, true, true);
    // water
    var wc = tempColor(s.Tavg);
    ctx.fillStyle = s.filled ? wc : tempColor(45, 0.55);
    roundRect(x + 7, y + 7, w - 14, h - 14, 12, true, false);
    // core (fuel assemblies)
    var loaded = Math.round(s.coreLoaded / 100 * 9);
    for (var i = 0; i < 9; i++) {
      var fx = x + 16 + i * 9.2;
      ctx.fillStyle = i < loaded ? '#6b7280' : 'rgba(60,66,80,0.25)';
      ctx.fillRect(fx, y + h - 110, 7, 86);
    }
    // core glow with power
    var p = s.thermalPower();
    if (p > 1e-4 && loaded > 0) {
      var g = Math.min(1, (Math.log10(Math.max(p, 1e-4)) + 4) / 7.5);
      ctx.fillStyle = 'rgba(120,220,255,' + (0.12 + 0.75 * g) + ')';
      ctx.fillRect(x + 14, y + h - 112, w - 28, 90);
    }
    // control rods
    var banks = [[s.sdPos, '#cbd5e1'], [s.cbPos, '#fbbf24'], [s.sdPos, '#cbd5e1']];
    for (var b = 0; b < 3; b++) {
      var ins = (100 - banks[b][0]) / 100; // insertion fraction
      var rx = x + 28 + b * 28;
      ctx.strokeStyle = banks[b][1]; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(rx, y - (s.headOn ? 24 : 60));
      ctx.lineTo(rx, y + h - 112 + 88 * ins);
      ctx.stroke();
    }
    // head
    if (s.headOn) {
      ctx.fillStyle = '#4b5470'; ctx.strokeStyle = '#5b6680'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2 + 2, 26, 0, Math.PI, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      // head parked + polar crane
      ctx.fillStyle = '#4b5470';
      ctx.beginPath(); ctx.ellipse(60, 150, 38, 18, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#67718c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(30, 60); ctx.lineTo(530, 60); ctx.stroke();
      // crane trolley above vessel while loading
      var cx2 = s._loading ? x + w / 2 : 60;
      ctx.fillRect(cx2 - 16, 54, 32, 12);
      ctx.beginPath(); ctx.moveTo(cx2, 66); ctx.lineTo(cx2, s._loading ? 230 : 110); ctx.stroke();
      if (s._loading) { ctx.fillStyle = '#9aa7c4'; ctx.fillRect(cx2 - 4, 230, 8, 40); }
    }
    label(x + w / 2, y + h + 16, 'REACTOR VESSEL', '#7a8aa8', 10);
    label(x + w / 2, y + h + 28, s.Tavg.toFixed(1) + ' °C', tempColor(Math.max(80, s.Tavg)), 11);
  }

  function pressurizer(s) {
    var x = 300, y = 170, w = 62, h = 190;
    ctx.fillStyle = '#3a4156'; ctx.strokeStyle = '#5b6680'; ctx.lineWidth = 3;
    roundRect(x, y, w, h, 22, true, true);
    // water + steam space
    var lvl = s.filled ? s.przLevel / 100 : 0;
    ctx.fillStyle = '#202637';
    roundRect(x + 6, y + 6, w - 12, h - 12, 16, true, false);
    if (s.filled) {
      ctx.fillStyle = tempColor(s.Tprz);
      var wh = (h - 12) * lvl;
      ctx.fillRect(x + 6, y + 6 + (h - 12) - wh, w - 12, wh);
      if (s.bubble) label(x + w / 2, y + 22, 'STEAM', 'rgba(220,230,255,0.7)', 8.5);
    }
    // heaters
    var htr = s.ctrl.heater / 100 + (s.ctrl.heaterBackup ? 1 : 0);
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = htr > 0 ? 'rgba(255,' + Math.round(120 + 100 * Math.min(1, htr)) + ',60,0.95)' : '#4a4438';
      ctx.fillRect(x + 10 + i * 12, y + h - 16, 8, 8);
    }
    // spray
    if (s.ctrl.spray > 0 && (s.ctrl.rcp[0] || s.ctrl.rcp[1])) {
      ctx.strokeStyle = 'rgba(150,200,255,0.8)'; ctx.lineWidth = 1.5;
      for (var j = 0; j < 5; j++) {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + 8);
        ctx.lineTo(x + 14 + j * 9, y + 30 + (dashOff * 2 + j * 7) % 14);
        ctx.stroke();
      }
    }
    // PORV
    ctx.fillStyle = s.porvOpen ? '#f87171' : '#374151';
    ctx.fillRect(x + w / 2 - 5, y - 16, 10, 12);
    if (s.porvOpen) label(x + w / 2, y - 22, 'PORV', '#f87171', 9);
    // surge line to hot leg
    pipe([[x + w / 2, y + h], [x + w / 2, 408]], tempColor(s.filled ? s.Tprz : 45), 7, false);
    label(x + w / 2, y + h + 50, 'PRZ', '#7a8aa8', 10);
    label(x + w / 2, 152, s.P.toFixed(1) + ' bar', s.P > 160 || (s.alarms && s.alarms.PT_LIMIT) ? '#f87171' : '#67e8f9', 11);
  }

  function steamGen(s) {
    var x = 415, y = 150, w = 92, h = 330;
    ctx.fillStyle = '#3a4156'; ctx.strokeStyle = '#5b6680'; ctx.lineWidth = 3;
    roundRect(x, y, w, h, 26, true, true);
    ctx.fillStyle = '#202637';
    roundRect(x + 6, y + 6, w - 12, h - 12, 20, true, false);
    // secondary water level
    var lvl = s.sgLevel / 100;
    ctx.fillStyle = tempColor(s.Tsg, 0.9);
    var wh = (h - 60) * lvl;
    ctx.fillRect(x + 6, y + h - 6 - wh, w - 12, wh);
    // U-tubes (primary)
    ctx.strokeStyle = tempColor(s.filled ? s.tHot() : 45); ctx.lineWidth = 5;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 26 + i * 8, y + h - 10);
      ctx.lineTo(x + 26 + i * 8, y + 130);
      ctx.arc(x + w / 2, y + 130, (w / 2 - 26) - i * 8, Math.PI, 0, false);
      ctx.lineTo(x + w - 26 - i * 8, y + h - 10);
      ctx.stroke();
    }
    // boiling bubbles
    if (s.Tsg > 110 && s.steamFlow > 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (var b = 0; b < 8; b++) {
        var bx = x + 14 + (b * 37) % (w - 26);
        var by = y + h - 20 - ((dashOff * 3 + b * 41) % Math.max(20, wh));
        ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, 7); ctx.fill();
      }
    }
    label(x + w / 2, y + h + 16, 'STEAM GENERATOR', '#7a8aa8', 10);
    label(x + w / 2, y + h + 28, s.Psg.toFixed(1) + ' bar · ' + s.sgLevel.toFixed(0) + '%', '#67e8f9', 10);
    // safety valve steam plume
    if (s.qSafety > 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (var k = 0; k < 4; k++) {
        ctx.beginPath(); ctx.arc(x + w - 10 + k * 6, y - 12 - k * 9, 5 + k * 2, 0, 7); ctx.fill();
      }
      label(x + w + 24, y - 40, 'SG SAFETY!', '#f87171', 10);
    }
  }

  function rcp(s) {
    var x = 330, y = 480, r = 20;
    ctx.fillStyle = '#39455f'; ctx.strokeStyle = '#5b6680'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    var n = s.nPumps();
    ctx.save(); ctx.translate(x, y);
    if (n > 0) ctx.rotate(dashOff * 0.35);
    ctx.strokeStyle = n > 0 ? '#9fd8ff' : '#566076'; ctx.lineWidth = 3.5;
    for (var i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r - 6, 0); ctx.stroke(); }
    ctx.restore();
    label(x, y + r + 14, 'RCP ×' + n, n > 0 ? '#4ade80' : '#7a8aa8', 10);
  }

  function turbineHall(s) {
    // steam line SG top -> turbine
    var on = s.qTurb > 1;
    var steamC = tempColor(Math.max(100, s.Tsg), 0.95);
    pipe([[461, 150], [461, 100], [700, 100], [700, 180], [724, 180]], steamC, 8, s.steamFlow > 5, 2);
    // governor/stop valve
    ctx.fillStyle = on ? '#4ade80' : '#374151';
    ctx.fillRect(694, 92, 12, 16);
    // HP turbine (trapezoid) + generator
    ctx.fillStyle = '#3f4965'; ctx.strokeStyle = '#5b6680'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(724, 168); ctx.lineTo(800, 150); ctx.lineTo(800, 212); ctx.lineTo(724, 194);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // shaft + generator
    pipe([[800, 181], [836, 181]], '#67718c', 7, false);
    ctx.fillStyle = s.ctrl.breaker ? '#14532d' : '#39455f';
    ctx.strokeStyle = s.ctrl.breaker ? '#4ade80' : '#5b6680';
    ctx.beginPath(); ctx.arc(862, 181, 26, 0, 7); ctx.fill(); ctx.stroke();
    label(862, 185, s.ctrl.breaker ? Math.round(s.mwe) + '' : '~', '#fff', 12);
    label(862, 224, s.ctrl.breaker ? 'MWe' : 'GEN', '#7a8aa8', 9);
    label(762, 140, 'TURBINE', '#7a8aa8', 10);
    label(762, 230, Math.round(s.rpm) + ' rpm', s.rpm > 2980 ? '#4ade80' : '#8fa1c4', 10);
    // grid pylon when synced
    if (s.ctrl.breaker) {
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(862, 155); ctx.lineTo(862, 120); ctx.moveTo(848, 132); ctx.lineTo(876, 132); ctx.stroke();
    }
    // condenser
    ctx.fillStyle = '#2c3650'; ctx.strokeStyle = '#5b6680'; ctx.lineWidth = 2.5;
    roundRect(700, 300, 130, 70, 8, true, true);
    label(765, 340, 'CONDENSER', '#7a8aa8', 10);
    ctx.strokeStyle = '#3d6e9e'; ctx.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(710, 318 + i * 14);
      for (var xx = 710; xx <= 820; xx += 10) ctx.lineTo(xx, 318 + i * 14 + (xx / 10 % 2 ? 3 : -3));
      ctx.stroke();
    }
    // exhaust to condenser
    pipe([[762, 212], [762, 300]], 'rgba(160,180,220,0.5)', 10, on, 2);
    // steam dump line (bypass)
    var dumpOn = s.qDump > 1;
    pipe([[640, 100], [640, 280], [712, 280], [712, 300]], dumpOn ? steamC : '#39455f', 6, dumpOn, 2.5);
    ctx.fillStyle = dumpOn ? '#fbbf24' : '#374151';
    ctx.fillRect(634, 180, 12, 16);
    label(615, 192, 'DUMP', dumpOn ? '#fbbf24' : '#566076', 9);
    // feed line back to SG
    var feedOn = s.feedFlow > 1;
    pipe([[700, 350], [560, 350], [560, 420], [507, 420]], feedOn ? tempColor(150) : '#39455f', 6, feedOn, 1.5);
    ctx.fillStyle = '#39455f'; ctx.strokeStyle = '#5b6680';
    ctx.beginPath(); ctx.arc(600, 350, 11, 0, 7); ctx.fill(); ctx.stroke();
    label(600, 378, 'FW PUMP', '#7a8aa8', 9);
  }

  function loops(s) {
    var flowing = s.nPumps() > 0;
    var hotC = tempColor(s.filled ? s.tHot() : 45);
    var coldC = tempColor(s.filled ? s.tCold() : 45);
    // hot leg: vessel -> SG
    pipe([[240, 408], [415, 408]], hotC, 12, flowing, 2);
    // cold leg: SG -> RCP -> vessel
    pipe([[461, 480], [350, 480]], coldC, 12, flowing, 2);
    pipe([[310, 480], [240, 480], [240, 460]], coldC, 12, flowing, 2);
    label(280, 398, s.filled ? s.tHot().toFixed(0) + '°' : '', '#ff9d7a', 10);
    label(285, 472, s.filled ? s.tCold().toFixed(0) + '°' : '', '#7ab8ff', 10);
  }

  function containment() {
    ctx.strokeStyle = '#46506b'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(30, 540); ctx.lineTo(30, 200);
    ctx.arc(285, 200, 255, Math.PI, 0, false);
    ctx.lineTo(540, 540);
    ctx.stroke();
    // turbine hall outline
    ctx.strokeStyle = '#333d54'; ctx.lineWidth = 3;
    ctx.strokeRect(660, 70, 250, 0.1);
    ctx.beginPath(); ctx.moveTo(660, 70); ctx.lineTo(660, 540); ctx.moveTo(910, 70); ctx.lineTo(910, 540); ctx.stroke();
    // ground
    ctx.strokeStyle = '#222a3d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 542); ctx.lineTo(W, 542); ctx.stroke();
    label(285, 555, 'CONTAINMENT', '#46506b', 10);
    label(785, 555, 'TURBINE HALL', '#46506b', 10);
  }

  function roundRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  this.draw = function (s, dtReal) {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    var sc = Math.min(cw / W, ch / H);
    ctx.setTransform(sc, 0, 0, sc, (cw - W * sc) / 2, (ch - H * sc) / 2);
    dashOff += dtReal * 22;

    containment();
    loops(s);
    rcp(s);
    vessel(s);
    pressurizer(s);
    steamGen(s);
    turbineHall(s);
  };
};
