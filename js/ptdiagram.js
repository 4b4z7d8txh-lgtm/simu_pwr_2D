/* Live P-T ("chaussette") diagram: operating domains, boundaries, the plant's
 * trail and current operating point. Modeled after the French CPP
 * temperature-pressure diagram:
 *   APR      refueling shutdown (open/cold, ~1 bar)
 *   AN/RIS-RA cold shutdown on RHR (<= 31 bar, < 177 C)        [green]
 *   AN/GV    normal shutdown on steam generators (the sock)    [blue]
 *   RP       reactor in production (155 bar, ~290-310 C)       [red]
 */
var PWR = (typeof window !== 'undefined') ? (window.PWR = window.PWR || {}) : {};

PWR.PTDiagram = function (canvas) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var mL = 34, mR = 8, mT = 10, mB = 20;
  var TMAX = 360, PMAX = 180;

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

  this.draw = function (s) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1019'; ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = '#1d2433'; ctx.lineWidth = 1;
    ctx.font = '8.5px Consolas, monospace'; ctx.fillStyle = '#55617c';
    for (var t = 0; t <= TMAX; t += 60) {
      ctx.beginPath(); ctx.moveTo(X(t), Y(0)); ctx.lineTo(X(t), mT); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(t, X(t), H - 8);
    }
    for (var p = 0; p <= PMAX; p += 30) {
      ctx.beginPath(); ctx.moveTo(X(0), Y(p)); ctx.lineTo(W - mR, Y(p)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(p, mL - 3, Y(p) + 3);
    }
    ctx.fillStyle = '#7a8aa8'; ctx.textAlign = 'left';
    ctx.fillText('bar', 4, mT + 2);
    ctx.textAlign = 'right'; ctx.fillText('Tavg °C', W - mR, H - 8);

    // APR domain (refueling, cold & open)
    ctx.fillStyle = 'rgba(250,220,40,0.30)';
    ctx.fillRect(X(15), Y(4), X(70) - X(15), Y(0.5) - Y(4));
    // AN/RIS-RA domain (green, <=31 bar below 177 C)
    ctx.fillStyle = 'rgba(34,170,80,0.25)';
    ctx.fillRect(X(15), Y(31), X(177) - X(15), Y(1) - Y(31));
    // AN/GV sock (blue): between ptMin and ptMax from 177 C to ~310 C
    ctx.fillStyle = 'rgba(60,160,235,0.28)';
    ctx.beginPath();
    var t1;
    for (t1 = 177; t1 <= 310; t1 += 2) {
      var y = Y(Math.max(28, PWR.ptMin(t1)));
      t1 === 177 ? ctx.moveTo(X(t1), y) : ctx.lineTo(X(t1), y);
    }
    for (t1 = 310; t1 >= 177; t1 -= 2) ctx.lineTo(X(t1), Y(PWR.ptMax(t1)));
    ctx.closePath(); ctx.fill();
    // RP domain (red band at nominal pressure)
    ctx.fillStyle = 'rgba(240,70,70,0.45)';
    ctx.fillRect(X(286), Y(158), X(320) - X(286), Y(152) - Y(158));

    // boundaries
    ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.6;
    curve(PWR.ptMax, 15, 310, function () { ctx.stroke(); });           // upper limit
    ctx.strokeStyle = '#fbbf24'; ctx.setLineDash([4, 3]);
    curve(PWR.ptMin, 130, 320, function () { ctx.stroke(); });          // lower limit (margin)
    ctx.strokeStyle = '#ef4444'; ctx.setLineDash([2, 2]); ctx.lineWidth = 1.2;
    curve(function (t) { return PWR.water.psat(t); }, 100, 355, function () { ctx.stroke(); }); // saturation
    ctx.setLineDash([]);

    // domain labels
    ctx.fillStyle = '#9fb4d8'; ctx.font = '8px Consolas, monospace'; ctx.textAlign = 'left';
    ctx.fillText('APR', X(20), Y(6) - 2);
    ctx.fillText('AN/RIS-RA', X(60), Y(20));
    ctx.fillText('AN/GV', X(216), Y(100));
    ctx.fillText('RP', X(304), Y(165));
    ctx.fillStyle = '#ef4444';
    ctx.fillText('sat.', X(330), Y(PWR.water.psat(330)) + 10);

    // trail
    if (s.ptHistory.length > 1) {
      ctx.strokeStyle = 'rgba(103,232,249,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      s.ptHistory.forEach(function (q, i) {
        i === 0 ? ctx.moveTo(X(q[0]), Y(Math.min(PMAX, q[1]))) : ctx.lineTo(X(q[0]), Y(Math.min(PMAX, q[1])));
      });
      ctx.stroke();
    }

    // current operating point
    if (s.filled) {
      var bad = s.alarms.PT_HI || s.alarms.PT_LO;
      var x0 = X(s.Tavg), y0 = Y(Math.min(PMAX, s.P));
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x0, mT); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mL, y0); ctx.lineTo(W - mR, y0); ctx.stroke();
      ctx.fillStyle = bad ? '#f87171' : '#4ade80';
      ctx.beginPath(); ctx.arc(x0, y0, 4.5, 0, 7); ctx.fill();
      ctx.strokeStyle = bad ? '#f87171' : '#4ade80'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x0, y0, 8, 0, 7); ctx.stroke();
      if (bad) {
        ctx.fillStyle = '#f87171'; ctx.font = 'bold 9px Consolas, monospace'; ctx.textAlign = 'center';
        ctx.fillText('OUT OF ENVELOPE', W / 2, mT + 10);
      }
    }
  };
};
