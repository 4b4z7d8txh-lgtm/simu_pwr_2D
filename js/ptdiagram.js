/* Live P-T ("chaussette") diagram: operating domains, boundaries, the plant's
 * trail and current operating point. Modeled after the French CPP
 * temperature-pressure diagram, drawn in the manga ink-on-paper style:
 *   APR      refueling shutdown (open/cold, ~1 bar)
 *   AN/RIS-RA cold shutdown on RHR (<= 31 bar, < 177 C)        [light tone]
 *   AN/GV    normal shutdown on steam generators (the sock)    [mid tone]
 *   RP       reactor in production (155 bar, ~290-310 C)       [vermilion]
 */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {}) : {};

PWR.PTDiagram = function (canvas) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var mL = 34, mR = 8, mT = 10, mB = 20;
  var TMAX = 360, PMAX = 180;

  var INK = '#16120c', INK2 = '#2b251b', PAPER = '#f6f2e6', RED = '#cf1f2b', AMBER = '#c8860a';

  function X(t) { return mL + (W - mL - mR) * t / TMAX; }
  function Y(p) { return H - mB - (H - mB - mT) * p / PMAX; }

  function curve(fn, t0, t1, close) {
    ctx.beginPath();
    for (var t = t0; t <= t1; t += 4) {
      var x = X(t), y = Y(Math.min(PMAX, fn(t)));
      t === t0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    if (close) close();
  }

  // screentone fill of the current path (must be set up by caller), density 0..1
  function tonePath(density, color) {
    ctx.save(); ctx.clip();
    var sp = 5, r = 0.6 + 2.0 * density;
    ctx.fillStyle = color;
    for (var yy = 0; yy < H; yy += sp)
      for (var xx = 0; xx < W; xx += sp) { ctx.beginPath(); ctx.arc(xx, yy, r, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  this.draw = function (s) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(1, 1, W - 2, H - 2);

    // grid
    ctx.strokeStyle = 'rgba(22,18,12,0.16)'; ctx.lineWidth = 1;
    ctx.font = 'bold 8.5px "Share Tech Mono", monospace'; ctx.fillStyle = INK2;
    for (var t = 0; t <= TMAX; t += 60) {
      ctx.beginPath(); ctx.moveTo(X(t), Y(0)); ctx.lineTo(X(t), mT); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(t, X(t), H - 8);
    }
    for (var p = 0; p <= PMAX; p += 30) {
      ctx.beginPath(); ctx.moveTo(X(0), Y(p)); ctx.lineTo(W - mR, Y(p)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(p, mL - 3, Y(p) + 3);
    }
    ctx.fillStyle = INK; ctx.textAlign = 'left';
    ctx.fillText('bar', 4, mT + 2);
    ctx.textAlign = 'right'; ctx.fillText('Tavg C', W - mR, H - 8);

    // APR domain (refueling, cold & open) — light amber tone
    ctx.beginPath(); ctx.rect(X(15), Y(4), X(70) - X(15), Y(0.5) - Y(4));
    tonePath(0.25, 'rgba(200,134,10,0.85)');
    // AN/RIS-RA domain — light ink tone
    ctx.beginPath(); ctx.rect(X(15), Y(31), X(177) - X(15), Y(1) - Y(31));
    tonePath(0.28, 'rgba(22,18,12,0.7)');
    // AN/GV sock — mid ink tone
    ctx.beginPath();
    var t1;
    for (t1 = 177; t1 <= 310; t1 += 2) {
      var y = Y(Math.max(28, PWR.ptMin(t1)));
      t1 === 177 ? ctx.moveTo(X(t1), y) : ctx.lineTo(X(t1), y);
    }
    for (t1 = 310; t1 >= 177; t1 -= 2) ctx.lineTo(X(t1), Y(PWR.ptMax(t1)));
    ctx.closePath();
    tonePath(0.5, 'rgba(22,18,12,0.7)');
    // RP domain — vermilion tone
    ctx.beginPath(); ctx.rect(X(286), Y(158), X(320) - X(286), Y(152) - Y(158));
    tonePath(0.7, 'rgba(207,31,43,0.9)');

    // boundaries
    ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
    curve(PWR.ptMax, 15, 310, function () { ctx.stroke(); });           // upper limit
    ctx.strokeStyle = AMBER; ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
    curve(PWR.ptMin, 130, 320, function () { ctx.stroke(); });          // lower limit (margin)
    ctx.strokeStyle = RED; ctx.setLineDash([2, 2]); ctx.lineWidth = 1.6;
    curve(function (t) { return PWR.water.psat(t); }, 100, 355, function () { ctx.stroke(); }); // saturation
    ctx.setLineDash([]);

    // domain labels
    ctx.fillStyle = INK; ctx.font = 'bold 8.5px "Rajdhani", "Arial Narrow", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('APR', X(20), Y(6) - 2);
    ctx.fillText('AN/RIS-RA', X(58), Y(20));
    ctx.fillStyle = '#fff'; ctx.fillText('AN/GV', X(214), Y(100));
    ctx.fillText('RP', X(303), Y(165));
    ctx.fillStyle = RED;
    ctx.fillText('sat.', X(330), Y(PWR.water.psat(330)) + 10);

    // trail
    if (s.ptHistory.length > 1) {
      ctx.strokeStyle = 'rgba(22,18,12,0.55)'; ctx.lineWidth = 1.8; ctx.setLineDash([5, 3]);
      ctx.beginPath();
      s.ptHistory.forEach(function (q, i) {
        i === 0 ? ctx.moveTo(X(q[0]), Y(Math.min(PMAX, q[1]))) : ctx.lineTo(X(q[0]), Y(Math.min(PMAX, q[1])));
      });
      ctx.stroke(); ctx.setLineDash([]);
    }

    // current operating point — inked crosshair + marker
    if (s.filled) {
      var bad = s.alarms.PT_HI || s.alarms.PT_LO;
      var x0 = X(s.Tavg), y0 = Y(Math.min(PMAX, s.P));
      ctx.strokeStyle = 'rgba(22,18,12,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x0, mT); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mL, y0); ctx.lineTo(W - mR, y0); ctx.stroke();
      ctx.fillStyle = bad ? RED : INK;
      ctx.beginPath(); ctx.arc(x0, y0, 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = bad ? RED : INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x0, y0, 8, 0, 7); ctx.stroke();
      if (bad) {
        ctx.fillStyle = RED; ctx.font = 'bold 10px "Rajdhani", "Arial Narrow", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('警告 OUT OF ENVELOPE', W / 2, mT + 12);
      }
    }
  };
};
