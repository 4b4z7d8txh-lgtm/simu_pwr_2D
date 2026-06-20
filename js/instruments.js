/* Analog process gauges and live trend recorders for the instrument deck.
 * Pure presentation: every value is read from the simulation each frame. */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {}) : {};

/* ---------- shared palette ---------- */
PWR._hmi = {
  bg: '#0b1219', face: '#101a24', ring: '#34495e', tick: '#5a6f84',
  txt: '#d7e3ee', dim: '#647688', cyan: '#45d4e6',
  grn: '#34d27f', amb: '#ffb13b', red: '#ff4759', blue: '#4ea4ff', needle: '#e7eef5'
};

/* ============================================================
   ANALOG GAUGE CLUSTER
   270° sweep, coloured operating zones, needle + digital sub-readout.
   ============================================================ */
PWR.Gauges = function (container) {
  var H = PWR._hmi;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var GW = 104, GH = 90;                 // css px per gauge

  // [label, unit, min, max, readFn, zones[from,to,color], decimals]
  var defs = [
    ['RX POWER', '%', 0, 120, function (s) { return s.powerPct(); },
      [[0, 100, H.grn], [100, 105, H.amb], [105, 120, H.red]], 1],
    ['RCS PRESS', 'bar', 0, 180, function (s) { return s.P; },
      [[131, 150, H.amb], [150, 160, H.grn], [160, 169, H.amb], [169, 180, H.red]], 1],
    ['T AVG', '\u00b0C', 0, 350, function (s) { return s.Tavg; },
      [[286, 310, H.grn], [310, 326, H.amb], [326, 350, H.red]], 1],
    ['PRZ LEVEL', '%', 0, 100, function (s) { return s.filled ? s.przLevel : 0; },
      [[0, 18, H.red], [18, 40, H.amb], [40, 70, H.grn], [70, 80, H.amb], [80, 100, H.red]], 0],
    ['SG PRESS', 'bar', 0, 90, function (s) { return s.Psg; },
      [[55, 80, H.grn], [80, 86, H.amb], [86, 90, H.red]], 1],
    ['GENERATOR', 'MWe', 0, 1200, function (s) { return s.mwe; },
      [[1078, 1120, H.grn], [1120, 1200, H.amb]], 0]
  ];

  var gauges = defs.map(function (d) {
    var wrap = document.createElement('div');
    wrap.className = 'gauge';
    var cv = document.createElement('canvas');
    cv.width = GW * DPR; cv.height = GH * DPR;
    cv.style.width = GW + 'px'; cv.style.height = GH + 'px';
    wrap.appendChild(cv);
    container.appendChild(wrap);
    return { def: d, ctx: cv.getContext('2d') };
  });

  var A0 = 135 * Math.PI / 180, SWEEP = 270 * Math.PI / 180;

  function drawOne(g) {
    var ctx = g.ctx, d = g.def;
    var label = d[0], unit = d[1], mn = d[2], mx = d[3], read = d[4], zones = d[5], dec = d[6];
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, GW, GH);
    var cx = GW / 2, cy = 50, r = 33;

    // face disc
    var grd = ctx.createRadialGradient(cx, cy - 8, 4, cx, cy, r + 8);
    grd.addColorStop(0, '#16222e'); grd.addColorStop(1, '#0a1119');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, 7); ctx.fill();
    ctx.strokeStyle = H.ring; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, r + 7, 0, 7); ctx.stroke();

    function ang(v) { return A0 + SWEEP * (Math.min(mx, Math.max(mn, v)) - mn) / (mx - mn); }

    // base track
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#243441'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, r, A0, A0 + SWEEP); ctx.stroke();
    // coloured zones
    zones.forEach(function (z) {
      ctx.strokeStyle = z[2]; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, r, ang(z[0]), ang(z[1])); ctx.stroke();
    });

    // ticks
    ctx.strokeStyle = H.tick;
    for (var i = 0; i <= 8; i++) {
      var a = A0 + SWEEP * i / 8;
      var maj = (i % 2 === 0);
      var r1 = r - 9, r2 = r - (maj ? 14 : 12);
      ctx.lineWidth = maj ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }

    var v = read(PWR._curSim) || 0;
    var av = ang(v);
    // needle
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(av);
    ctx.fillStyle = H.needle;
    ctx.beginPath();
    ctx.moveTo(-3, 3); ctx.lineTo(-3, -3); ctx.lineTo(r - 4, -0.8); ctx.lineTo(r - 4, 0.8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // hub
    ctx.fillStyle = '#0a1119'; ctx.strokeStyle = '#7f93a6'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill(); ctx.stroke();

    // label
    ctx.fillStyle = H.dim; ctx.textAlign = 'center';
    ctx.font = '600 9px "Barlow Condensed", sans-serif';
    ctx.fillText(label.toUpperCase(), cx, 11);

    // digital readout
    var inAlarm = zones.some(function (z) { return z[2] === H.red && v >= z[0] && v <= z[1]; });
    var disp = (mx >= 1000 && v >= 1000) ? Math.round(v).toString() : v.toFixed(dec);
    ctx.fillStyle = inAlarm ? H.red : H.cyan;
    ctx.font = '600 14px "IBM Plex Mono", monospace';
    ctx.fillText(disp, cx, GH - 6);
    ctx.fillStyle = H.dim;
    ctx.font = '500 8px "Barlow Condensed", sans-serif';
    ctx.fillText(unit, cx, GH - 16);
  }

  this.draw = function (sim) {
    PWR._curSim = sim;
    gauges.forEach(drawOne);
  };
};

