/* 2D process mimic of the plant, drawn as a modern control-room SCADA diagram:
 * machined slate components on a dark board, colour-coded process lines with
 * animated flow, fluid fills tinted by temperature (cool blue -> hot red),
 * status LEDs and clean engineering labels.
 * World coordinates: 960 x 560, scaled to fit the canvas element. */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {}) : {};

PWR.Diagram = function (canvas) {
  var ctx = canvas.getContext('2d');
  var W = 960, H = 560;
  var dashOff = 0;

  var BG0 = '#0c141d', BG1 = '#0a1018', GRID = '#16242f',
      STEEL_HI = '#2b3c4d', STEEL_LO = '#131c26', BEZEL = '#41597010',
      EDGE = '#3d556c', TXT = '#cdd9e5', DIM = '#6c7f92',
      CYAN = '#45d4e6', AMBER = '#ffb13b', RED = '#ff4759', BLUE = '#4ea4ff',
      STEAM = '#b9d3e6';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, x) { return a + (b - a) * x; }

  // temperature -> colour: cold blue (hue 210) climbing to hot red (hue 8)
  function tempC(t, a, light) {
    var x = clamp((t - 20) / 310, 0, 1);
    var hue = lerp(210, 8, Math.pow(x, 0.9));
    var sat = lerp(55, 85, x);
    return 'hsla(' + hue.toFixed(0) + ',' + sat.toFixed(0) + '%,' + (light || 52) + '%,' + (a === undefined ? 1 : a) + ')';
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

  // machined slate component body
  function panelBox(x, y, w, h, r) {
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, STEEL_HI); g.addColorStop(0.5, '#1b2734'); g.addColorStop(1, STEEL_LO);
    ctx.fillStyle = g;
    roundRect(x, y, w, h, r, true, false);
    ctx.strokeStyle = EDGE; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    roundRect(x, y, w, h, r, false, true);
    // top sheen
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + r, y + 1.2); ctx.lineTo(x + w - r, y + 1.2); ctx.stroke();
  }

  // temperature-tinted fluid fill with a brighter meniscus at the top
  function fluidFill(x, y, w, h, temp, alpha) {
    if (w <= 0 || h <= 0) return;
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, tempC(temp, (alpha || 0.85), 58));
    g.addColorStop(1, tempC(temp, (alpha || 0.85) * 0.8, 38));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = tempC(temp, 0.9, 70); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y + 0.7); ctx.lineTo(x + w, y + 0.7); ctx.stroke();
  }

  // soft white steam / vapour cloud
  function steamFill(x, y, w, h) {
    if (w <= 0 || h <= 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (var k = 0; k < 26; k++) {
      var px = x + ((k * 53 + dashOff * 6) % (w + 30)) - 15;
      var py = y + ((k * 37 + dashOff * 4) % (h + 20)) - 10;
      var rr = 5 + (k % 4) * 3;
      var rg = ctx.createRadialGradient(px, py, 0, px, py, rr);
      rg.addColorStop(0, 'rgba(200,222,236,0.30)'); rg.addColorStop(1, 'rgba(200,222,236,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(px, py, rr, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function pipe(pts, color, width, flowing, speed) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // dark casing
    ctx.lineWidth = width + 4; ctx.strokeStyle = '#0a1118';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    // fluid core
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
    // inner highlight
    ctx.lineWidth = Math.max(1, width * 0.32); ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
    // animated flow chevrons
    if (flowing) {
      ctx.lineWidth = Math.max(2, width - 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.setLineDash([3, 16]);
      ctx.lineDashOffset = -dashOff * (speed || 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function label(x, y, txt, color, size, align, mono) {
    ctx.fillStyle = color || DIM;
    ctx.font = (mono ? '600 ' + (size || 11) + 'px "IBM Plex Mono", monospace'
                     : '600 ' + (size || 11) + 'px "Barlow Condensed", sans-serif');
    ctx.textAlign = align || 'center';
    ctx.fillText(txt, x, y);
  }

  // small caption chip behind a label
  function tag(cx, y, txt, size) {
    ctx.font = '600 ' + (size || 10) + 'px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(txt).width + 14;
    ctx.fillStyle = 'rgba(10,17,24,0.85)';
    roundRect(cx - w / 2, y - (size || 10) - 2, w, (size || 10) + 7, 3, true, false);
    ctx.strokeStyle = '#243a4a'; ctx.lineWidth = 1;
    roundRect(cx - w / 2, y - (size || 10) - 2, w, (size || 10) + 7, 3, false, true);
    ctx.fillStyle = '#aebeca'; ctx.letterSpacing = '0.5px';
    ctx.fillText(txt, cx, y);
    ctx.letterSpacing = '0px';
  }

  // status LED
  function led(x, y, on, color, r) {
    r = r || 4;
    ctx.fillStyle = on ? color : '#1a2530';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#05090d'; ctx.lineWidth = 1; ctx.stroke();
    if (on) {
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
      rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5; ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
  }

  // capsule outline: vertical walls, flat top (head sits on it), domed bottom
  function capsulePath(ix, top, iw, ibot, iry) {
    var icx = ix + iw / 2;
    ctx.beginPath();
    ctx.moveTo(ix, top);
    ctx.lineTo(ix + iw, top);
    ctx.lineTo(ix + iw, ibot);
    ctx.ellipse(icx, ibot, iw / 2, iry, 0, 0, Math.PI, false);
    ctx.closePath();
  }

  function vessel(s) {
    var x = 130, y = 300, w = 110, h = 210, cx = x + w / 2;
    var ry = 34, bodyBot = y + h - ry;            // shallow domed bottom
    var CREAM = '#e3ce92', CREAM_DK = '#a08646', CREAM_HI = '#f2e4af';
    var loaded = Math.round(s.coreLoaded / 100 * 9);

    /* ---------- pressure-vessel shell ---------- */
    capsulePath(x, y, w, bodyBot, ry);
    ctx.fillStyle = '#0c141d'; ctx.fill();

    /* ---------- interior: fluid, graphite moderator, fuel ---------- */
    ctx.save();
    capsulePath(x + 4, y + 4, w - 8, bodyBot, ry - 2); ctx.clip();
    if (s.filled) fluidFill(x + 4, y + 4, w - 8, h - 8, s.Tavg, 0.9);
    // graphite moderator block
    var gTop = y + h - 132, gBot = y + h - 30;
    var gg = ctx.createLinearGradient(0, gTop, 0, gBot);
    gg.addColorStop(0, 'rgba(96,102,110,0.92)'); gg.addColorStop(1, 'rgba(58,63,70,0.92)');
    ctx.fillStyle = gg;
    roundRect(x + 13, gTop, w - 26, gBot - gTop, 4, true, false);
    ctx.strokeStyle = 'rgba(20,26,32,0.55)'; ctx.lineWidth = 1;
    for (var gj = 1; gj < 5; gj++) { ctx.beginPath(); ctx.moveTo(x + 13, gTop + (gBot - gTop) * gj / 5); ctx.lineTo(x + w - 13, gTop + (gBot - gTop) * gj / 5); ctx.stroke(); }
    // fuel rods (orange) seated in the graphite
    var fTop = gTop + 8, fLen = (gBot - gTop) - 16;
    for (var i = 0; i < 9; i++) {
      var fx = x + 17 + i * 8.6;
      if (i < loaded) {
        var fg = ctx.createLinearGradient(0, fTop, 0, fTop + fLen);
        fg.addColorStop(0, '#f4a13a'); fg.addColorStop(1, '#c25608');
        ctx.fillStyle = fg; roundRect(fx, fTop, 5.5, fLen, 1.5, true, false);
        ctx.strokeStyle = 'rgba(140,60,0,0.6)'; ctx.lineWidth = 0.5; roundRect(fx, fTop, 5.5, fLen, 1.5, false, true);
      } else {
        ctx.strokeStyle = 'rgba(150,120,90,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(fx + 0.5, fTop, 4.5, fLen);
      }
    }
    // core glow with power
    var p = s.thermalPower();
    if (p > 1e-4 && loaded > 0) {
      var gI = clamp((Math.log10(Math.max(p, 1e-4)) + 4) / 7.5, 0, 1);
      var cgy = (fTop + fTop + fLen) / 2;
      var rg = ctx.createRadialGradient(cx, cgy, 2, cx, cgy, 66);
      rg.addColorStop(0, 'rgba(255,170,70,' + (0.4 + 0.5 * gI) + ')');
      rg.addColorStop(0.5, 'rgba(255,90,40,' + (0.25 + 0.35 * gI) + ')');
      rg.addColorStop(1, 'rgba(255,71,89,0)');
      ctx.fillStyle = rg; ctx.fillRect(x + 4, fTop - 16, w - 8, fLen + 32);
    }
    ctx.restore();

    // nozzle stubs (hot / cold leg penetrations) — same elevation, opposite sides
    ctx.fillStyle = CREAM_DK; ctx.strokeStyle = '#3a2f12'; ctx.lineWidth = 1;
    roundRect(x + w - 3, 369, 12, 13, 2, true, true);   // hot leg  (right)
    roundRect(x - 9, 369, 12, 13, 2, true, true);       // cold leg (left)

    /* ---------- shell wall (cream double wall) ---------- */
    capsulePath(x, y, w, bodyBot, ry);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2a2207'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = CREAM; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();

    /* ---------- vessel head / open top ---------- */
    if (s.headOn) {
      // domed head, cream to match the shell
      var hg = ctx.createLinearGradient(0, y - 42, 0, y + 2);
      hg.addColorStop(0, CREAM_HI); hg.addColorStop(0.55, CREAM); hg.addColorStop(1, CREAM_DK);
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.ellipse(cx, y - 1, w / 2 - 1, 40, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2a2207'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(cx, y - 1, w / 2 - 1, 40, 0, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = CREAM_HI; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(cx, y - 1, w / 2 - 1, 40, 0, Math.PI, 0); ctx.stroke();
      // specular sheen on the dome
      ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, y - 1, w / 2 - 12, Math.PI * 1.16, Math.PI * 1.46); ctx.stroke();
      // bolted flange ring at the head-to-shell joint
      var fr = ctx.createLinearGradient(0, y - 4, 0, y + 9);
      fr.addColorStop(0, CREAM); fr.addColorStop(1, CREAM_DK);
      ctx.fillStyle = fr; ctx.strokeStyle = '#2a2207'; ctx.lineWidth = 1.5;
      roundRect(x - 7, y - 4, w + 14, 12, 2, true, true);
      ctx.fillStyle = '#2a2207';
      for (var fb = 0; fb < 9; fb++) { ctx.beginPath(); ctx.arc(x - 1 + fb * (w + 2) / 8, y + 2, 1.5, 0, 7); ctx.fill(); }
      // central vent / instrumentation nozzle
      ctx.fillStyle = CREAM_DK; ctx.strokeStyle = '#2a2207'; ctx.lineWidth = 1.2;
      roundRect(cx - 5, y - 55, 10, 15, 2, true, true);
    } else {
      // OPEN VESSEL — exposed flange rim and bore
      ctx.fillStyle = CREAM_DK; ctx.strokeStyle = '#2a2207'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(cx, y, w / 2 + 4, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = CREAM_HI; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, y, w / 2 + 4, 12, 0, 0, Math.PI * 2); ctx.stroke();
      // bore looking down into the open vessel
      var bore = ctx.createLinearGradient(0, y - 9, 0, y + 9);
      bore.addColorStop(0, '#05090d'); bore.addColorStop(1, '#1a2a36');
      ctx.fillStyle = bore;
      ctx.beginPath(); ctx.ellipse(cx, y, w / 2 - 3, 7.5, 0, 0, Math.PI * 2); ctx.fill();
      // stud holes around the flange
      ctx.fillStyle = '#2a2207';
      for (var ob = 0; ob < 14; ob++) {
        var oa = ob / 14 * Math.PI * 2;
        ctx.beginPath(); ctx.arc(cx + Math.cos(oa) * (w / 2 + 0.5), y + Math.sin(oa) * 9.5, 1.5, 0, 7); ctx.fill();
      }
      label(cx, y - 13, 'VESSEL OPEN', AMBER, 9);
      // head parked on its stand + polar crane
      ctx.fillStyle = CREAM_DK; ctx.strokeStyle = '#2a2207'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(58, 150, 38, 15, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = CREAM_HI; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(58, 150, 38, 15, 0, Math.PI, 0); ctx.stroke();
      ctx.strokeStyle = '#46607a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(30, 56); ctx.lineTo(530, 56); ctx.stroke();
      var cx2 = s._loading ? cx : 58;
      ctx.fillStyle = '#2b3c4d'; ctx.strokeStyle = EDGE; ctx.lineWidth = 1.5;
      roundRect(cx2 - 16, 49, 32, 13, 2, true, true);
      ctx.strokeStyle = '#5a6f84'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx2, 62); ctx.lineTo(cx2, s._loading ? 232 : 108); ctx.stroke();
      if (s._loading) { ctx.fillStyle = AMBER; ctx.fillRect(cx2 - 4, 232, 8, 40); }
    }

    /* ---------- charge tubes + control-rod banks ---------- */
    var topY = s.headOn ? 250 : y + 12;
    if (s.headOn) {
      // CRDM charge tubes rising out of the head
      ctx.strokeStyle = '#11161c'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      [x + 18, x + 46, x + 64, x + 92].forEach(function (tx) {
        ctx.beginPath(); ctx.moveTo(tx, topY + 2); ctx.lineTo(tx, y - 4); ctx.stroke();
      });
    }
    // driven control-rod banks
    var banks = [[s.sdPos, '#9aa7b4'], [s.cbPos, CYAN], [s.sdPos, '#9aa7b4']];
    for (var b = 0; b < 3; b++) {
      var ins = (100 - banks[b][0]) / 100;
      var rx = x + 28 + b * 27;
      var y1 = fTop - 6 + (fLen + 12) * ins;
      ctx.strokeStyle = '#11161c'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(rx, topY); ctx.lineTo(rx, y1); ctx.stroke();
      ctx.strokeStyle = banks[b][1]; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(rx, topY); ctx.lineTo(rx, y1); ctx.stroke();
      if (s.headOn) {
        // drive housing sits on top of the head
        ctx.fillStyle = '#222d38'; ctx.strokeStyle = EDGE; ctx.lineWidth = 1;
        roundRect(rx - 5, topY - 10, 10, 12, 2, true, true);
      }
    }

    tag(cx, bodyBot + ry + 16, 'REACTOR PRESSURE VESSEL', 10);
    label(cx, bodyBot + ry + 32, s.Tavg.toFixed(1) + ' \u00b0C', tempC(Math.max(60, s.Tavg), 1, 64), 12, 'center', true);
  }

  function pressurizer(s) {
    var x = 300, y = 170, w = 62, h = 190;
    panelBox(x, y, w, h, 18);
    ctx.save();
    roundRect(x + 6, y + 6, w - 12, h - 12, 12, false, false); ctx.clip();
    ctx.fillStyle = '#0c141d'; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    var lvl = s.filled ? s.przLevel / 100 : 0;
    if (s.filled) {
      var wh = (h - 12) * lvl;
      if (s.bubble) { steamFill(x + 6, y + 6, w - 12, (h - 12) - wh); label(x + w / 2, y + 22, 'STEAM', DIM, 8); }
      fluidFill(x + 6, y + 6 + (h - 12) - wh, w - 12, wh, s.Tprz, 0.9);
    }
    ctx.restore();
    // heaters
    var htr = s.ctrl.heater / 100 + (s.ctrl.heaterBackup ? 1 : 0);
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = htr > 0 ? 'hsl(' + (28 - htr * 14) + ',90%,55%)' : '#2a3a48';
      ctx.strokeStyle = '#05090d'; ctx.lineWidth = 1;
      roundRect(x + 10 + i * 12, y + h - 17, 8, 9, 1, true, true);
      if (htr > 0) { ctx.shadowColor = RED; ctx.shadowBlur = 6; roundRect(x + 10 + i * 12, y + h - 17, 8, 9, 1, true, false); ctx.shadowBlur = 0; }
    }
    // spray
    if (s.ctrl.spray > 0 && (s.ctrl.rcp[0] || s.ctrl.rcp[1])) {
      ctx.strokeStyle = tempC(110, 0.85, 64); ctx.lineWidth = 1.4;
      for (var j = 0; j < 5; j++) {
        ctx.beginPath(); ctx.moveTo(x + w / 2, y + 8);
        ctx.lineTo(x + 14 + j * 9, y + 30 + (dashOff * 2 + j * 7) % 14); ctx.stroke();
      }
    }
    // PORV
    ctx.fillStyle = s.porvOpen ? RED : '#2a3a48'; ctx.strokeStyle = '#05090d'; ctx.lineWidth = 1.5;
    roundRect(x + w / 2 - 5, y - 16, 10, 12, 2, true, true);
    if (s.porvOpen) label(x + w / 2, y - 22, 'PORV', RED, 10);
    // surge line to hot leg
    pipe([[x + w / 2, y + h], [x + w / 2, 375]], tempC(s.filled ? s.Tprz : 45, 1), 7, false);
    tag(x + w / 2, y + h + 54, 'PRESSURIZER', 10);
    var pbad = s.P > 160 || (s.alarms && (s.alarms.PT_HI || s.alarms.PT_LO));
    label(x + w / 2, 156, s.P.toFixed(1) + ' bar', pbad ? RED : CYAN, 12, 'center', true);
  }

  function steamGen(s) {
    var x = 415, y = 150, w = 92, h = 330;
    panelBox(x, y, w, h, 22);
    ctx.save();
    roundRect(x + 6, y + 6, w - 12, h - 12, 16, false, false); ctx.clip();
    ctx.fillStyle = '#0c141d'; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    var lvl = s.sgLevel / 100;
    var wh = (h - 60) * lvl;
    steamFill(x + 6, y + 6, w - 12, (h - 12) - wh);
    fluidFill(x + 6, y + h - 6 - wh, w - 12, wh, s.Tsg, 0.9);
    // U-tubes (primary)
    ctx.strokeStyle = tempC(s.filled ? s.tHot() : 45, 0.95); ctx.lineWidth = 4.5; ctx.lineCap = 'round';
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
      ctx.fillStyle = 'rgba(200,222,236,0.5)';
      for (var bb = 0; bb < 12; bb++) {
        var bx = x + 14 + (bb * 37) % (w - 26);
        var by = y + h - 20 - ((dashOff * 3 + bb * 41) % Math.max(20, wh));
        ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
    // channel-head nozzle stubs at the bottom (hot-leg inlet / crossover outlet)
    ctx.fillStyle = '#2b3c4d'; ctx.strokeStyle = EDGE; ctx.lineWidth = 1.2;
    roundRect(414, y + h - 1, 12, 10, 2, true, true);
    roundRect(494, y + h - 1, 12, 10, 2, true, true);
    tag(445, y + h + 30, 'STEAM GENERATOR', 10);
    label(445, y + h + 46, s.Psg.toFixed(1) + ' bar  \u00b7  ' + s.sgLevel.toFixed(0) + '%', TXT, 11, 'center', true);
    // safety valve steam plume
    if (s.qSafety > 1) {
      steamFill(x + w - 16, y - 58, 34, 54);
      label(x + w + 28, y - 42, 'SAFETY!', RED, 11);
    }
  }

  function rcp(s) {
    var x = 330, y = 480, r = 21;
    panelBox(x - r, y - r, r * 2, r * 2, r);
    ctx.fillStyle = '#0c141d';
    ctx.beginPath(); ctx.arc(x, y, r - 4, 0, 7); ctx.fill();
    ctx.strokeStyle = EDGE; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r - 4, 0, 7); ctx.stroke();
    var n = s.nPumps();
    ctx.save(); ctx.translate(x, y);
    if (n > 0) ctx.rotate(dashOff * 0.4);
    ctx.strokeStyle = n > 0 ? CYAN : '#3a4a5a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r - 8, 0); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#7f93a6'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
    led(x + r - 3, y - r + 3, n > 0, CYAN, 3.5);
    label(x, y + r + 15, 'RCP \u00d7' + n, n > 0 ? CYAN : DIM, 11, 'center', true);
  }

  function turbineHall(s) {
    var on = s.qTurb > 1;
    var steamC = tempC(Math.max(100, s.Tsg), 0.95, 70);
    pipe([[461, 150], [461, 100], [700, 100], [700, 180], [724, 180]], steamC, 8, s.steamFlow > 5, 2);
    // governor/stop valve
    ctx.fillStyle = on ? CYAN : '#2a3a48'; ctx.strokeStyle = '#05090d'; ctx.lineWidth = 1.5;
    roundRect(694, 92, 12, 16, 2, true, true);
    // HP turbine casing
    var tg = ctx.createLinearGradient(724, 150, 800, 212);
    tg.addColorStop(0, STEEL_HI); tg.addColorStop(1, STEEL_LO);
    ctx.fillStyle = tg; ctx.strokeStyle = EDGE; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(724, 168); ctx.lineTo(800, 150); ctx.lineTo(800, 212); ctx.lineTo(724, 194);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // turbine blades
    ctx.strokeStyle = on ? 'rgba(69,212,230,0.5)' : 'rgba(120,140,160,0.35)'; ctx.lineWidth = 1.4;
    for (var t = 0; t < 6; t++) { ctx.beginPath(); ctx.moveTo(730 + t * 12, 162); ctx.lineTo(730 + t * 12, 200); ctx.stroke(); }
    // shaft + generator
    pipe([[800, 181], [836, 181]], '#46607a', 7, false);
    var genOn = s.ctrl.breaker;
    var ggr = ctx.createRadialGradient(862, 177, 3, 862, 181, 28);
    ggr.addColorStop(0, genOn ? '#3ee089' : '#28384a'); ggr.addColorStop(1, genOn ? '#1f9d5d' : '#16212c');
    ctx.fillStyle = ggr; ctx.strokeStyle = EDGE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(862, 181, 26, 0, 7); ctx.fill(); ctx.stroke();
    label(862, 186, genOn ? Math.round(s.mwe) + '' : '~', genOn ? '#042312' : DIM, 14, 'center', true);
    label(862, 226, genOn ? 'MWe' : 'GEN', DIM, 9);
    tag(762, 138, 'TURBINE', 10);
    label(762, 232, Math.round(s.rpm) + ' rpm', s.rpm > 2980 ? CYAN : DIM, 10, 'center', true);
    // grid pylon when synced
    if (genOn) {
      ctx.strokeStyle = '#5a6f84'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(862, 155); ctx.lineTo(862, 120);
      ctx.moveTo(848, 132); ctx.lineTo(876, 132); ctx.stroke();
      led(862, 116, true, CYAN, 3);
    }
    // condenser
    panelBox(700, 300, 130, 70, 8);
    label(765, 318, 'CONDENSER', DIM, 10);
    ctx.strokeStyle = tempC(38, 0.85, 60); ctx.lineWidth = 2;
    for (var i2 = 0; i2 < 3; i2++) {
      ctx.beginPath(); ctx.moveTo(712, 332 + i2 * 12);
      for (var xx = 712; xx <= 818; xx += 10) ctx.lineTo(xx, 332 + i2 * 12 + (xx / 10 % 2 ? 3 : -3));
      ctx.stroke();
    }
    // exhaust to condenser
    pipe([[762, 212], [762, 300]], 'rgba(120,150,170,0.45)', 10, on, 2);
    // steam dump (bypass)
    var dumpOn = s.qDump > 1;
    pipe([[640, 100], [640, 280], [712, 280], [712, 300]], dumpOn ? steamC : '#28384a', 6, dumpOn, 2.5);
    ctx.fillStyle = dumpOn ? AMBER : '#2a3a48'; ctx.strokeStyle = '#05090d'; ctx.lineWidth = 1.5;
    roundRect(634, 180, 12, 16, 2, true, true);
    label(615, 192, 'DUMP', dumpOn ? AMBER : DIM, 9, 'right');
    // feed line back to SG
    var feedOn = s.feedFlow > 1;
    pipe([[700, 350], [560, 350], [560, 420], [507, 420]], feedOn ? tempC(150, 1) : '#28384a', 6, feedOn, 1.5);
    ctx.fillStyle = '#22303d'; ctx.strokeStyle = EDGE; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(600, 350, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = feedOn ? BLUE : '#3a4a5a'; ctx.beginPath(); ctx.arc(600, 350, 3, 0, 7); ctx.fill();
    label(600, 378, 'FW PUMP', DIM, 9);
  }

  function loops(s) {
    var flowing = s.nPumps() > 0;
    var hotC = tempC(s.filled ? s.tHot() : 45, 1);
    var coldC = s.filled ? 'hsla(205,75%,55%,1)' : tempC(45, 1);
    // hot leg: vessel nozzle (right) -> under pressurizer -> down the SG gap -> SG channel-head bottom
    pipe([[240, 375], [390, 375], [390, 500], [420, 500], [420, 480]], hotC, 12, flowing, 2);
    // crossover leg: SG channel-head bottom -> U beneath the loop -> RCP suction (bottom)
    pipe([[500, 480], [500, 535], [345, 535], [345, 500]], coldC, 12, flowing, 2);
    // cold leg: RCP discharge -> behind the vessel -> up the left side -> vessel nozzle (left, hot-leg level)
    pipe([[309, 480], [309, 500], [105, 500], [105, 375], [130, 375]], coldC, 12, flowing, 2);
    if (s.filled) {
      label(262, 369, s.tHot().toFixed(0) + '\u00b0', hotC, 10, 'center', true);
      label(96, 405, s.tCold().toFixed(0) + '\u00b0', coldC, 10, 'right', true);
      label(345, 392, 'HOT LEG', DIM, 8);
      label(300, 530, 'CROSSOVER', DIM, 8);
      label(96, 392, 'COLD LEG', DIM, 8, 'right');
    }
  }

  function buildings() {
    // containment dome
    ctx.fillStyle = 'rgba(20,32,44,0.35)';
    ctx.beginPath();
    ctx.moveTo(30, 540); ctx.lineTo(30, 200);
    ctx.arc(285, 200, 255, Math.PI, 0, false);
    ctx.lineTo(540, 540); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2f475c'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(30, 540); ctx.lineTo(30, 200);
    ctx.arc(285, 200, 255, Math.PI, 0, false);
    ctx.lineTo(540, 540); ctx.stroke();
    // turbine hall
    ctx.fillStyle = 'rgba(20,32,44,0.28)';
    ctx.fillRect(660, 70, 250, 470);
    ctx.strokeStyle = '#2f475c'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(660, 70); ctx.lineTo(910, 70);
    ctx.moveTo(660, 70); ctx.lineTo(660, 540);
    ctx.moveTo(910, 70); ctx.lineTo(910, 540);
    ctx.stroke();
    tag(285, 552, 'CONTAINMENT', 10);
    tag(785, 552, 'TURBINE HALL', 10);
  }

  function board() {
    // faint engineering grid
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy <= H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
  }

  this.draw = function (s, dtReal) {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, BG0); bg.addColorStop(1, BG1);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    var sc = Math.min(cw / W, ch / H);
    ctx.setTransform(sc, 0, 0, sc, (cw - W * sc) / 2, (ch - H * sc) / 2);
    dashOff += dtReal * 22;

    board();
    buildings();
    loops(s);
    rcp(s);
    vessel(s);
    pressurizer(s);
    steamGen(s);
    turbineHall(s);
  };
};
