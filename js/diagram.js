/* 2D side-view rendering of the plant on a canvas.
 * Styled as a 1990s manga / mecha-cockpit cutaway: black ink linework on
 * aged paper, screentone (halftone-dot) shading whose density tracks
 * temperature, vermilion spot colour for heat & danger, hatch/speckle steam.
 * World coordinates: 960 x 560, scaled to fit the canvas element. */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {}) : {};

PWR.Diagram = function (canvas) {
  var ctx = canvas.getContext('2d');
  var W = 960, H = 560;
  var dashOff = 0;

  var INK = '#16120c', INK2 = '#2b251b', PAPER = '#efe9d8', PAPER2 = '#f6f2e6';
  var RED = '#cf1f2b', AMBER = '#c8860a', STEEL = '#cfc9b3';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, x) { return a + (b - a) * x; }

  // temperature -> ink colour: cool steel-blue ink rising to vermilion
  function tempInk(t, a) {
    var x = clamp((t - 20) / 325, 0, 1);
    var r = Math.round(lerp(40, 207, x));
    var g = Math.round(lerp(70, 31, x));
    var b = Math.round(lerp(112, 43, x));
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a === undefined ? 1 : a) + ')';
  }

  // fill an axis-aligned region with screentone dots; density 0..1
  function halftone(x, y, w, h, density, color) {
    if (w <= 0 || h <= 0) return;
    var sp = 5, r = 0.6 + 2.0 * clamp(density, 0, 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = color;
    for (var yy = y - sp; yy < y + h + sp; yy += sp) {
      for (var xx = x - sp; xx < x + w + sp; xx += sp) {
        ctx.beginPath(); ctx.arc(xx, yy, r, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  // bold inked outline of a rounded rect, paper-filled
  function inkBox(x, y, w, h, r, lw) {
    ctx.fillStyle = PAPER2;
    roundRect(x, y, w, h, r, true, false);
    ctx.strokeStyle = INK; ctx.lineWidth = lw || 3.5; ctx.lineJoin = 'round';
    roundRect(x, y, w, h, r, false, true);
  }

  function pipe(pts, color, width, flowing, speed) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // ink casing
    ctx.lineWidth = width + 3; ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    // fluid core
    ctx.lineWidth = width; ctx.strokeStyle = color;
    ctx.stroke();
    if (flowing) {
      ctx.lineWidth = Math.max(2, width - 4);
      ctx.strokeStyle = 'rgba(22,18,12,0.55)';
      ctx.setLineDash([3, 12]);
      ctx.lineDashOffset = -dashOff * (speed || 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function label(x, y, txt, color, size, align, mono) {
    ctx.fillStyle = color || INK2;
    ctx.font = (mono ? 'bold ' + (size || 11) + 'px "Share Tech Mono", monospace'
                     : 'bold ' + (size || 11) + 'px "Rajdhani", "Arial Narrow", sans-serif');
    ctx.textAlign = align || 'center';
    ctx.fillText(txt, x, y);
  }

  // small inked tag/plate behind a label, manga caption style
  function tag(cx, y, txt, size) {
    ctx.font = 'bold ' + (size || 10) + 'px "Rajdhani", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(txt).width + 10;
    ctx.fillStyle = INK;
    ctx.fillRect(cx - w / 2, y - (size || 10) - 1, w, (size || 10) + 5);
    ctx.fillStyle = PAPER2;
    ctx.fillText(txt, cx, y);
  }

  function vessel(s) {
    var x = 130, y = 300, w = 110, h = 210;
    inkBox(x, y, w, h, 18, 4);
    // water column (screentone by temperature)
    if (s.filled) {
      halftone(x + 7, y + 7, w - 14, h - 14, clamp((s.Tavg - 20) / 325, 0.08, 1), tempInk(s.Tavg, 0.9));
    } else {
      halftone(x + 7, y + 7, w - 14, h - 14, 0.08, tempInk(45, 0.7));
    }
    // core (fuel assemblies) — solid ink bars when loaded
    var loaded = Math.round(s.coreLoaded / 100 * 9);
    for (var i = 0; i < 9; i++) {
      var fx = x + 16 + i * 9.2;
      if (i < loaded) {
        ctx.fillStyle = INK; ctx.fillRect(fx, y + h - 110, 7, 86);
      } else {
        ctx.strokeStyle = 'rgba(22,18,12,0.3)'; ctx.lineWidth = 1;
        ctx.strokeRect(fx + 0.5, y + h - 110, 6, 86);
      }
    }
    // core glow with power — vermilion screentone burst
    var p = s.thermalPower();
    if (p > 1e-4 && loaded > 0) {
      var g = clamp((Math.log10(Math.max(p, 1e-4)) + 4) / 7.5, 0, 1);
      halftone(x + 14, y + h - 112, w - 28, 90, 0.2 + 0.8 * g, 'rgba(207,31,43,' + (0.4 + 0.5 * g) + ')');
    }
    // control rods (banks) — thick ink lines with white core
    var banks = [[s.sdPos, INK], [s.cbPos, RED], [s.sdPos, INK]];
    for (var b = 0; b < 3; b++) {
      var ins = (100 - banks[b][0]) / 100;
      var rx = x + 28 + b * 28;
      var y0 = y - (s.headOn ? 24 : 60), y1 = y + h - 112 + 88 * ins;
      ctx.strokeStyle = INK; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(rx, y0); ctx.lineTo(rx, y1); ctx.stroke();
      ctx.strokeStyle = banks[b][1]; ctx.lineWidth = banks[b][1] === RED ? 3 : 2.5;
      ctx.beginPath(); ctx.moveTo(rx, y0); ctx.lineTo(rx, y1); ctx.stroke();
    }
    // head
    if (s.headOn) {
      ctx.fillStyle = PAPER2; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2 + 2, 26, 0, Math.PI, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      halftone(x + 4, y - 24, w - 8, 24, 0.5, 'rgba(22,18,12,0.5)');
    } else {
      // head parked + polar crane
      ctx.fillStyle = PAPER2; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(60, 150, 38, 18, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(30, 60); ctx.lineTo(530, 60); ctx.stroke();
      var cx2 = s._loading ? x + w / 2 : 60;
      ctx.fillStyle = INK; ctx.fillRect(cx2 - 16, 54, 32, 12);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx2, 66); ctx.lineTo(cx2, s._loading ? 230 : 110); ctx.stroke();
      if (s._loading) { ctx.fillStyle = INK; ctx.fillRect(cx2 - 4, 230, 8, 40); }
    }
    tag(x + w / 2, y + h + 18, '原子炉 REACTOR VESSEL', 10);
    label(x + w / 2, y + h + 32, s.Tavg.toFixed(1) + ' °C', tempInk(Math.max(80, s.Tavg)), 12, 'center', true);
  }

  function pressurizer(s) {
    var x = 300, y = 170, w = 62, h = 190;
    inkBox(x, y, w, h, 22, 3.5);
    var lvl = s.filled ? s.przLevel / 100 : 0;
    if (s.filled) {
      var wh = (h - 12) * lvl;
      // steam space speckle
      if (s.bubble) {
        steamFill(x + 6, y + 6, w - 12, (h - 12) - wh);
        label(x + w / 2, y + 24, '蒸気', INK2, 9);
      }
      halftone(x + 6, y + 6 + (h - 12) - wh, w - 12, wh, clamp((s.Tprz - 20) / 325, 0.1, 1), tempInk(s.Tprz, 0.9));
    }
    // heaters
    var htr = s.ctrl.heater / 100 + (s.ctrl.heaterBackup ? 1 : 0);
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = htr > 0 ? RED : STEEL;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.fillRect(x + 10 + i * 12, y + h - 16, 8, 8);
      ctx.strokeRect(x + 10 + i * 12, y + h - 16, 8, 8);
    }
    // spray
    if (s.ctrl.spray > 0 && (s.ctrl.rcp[0] || s.ctrl.rcp[1])) {
      ctx.strokeStyle = tempInk(120, 0.85); ctx.lineWidth = 1.5;
      for (var j = 0; j < 5; j++) {
        ctx.beginPath(); ctx.moveTo(x + w / 2, y + 8);
        ctx.lineTo(x + 14 + j * 9, y + 30 + (dashOff * 2 + j * 7) % 14); ctx.stroke();
      }
    }
    // PORV
    ctx.fillStyle = s.porvOpen ? RED : STEEL; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.fillRect(x + w / 2 - 5, y - 16, 10, 12); ctx.strokeRect(x + w / 2 - 5, y - 16, 10, 12);
    if (s.porvOpen) label(x + w / 2, y - 22, 'PORV', RED, 10);
    // surge line to hot leg
    pipe([[x + w / 2, y + h], [x + w / 2, 408]], tempInk(s.filled ? s.Tprz : 45), 7, false);
    tag(x + w / 2, y + h + 52, '加圧器 PRZ', 10);
    var pbad = s.P > 160 || (s.alarms && (s.alarms.PT_HI || s.alarms.PT_LO));
    label(x + w / 2, 154, s.P.toFixed(1) + ' bar', pbad ? RED : INK, 12, 'center', true);
  }

  function steamGen(s) {
    var x = 415, y = 150, w = 92, h = 330;
    inkBox(x, y, w, h, 26, 3.5);
    // secondary water level (screentone)
    var lvl = s.sgLevel / 100;
    var wh = (h - 60) * lvl;
    steamFill(x + 6, y + 6, w - 12, (h - 12) - wh);
    halftone(x + 6, y + h - 6 - wh, w - 12, wh, clamp((s.Tsg - 20) / 325, 0.1, 1), tempInk(s.Tsg, 0.9));
    // U-tubes (primary) — bold ink
    ctx.strokeStyle = tempInk(s.filled ? s.tHot() : 45); ctx.lineWidth = 5; ctx.lineCap = 'round';
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
      ctx.fillStyle = 'rgba(22,18,12,0.45)';
      for (var bb = 0; bb < 10; bb++) {
        var bx = x + 14 + (bb * 37) % (w - 26);
        var by = y + h - 20 - ((dashOff * 3 + bb * 41) % Math.max(20, wh));
        ctx.beginPath(); ctx.arc(bx, by, 2.0, 0, 7); ctx.fill();
      }
    }
    tag(x + w / 2, y + h + 18, '蒸気発生器 SG', 10);
    label(x + w / 2, y + h + 32, s.Psg.toFixed(1) + ' bar · ' + s.sgLevel.toFixed(0) + '%', INK, 11, 'center', true);
    // safety valve steam plume
    if (s.qSafety > 1) {
      steamFill(x + w - 16, y - 56, 30, 50);
      label(x + w + 26, y - 40, '安全弁!', RED, 11);
    }
  }

  // white steam region with ink speckle + short hatch — manga "blank/steam"
  function steamFill(x, y, w, h) {
    if (w <= 0 || h <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = PAPER2; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(22,18,12,0.18)';
    for (var yy = y; yy < y + h; yy += 7) {
      for (var xx = x + ((yy / 7) % 2 ? 3 : 0); xx < x + w; xx += 7) {
        ctx.beginPath(); ctx.arc(xx, yy, 0.7, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  function rcp(s) {
    var x = 330, y = 480, r = 20;
    ctx.fillStyle = PAPER2; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
    var n = s.nPumps();
    ctx.save(); ctx.translate(x, y);
    if (n > 0) ctx.rotate(dashOff * 0.35);
    ctx.strokeStyle = n > 0 ? RED : INK2; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r - 6, 0); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    label(x, y + r + 16, 'RCP ×' + n, n > 0 ? RED : INK2, 11, 'center', true);
  }

  function turbineHall(s) {
    var on = s.qTurb > 1;
    var steamC = tempInk(Math.max(100, s.Tsg), 0.95);
    pipe([[461, 150], [461, 100], [700, 100], [700, 180], [724, 180]], steamC, 8, s.steamFlow > 5, 2);
    // governor/stop valve
    ctx.fillStyle = on ? RED : STEEL; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.fillRect(694, 92, 12, 16); ctx.strokeRect(694, 92, 12, 16);
    // HP turbine (trapezoid)
    ctx.fillStyle = PAPER2; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(724, 168); ctx.lineTo(800, 150); ctx.lineTo(800, 212); ctx.lineTo(724, 194);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // turbine blade hatch
    ctx.strokeStyle = 'rgba(22,18,12,0.4)'; ctx.lineWidth = 1.4;
    for (var t = 0; t < 6; t++) { ctx.beginPath(); ctx.moveTo(730 + t * 12, 162); ctx.lineTo(730 + t * 12, 200); ctx.stroke(); }
    // shaft + generator
    pipe([[800, 181], [836, 181]], INK2, 7, false);
    ctx.fillStyle = s.ctrl.breaker ? RED : PAPER2;
    ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(862, 181, 26, 0, 7); ctx.fill(); ctx.stroke();
    label(862, 186, s.ctrl.breaker ? Math.round(s.mwe) + '' : '~', s.ctrl.breaker ? '#fff' : INK, 13, 'center', true);
    label(862, 226, s.ctrl.breaker ? 'MWe' : 'GEN', INK2, 9);
    tag(762, 138, 'タービン TURBINE', 10);
    label(762, 232, Math.round(s.rpm) + ' rpm', s.rpm > 2980 ? RED : INK2, 10, 'center', true);
    // grid pylon when synced
    if (s.ctrl.breaker) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(862, 155); ctx.lineTo(862, 120); ctx.moveTo(848, 132); ctx.lineTo(876, 132); ctx.stroke();
    }
    // condenser
    inkBox(700, 300, 130, 70, 8, 3);
    label(765, 340, '復水器 CONDENSER', INK2, 10);
    ctx.strokeStyle = tempInk(40, 0.8); ctx.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(710, 318 + i * 14);
      for (var xx = 710; xx <= 820; xx += 10) ctx.lineTo(xx, 318 + i * 14 + (xx / 10 % 2 ? 3 : -3));
      ctx.stroke();
    }
    // exhaust to condenser
    pipe([[762, 212], [762, 300]], 'rgba(22,18,12,0.4)', 10, on, 2);
    // steam dump line (bypass)
    var dumpOn = s.qDump > 1;
    pipe([[640, 100], [640, 280], [712, 280], [712, 300]], dumpOn ? steamC : STEEL, 6, dumpOn, 2.5);
    ctx.fillStyle = dumpOn ? AMBER : STEEL; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.fillRect(634, 180, 12, 16); ctx.strokeRect(634, 180, 12, 16);
    label(615, 192, 'DUMP', dumpOn ? AMBER : INK2, 9);
    // feed line back to SG
    var feedOn = s.feedFlow > 1;
    pipe([[700, 350], [560, 350], [560, 420], [507, 420]], feedOn ? tempInk(150) : STEEL, 6, feedOn, 1.5);
    ctx.fillStyle = PAPER2; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(600, 350, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(600, 350, 2.5, 0, 7); ctx.fill();
    label(600, 378, 'FW PUMP', INK2, 9);
  }

  function loops(s) {
    var flowing = s.nPumps() > 0;
    var hotC = tempInk(s.filled ? s.tHot() : 45);
    var coldC = tempInk(s.filled ? s.tCold() : 45);
    pipe([[240, 408], [415, 408]], hotC, 12, flowing, 2);
    pipe([[461, 480], [350, 480]], coldC, 12, flowing, 2);
    pipe([[310, 480], [240, 480], [240, 460]], coldC, 12, flowing, 2);
    if (s.filled) {
      label(280, 400, s.tHot().toFixed(0) + '°', RED, 11, 'center', true);
      label(285, 474, s.tCold().toFixed(0) + '°', tempInk(80), 11, 'center', true);
    }
  }

  function containment() {
    // hazard-tape ground band
    ctx.save();
    ctx.fillStyle = INK; ctx.fillRect(0, 542, W, 18);
    for (var hx = -20; hx < W; hx += 28) {
      ctx.fillStyle = AMBER; ctx.beginPath();
      ctx.moveTo(hx, 542); ctx.lineTo(hx + 14, 542); ctx.lineTo(hx, 560); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // containment shell
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(30, 540); ctx.lineTo(30, 200);
    ctx.arc(285, 200, 255, Math.PI, 0, false);
    ctx.lineTo(540, 540);
    ctx.stroke();
    // turbine hall outline
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(660, 70); ctx.lineTo(910, 70);
    ctx.moveTo(660, 70); ctx.lineTo(660, 540);
    ctx.moveTo(910, 70); ctx.lineTo(910, 540);
    ctx.stroke();
    tag(285, 556, '格納容器 CONTAINMENT', 10);
    tag(785, 556, '機械室 TURBINE HALL', 10);
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
    // paper background with faint screentone
    ctx.fillStyle = PAPER2; ctx.fillRect(0, 0, cw, ch);
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