/* ============================================================
   TREND RECORDER — multi-pen strip chart, each pen auto-scaled
   to its own engineering range and drawn over a rolling window.
   ============================================================ */
PWR.Trends = function (canvas, legendEl) {
  var H = PWR._hmi;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var MAXP = 300, INTERVAL = 15;         // sim-seconds between samples
  var lastSample = -1e9;

  // [name, lo, hi, color, readFn, fmt]
  var pens = [
    ['POWER', 0, 110, H.cyan, function (s) { return s.powerPct(); }, function (v) { return v.toFixed(1) + '%'; }],
    ['TAVG', 40, 330, H.amb, function (s) { return s.Tavg; }, function (v) { return v.toFixed(0) + '\u00b0C'; }],
    ['RCS P', 0, 175, H.grn, function (s) { return s.P; }, function (v) { return v.toFixed(0) + 'b'; }],
    ['GEN', 0, 1150, H.blue, function (s) { return s.mwe; }, function (v) { return Math.round(v) + 'MW'; }]
  ];
  var buf = pens.map(function () { return []; });

  legendEl.innerHTML = pens.map(function (p, i) {
    return '<span><i style="background:' + p[3] + '"></i>' + p[0] + ' <b id="trL' + i + '" style="color:' + p[3] + ';font-weight:500"></b></span>';
  }).join('');

  this.sample = function (sim) {
    if (sim.t - lastSample < INTERVAL) return;
    lastSample = sim.t;
    pens.forEach(function (p, i) {
      var arr = buf[i];
      arr.push(p[4](sim));
      if (arr.length > MAXP) arr.shift();
    });
  };

  this.draw = function (sim) {
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== cw * DPR || canvas.height !== ch * DPR) {
      canvas.width = cw * DPR; canvas.height = ch * DPR;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    var pad = 4;

    // grid
    ctx.strokeStyle = 'rgba(52,73,94,0.45)'; ctx.lineWidth = 1;
    for (var gx = 0; gx <= 6; gx++) {
      var x = pad + (cw - 2 * pad) * gx / 6;
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, ch - pad); ctx.stroke();
    }
    for (var gy = 0; gy <= 4; gy++) {
      var y = pad + (ch - 2 * pad) * gy / 4;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(cw - pad, y); ctx.stroke();
    }

    pens.forEach(function (p, i) {
      var arr = buf[i];
      var lbl = document.getElementById('trL' + i);
      if (lbl) lbl.textContent = p[5](p[4](sim));
      if (arr.length < 2) return;
      var lo = p[1], hi = p[2];
      ctx.strokeStyle = p[3]; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      var n = arr.length;
      for (var k = 0; k < n; k++) {
        var fx = pad + (cw - 2 * pad) * k / (MAXP - 1);
        var f = (arr[k] - lo) / (hi - lo);
        f = Math.min(1, Math.max(0, f));
        var fy = (ch - pad) - (ch - 2 * pad) * f;
        k === 0 ? ctx.moveTo(fx, fy) : ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      // leading dot
      var lx = pad + (cw - 2 * pad) * (n - 1) / (MAXP - 1);
      var lf = Math.min(1, Math.max(0, (arr[n - 1] - lo) / (hi - lo)));
      var ly = (ch - pad) - (ch - 2 * pad) * lf;
      ctx.fillStyle = p[3];
      ctx.beginPath(); ctx.arc(lx, ly, 2, 0, 7); ctx.fill();
    });
  };
};
