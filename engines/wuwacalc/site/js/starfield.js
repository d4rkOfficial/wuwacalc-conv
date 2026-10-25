/* ===== P6 抽取：宇宙星空动态背景（WaveCalcStarfield）=====
 * 来源：index.html 内联块（原 5862-6909，1048 行），内容逐字节搬移未改。
 * 加载：defer，位于 profile.js 之后、public-db.js 之前（与原文档位置等价；
 *       消费方登录页/开场门均为运行时引用，定义时机由解析期变为 defer 尾段，行为等价）。
 * 注意：本文件为独立 IIFE，0 全局绑定；导出 window.WaveCalcStarfield（plain 名豁免保留）。
 */
/**
 * 宇宙星空动态背景（单一 Canvas rAF）
 * 三层视差恒星 · 星芒/六芒 · 星云 · 流星 · 光尘 · 超新星 · 游荡光点 · 星河鼠标拖尾
 */
(function () {
  'use strict';

  var METEOR_POOL = 5;
  var TWO_PI = Math.PI * 2;
  var TRAIL_MAX = 200;
  var INFLUENCE_R = 150;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  function easeOut(t) {
    var u = Math.max(0, Math.min(1, t));
    return 1 - (1 - u) * (1 - u);
  }

  /** 星尘/拖尾配色：白 / 青 / 金 / 粉 */
  function starDustColor(mode) {
    var r = Math.random();
    if (mode === 'trail') {
      if (r < 0.7) return [220 + ((Math.random() * 20) | 0), 230 + ((Math.random() * 15) | 0), 255];
      if (r < 0.85) return [140, 200, 255];
      if (r < 0.95) return [255, 220, 160];
      return [255, 180, 200];
    }
    if (mode === 'meteor') {
      if (r < 0.7) return [235, 245, 255];
      if (r < 0.9) return [140, 210, 255];
      return [255, 220, 150];
    }
    if (mode === 'dust') {
      if (r < 0.4) return [230, 240, 255];
      if (r < 0.65) return [140, 200, 255];
      if (r < 0.85) return [255, 220, 160];
      return [255, 180, 200];
    }
    // burst / idle
    if (r < 0.55) return [220, 230, 255];
    if (r < 0.75) return [140, 200, 255];
    if (r < 0.9) return [255, 220, 160];
    return [255, 180, 200];
  }

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
  }

  function drawSpark(ctx, x, y, r, ang, color, a) {
    if (r < 1.5) {
      ctx.fillStyle = rgba(color, a);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.2, r), 0, TWO_PI);
      ctx.fill();
      return;
    }
    var len = r * 1.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = rgba(color, a);
    ctx.lineWidth = 0.55;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.moveTo(0, -len);
    ctx.lineTo(0, len);
    ctx.stroke();
    ctx.fillStyle = rgba(color, a * 0.85);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.35, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  function create(container, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = (opts.className || 'wc-starfield-canvas') + '';
    canvas.setAttribute('aria-hidden', 'true');
    container.insertBefore(canvas, container.firstChild);

    var ambient = document.createElement('div');
    ambient.className = 'wc-starfield-nebula';
    ambient.setAttribute('aria-hidden', 'true');
    ambient.innerHTML =
      '<span class="wc-starfield-glow top"></span>' +
      '<span class="wc-starfield-glow bottom"></span>';
    container.insertBefore(ambient, canvas.nextSibling);

    var ctx = canvas.getContext('2d');
    var stars = [];
    var dust = [];
    var nebulae = [];
    var meteors = [];
    var supernovae = [];
    var wanderers = [];
    var trails = [];
    var bursts = [];
    var ripples = [];
    var idleOrbits = [];
    var nextMeteorAt = 0;
    var nextSupernovaAt = 0;
    var rafId = 0;
    var running = false;
    var fading = false;
    var timeScale = 1;
    var lastTs = 0;
    var viewW = 0;
    var viewH = 0;
    var frameCount = 0;
    var mouse = {
      x: 0,
      y: 0,
      prevX: 0,
      prevY: 0,
      in: false,
      lastMoveAt: 0,
      movedThisFrame: false,
    };
    var mouseBound = false;

    function size() {
      if (!ctx) return { w: 1, h: 1 };
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, container.clientWidth || window.innerWidth);
      var h = Math.max(1, container.clientHeight || window.innerHeight);
      viewW = w;
      viewH = h;
      var bw = Math.round(w * dpr);
      var bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { w: w, h: h };
    }

    function wrapPos(o, w, h, pad) {
      pad = pad || 4;
      if (o.x < -pad) o.x = w + pad;
      else if (o.x > w + pad) o.x = -pad;
      if (o.y < -pad) o.y = h + pad;
      else if (o.y > h + pad) o.y = -pad;
    }

    function makeStar(w, h, layer) {
      var r;
      var baseA;
      var amp;
      var speedMul;
      if (layer === 0) {
        r = rand(0.2, 0.5);
        baseA = rand(0.12, 0.4);
        amp = rand(0.12, 0.28);
        speedMul = 0.35;
      } else if (layer === 1) {
        r = rand(0.5, 1.0);
        baseA = rand(0.25, 0.55);
        amp = rand(0.22, 0.42);
        speedMul = 1;
      } else {
        r = rand(1.0, 2.0);
        baseA = rand(0.4, 0.75);
        amp = rand(0.3, 0.55);
        speedMul = 3;
      }
      var hasSpike = layer === 2;
      var dualPeak = Math.random() < 0.1;
      var arc = Math.random() < 0.15;
      var spd = rand(0.02, 0.12) * speedMul;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: r,
        layer: layer,
        baseA: baseA,
        amp: amp,
        period: rand(2, 12),
        phase: Math.random() * TWO_PI,
        dualPeak: dualPeak,
        vx: spd * (Math.random() < 0.5 ? -1 : 1),
        vy: spd * (Math.random() < 0.5 ? -1 : 1),
        arc: arc,
        arcAmp: arc ? rand(0.015, 0.05) : 0,
        arcFreq: arc ? rand(0.15, 0.55) : 0,
        arcPhase: Math.random() * TWO_PI,
        spike: hasSpike,
        spikeLen: hasSpike ? rand(4, 8) : 0,
        spikeRot: Math.random() * TWO_PI,
        spikeSpin: hasSpike ? rand(0.002, 0.008) * (Math.random() < 0.5 ? -1 : 1) : 0,
        hexSpike: false,
        glowBoost: 0,
        pushX: 0,
        pushY: 0,
        dimUntil: 0,
        dimFactor: 1,
      };
    }

    function initStars(w, h) {
      stars = [];
      var i;
      for (i = 0; i < 180; i++) stars.push(makeStar(w, h, 0));
      for (i = 0; i < 100; i++) stars.push(makeStar(w, h, 1));
      for (i = 0; i < 40; i++) stars.push(makeStar(w, h, 2));
      // 5 颗最亮近景星 → 六芒星
      var near = stars.filter(function (s) {
        return s.layer === 2;
      });
      near.sort(function (a, b) {
        return b.baseA + b.amp - (a.baseA + a.amp);
      });
      for (i = 0; i < Math.min(5, near.length); i++) {
        near[i].hexSpike = true;
        near[i].spikeLen = rand(5, 8);
      }
    }

    function initDust(w, h) {
      dust = [];
      var n = 50 + ((Math.random() * 11) | 0);
      for (var i = 0; i < n; i++) {
        var c = starDustColor('dust');
        dust.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: rand(0.3, 0.9),
          color: c,
          baseA: rand(0.12, 0.4),
          phase: Math.random() * TWO_PI,
          period: rand(3, 9),
          vx: rand(0.04, 0.16) * (Math.random() < 0.5 ? -1 : 1),
          vy: rand(0.03, 0.14) * (Math.random() < 0.5 ? -1 : 1),
          sinAmp: rand(0.25, 0.9),
          cosAmp: rand(0.2, 0.75),
          sinFreq: rand(0.3, 1.1),
          cosFreq: rand(0.25, 0.95),
          sinPhase: Math.random() * TWO_PI,
          cosPhase: Math.random() * TWO_PI,
          trail: Math.random() < 0.2,
          ghosts: [],
        });
      }
    }

    function initNebulae(w, h) {
      var palettes = [
        [
          [0, 160, 200],
          [40, 80, 180],
          [90, 40, 160],
        ],
        [
          [60, 40, 140],
          [20, 100, 180],
          [0, 140, 200],
        ],
        [
          [0, 120, 180],
          [70, 50, 150],
          [120, 60, 140],
        ],
        [
          [30, 90, 170],
          [100, 50, 150],
          [50, 30, 120],
        ],
      ];
      var anchors = [
        { x: w * 0.15, y: h * 0.22 },
        { x: w * 0.85, y: h * 0.3 },
        { x: w * 0.45, y: h * 0.78 },
        { x: w * 0.72, y: h * 0.88 },
      ];
      nebulae = [];
      for (var i = 0; i < 4; i++) {
        var pal = palettes[i];
        var sz = rand(600, 1000);
        nebulae.push({
          x: anchors[i].x + rand(-50, 50),
          y: anchors[i].y + rand(-40, 40),
          rx: sz * 0.5,
          ry: sz * rand(0.35, 0.5),
          colors: pal,
          baseA: rand(0.025, 0.045),
          amp: rand(0.01, 0.02),
          period: rand(7, 14),
          phase: Math.random() * TWO_PI,
          vx: rand(0.04, 0.09) * (Math.random() < 0.5 ? -1 : 1),
          vy: rand(0.03, 0.07) * (Math.random() < 0.5 ? -1 : 1),
          rot: Math.random() * TWO_PI,
          spin: rand(0.0003, 0.0008) * (Math.random() < 0.5 ? -1 : 1),
        });
      }
    }

    function initMeteorPool() {
      meteors = [];
      for (var i = 0; i < METEOR_POOL; i++) {
        meteors.push({
          active: false,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          len: 0,
          life: 0,
          maxLife: 1,
          curve: 0,
          bright: 1,
          color: [235, 245, 255],
          bendAt: 0,
          bent: false,
          bendAng: 0,
          segs: 9,
        });
      }
    }

    function initWanderers(w, h) {
      wanderers = [];
      var n = 2 + ((Math.random() * 2) | 0);
      for (var i = 0; i < n; i++) {
        var warm = Math.random() < 0.5;
        var ang = rand(-0.35, 0.35) + (Math.random() < 0.5 ? 0 : Math.PI);
        var speed = Math.max(w, h) / rand(10, 15);
        wanderers.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          r: rand(2, 3),
          color: warm ? [255, 210, 150] : [140, 210, 255],
          trailLen: rand(20, 30),
          curveAmp: rand(12, 28),
          curveFreq: rand(0.15, 0.4),
          curvePhase: Math.random() * TWO_PI,
          age: Math.random() * 20,
        });
      }
    }

    function acquireMeteor() {
      for (var i = 0; i < meteors.length; i++) {
        if (!meteors[i].active) return meteors[i];
      }
      return null;
    }

    function spawnMeteor(w, h, now) {
      var m = acquireMeteor();
      if (!m) return;
      var ang = rand(115, 155) * (Math.PI / 180);
      var speed = rand(380, 680);
      m.active = true;
      m.x = w * rand(0.4, 1.08);
      m.y = rand(-50, h * 0.18);
      m.vx = Math.cos(ang) * speed;
      m.vy = Math.sin(ang) * speed;
      m.len = rand(60, 150);
      m.life = 0;
      m.maxLife = rand(0.85, 1.4);
      m.curve = rand(28, 70) * (Math.random() < 0.5 ? -1 : 1);
      m.bright = rand(0.7, 1);
      m.color = starDustColor('meteor');
      m.bendAt = Math.random() < 0.45 ? rand(0.35, 0.6) : -1;
      m.bent = false;
      m.bendAng = rand(-0.35, 0.35);
      m.segs = 8 + ((Math.random() * 3) | 0);
      nextMeteorAt = now + rand(2, 5);
    }

    function spawnSupernova(now) {
      var candidates = [];
      for (var i = 0; i < stars.length; i++) {
        if (stars[i].layer === 1) candidates.push(stars[i]);
      }
      if (!candidates.length) return;
      var s = pick(candidates);
      supernovae.push({
        x: s.x,
        y: s.y,
        life: 0,
        maxLife: 2,
        star: s,
        rings: 2 + ((Math.random() * 2) | 0),
      });
      s.dimUntil = now + 4;
      s.dimFactor = 0.55;
      nextSupernovaAt = now + rand(20, 30);
    }

    function initAll() {
      var dim = size();
      initStars(dim.w, dim.h);
      initDust(dim.w, dim.h);
      initNebulae(dim.w, dim.h);
      initMeteorPool();
      initWanderers(dim.w, dim.h);
      supernovae = [];
      var now = performance.now() / 1000;
      nextMeteorAt = now + rand(1.5, 3.5);
      nextSupernovaAt = now + rand(12, 22);
      frameCount = 0;
    }

    function drawNebulae(t, dt, w, h) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (var i = 0; i < nebulae.length; i++) {
        var n = nebulae[i];
        n.x += n.vx * dt * 60 * timeScale;
        n.y += n.vy * dt * 60 * timeScale;
        n.rot += n.spin * 60 * dt * timeScale;
        if (n.x < -n.rx) n.x = w + n.rx;
        if (n.x > w + n.rx) n.x = -n.rx;
        if (n.y < -n.ry) n.y = h + n.ry;
        if (n.y > h + n.ry) n.y = -n.ry;
        var breath = 0.5 + 0.5 * Math.sin((t * TWO_PI) / n.period + n.phase);
        var a = Math.max(0.02, Math.min(0.06, n.baseA + n.amp * breath));
        var c0 = n.colors[0];
        var c1 = n.colors[1];
        var c2 = n.colors[2];
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.rot);
        ctx.scale(1, n.ry / n.rx);
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, n.rx);
        g.addColorStop(0, rgba(c0, a));
        g.addColorStop(0.35, rgba(c1, a * 0.55));
        g.addColorStop(0.7, rgba(c2, a * 0.22));
        g.addColorStop(1, rgba(c2, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, n.rx, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }

    function localPos(e) {
      var rect = container.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    function clearMouseFx() {
      trails.length = 0;
      bursts.length = 0;
      ripples.length = 0;
      idleOrbits.length = 0;
      mouse.in = false;
      mouse.movedThisFrame = false;
    }

    function pushTrail(x, y) {
      if (trails.length >= TRAIL_MAX) trails.shift();
      var color = starDustColor('trail');
      var size = rand(0.5, 2.5);
      trails.push({
        x: x + rand(-5, 5),
        y: y + rand(-5, 5),
        r: size,
        life: 0,
        maxLife: rand(1.0, 2.0),
        vx: rand(-0.1, 0.1),
        vy: rand(-0.1, 0.1),
        a0: rand(0.3, 0.6),
        color: color,
        ang: Math.random() * TWO_PI,
      });
    }

    /** 沿路径插值生成丝带状星尘 */
    function spawnRibbonTrail(x0, y0, x1, y1) {
      var perFrame = 1 + ((Math.random() * 2) | 0);
      var along = 2 + ((Math.random() * 2) | 0);
      var i;
      for (i = 0; i < along; i++) {
        var t = (i + 1) / (along + 1);
        pushTrail(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      }
      for (i = 0; i < perFrame; i++) {
        pushTrail(x1, y1);
      }
    }

    function spawnClickBurst(x, y) {
      var n = 8 + ((Math.random() * 5) | 0);
      for (var i = 0; i < n; i++) {
        var ang = Math.random() * TWO_PI;
        var spd = rand(0.6, 1.5);
        bursts.push({
          x: x,
          y: y,
          r: rand(0.6, 2.2),
          life: 0,
          maxLife: rand(0.5, 0.95),
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          color: starDustColor('burst'),
          ang: Math.random() * TWO_PI,
          a0: rand(0.35, 0.6),
        });
      }
      ripples.push({
        x: x,
        y: y,
        life: 0,
        maxLife: 0.7,
      });
    }

    function ensureIdleOrbits() {
      if (idleOrbits.length) return;
      var n = 3 + ((Math.random() * 3) | 0);
      for (var i = 0; i < n; i++) {
        idleOrbits.push({
          radius: rand(5, 10),
          ang: (TWO_PI * i) / n + rand(-0.4, 0.4),
          spin: rand(0.25, 0.55) * (Math.random() < 0.5 ? -1 : 1),
          r: rand(0.5, 1.2),
          color: starDustColor('burst'),
          a: rand(0.15, 0.25),
        });
      }
    }

    function bindMouse() {
      if (mouseBound) return;
      mouseBound = true;
      container.addEventListener('mousemove', function (e) {
        if (!running) return;
        var p = localPos(e);
        if (!mouse.in) {
          mouse.prevX = p.x;
          mouse.prevY = p.y;
        } else {
          mouse.prevX = mouse.x;
          mouse.prevY = mouse.y;
        }
        mouse.x = p.x;
        mouse.y = p.y;
        mouse.in = true;
        mouse.lastMoveAt = performance.now() / 1000;
        mouse.movedThisFrame = true;
      });
      container.addEventListener('mouseleave', function () {
        clearMouseFx();
      });
      container.addEventListener('pointerdown', function (e) {
        if (!running || e.button !== 0) return;
        var p = localPos(e);
        mouse.x = p.x;
        mouse.y = p.y;
        mouse.in = true;
        spawnClickBurst(p.x, p.y);
      });
    }

    function unbindMouse() {
      clearMouseFx();
    }

    function starAlpha(s, t, now) {
      var wave;
      if (s.dualPeak) {
        var u = ((t / s.period) + s.phase / TWO_PI) % 1;
        // 双峰：半周期内两次起伏
        wave = Math.sin(u * TWO_PI * 2);
      } else {
        wave = Math.sin((t * TWO_PI) / s.period + s.phase);
      }
      var a = s.baseA + s.amp * wave + s.glowBoost;
      a = Math.max(0.1, Math.min(0.9, a));
      if (now < s.dimUntil) a *= s.dimFactor;
      else s.dimFactor = 1;
      return a;
    }

    function drawStars(t, dt, now, w, h) {
      var updatePos = frameCount % 3 === 0;
      var mx = mouse.x;
      var my = mouse.y;
      var mouseIn = mouse.in;
      var step = updatePos ? dt * 3 : 0;

      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        if (updatePos) {
          var ax = 0;
          var ay = 0;
          if (s.arc) {
            ax = Math.sin(t * s.arcFreq + s.arcPhase) * s.arcAmp;
            ay = Math.cos(t * s.arcFreq * 0.85 + s.arcPhase) * s.arcAmp * 0.7;
          }
          s.x += (s.vx + ax) * step * 60 * timeScale;
          s.y += (s.vy + ay) * step * 60 * timeScale;
          wrapPos(s, w, h, 6);
        }
        if (s.spike) s.spikeRot += s.spikeSpin * 60 * dt * timeScale;

        var targetBoost = 0;
        var targetOx = 0;
        var targetOy = 0;
        if (mouseIn) {
          var dx = s.x - mx;
          var dy = s.y - my;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < INFLUENCE_R && dist > 0.001) {
            var fall = 1 - dist / INFLUENCE_R;
            targetBoost = 0.15 + 0.1 * fall;
            var push = 1.6 * fall;
            targetOx = (dx / dist) * push;
            targetOy = (dy / dist) * push;
          }
        }
        var ease = Math.min(1, dt * 5);
        s.glowBoost += (targetBoost - s.glowBoost) * ease;
        s.pushX += (targetOx - s.pushX) * ease;
        s.pushY += (targetOy - s.pushY) * ease;

        var a = starAlpha(s, t, now);

        for (var p = 0; p < supernovae.length; p++) {
          if (supernovae[p].star === s) {
            var su = supernovae[p].life / supernovae[p].maxLife;
            var boost = su < 0.12 ? su / 0.12 : su < 0.28 ? 1 : Math.max(0, 1 - (su - 0.28) / 0.35);
            a = Math.min(0.95, a + boost * 0.7);
          }
        }

        var drawX = s.x + s.pushX;
        var drawY = s.y + s.pushY;

        if (s.spike) {
          var len = s.spikeLen;
          var sa = a * 0.22;
          ctx.save();
          ctx.translate(drawX, drawY);
          ctx.rotate(s.spikeRot);
          ctx.strokeStyle = 'rgba(220,240,255,' + sa.toFixed(3) + ')';
          ctx.lineWidth = 0.7;
          ctx.lineCap = 'round';
          ctx.beginPath();
          if (s.hexSpike) {
            for (var k = 0; k < 3; k++) {
              var ang = (k * Math.PI) / 3;
              var c = Math.cos(ang);
              var sn = Math.sin(ang);
              ctx.moveTo(-len * c, -len * sn);
              ctx.lineTo(len * c, len * sn);
            }
          } else {
            ctx.moveTo(-len, 0);
            ctx.lineTo(len, 0);
            ctx.moveTo(0, -len);
            ctx.lineTo(0, len);
          }
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(drawX, drawY, s.r, 0, TWO_PI);
        ctx.fill();
      }
    }

    function drawDust(t, dt, w, h) {
      for (var i = 0; i < dust.length; i++) {
        var d = dust[i];
        var ox = Math.sin(t * d.sinFreq + d.sinPhase) * d.sinAmp;
        var oy = Math.cos(t * d.cosFreq + d.cosPhase) * d.cosAmp;
        d.x += (d.vx + ox) * dt * 60 * timeScale;
        d.y += (d.vy + oy) * dt * 60 * timeScale;
        wrapPos(d, w, h, 8);

        if (d.trail) {
          d.ghosts.push({ x: d.x, y: d.y });
          if (d.ghosts.length > 5) d.ghosts.shift();
          for (var g = 0; g < d.ghosts.length - 1; g++) {
            var ga = (0.08 + g * 0.04) * (d.baseA / 0.4);
            ctx.fillStyle = rgba(d.color, ga);
            ctx.beginPath();
            ctx.arc(d.ghosts[g].x, d.ghosts[g].y, d.r * 0.7, 0, TWO_PI);
            ctx.fill();
          }
        }

        var wave = 0.55 + 0.45 * Math.sin((t * TWO_PI) / d.period + d.phase);
        var a = Math.max(0.08, Math.min(0.5, d.baseA * wave));
        ctx.fillStyle = rgba(d.color, a);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TWO_PI);
        ctx.fill();
      }
    }

    function drawMeteors(dt, now, w, h) {
      var activeCount = 0;
      for (var i = 0; i < meteors.length; i++) {
        if (meteors[i].active) activeCount++;
      }
      if (now >= nextMeteorAt && activeCount < 3) {
        spawnMeteor(w, h, now);
      }

      for (i = 0; i < meteors.length; i++) {
        var m = meteors[i];
        if (!m.active) continue;
        m.life += dt * timeScale;
        var u = m.life / m.maxLife;

        if (!m.bent && m.bendAt > 0 && u >= m.bendAt) {
          var mag = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
          var ang = Math.atan2(m.vy, m.vx) + m.bendAng;
          m.vx = Math.cos(ang) * mag;
          m.vy = Math.sin(ang) * mag;
          m.bent = true;
          m.curve *= 1.25;
        }

        m.x += m.vx * dt * timeScale;
        m.y += m.vy * dt * timeScale;
        if (u >= 1 || m.x < -160 || m.y > h + 160) {
          m.active = false;
          continue;
        }

        var fade = u < 0.12 ? u / 0.12 : u > 0.65 ? (1 - u) / 0.35 : 1;
        fade *= m.bright;
        var speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy) || 1;
        var ux = m.vx / speed;
        var uy = m.vy / speed;
        var px = -uy;
        var py = ux;

        if (u < 0.18) {
          var flash = (1 - u / 0.18) * 0.85 * m.bright;
          ctx.fillStyle = rgba(m.color, flash);
          ctx.beginPath();
          ctx.arc(m.x, m.y, 2 + flash * 2, 0, TWO_PI);
          ctx.fill();
        }

        var segs = m.segs || 9;
        ctx.lineCap = 'round';
        for (var s = 0; s < segs; s++) {
          var t0 = s / segs;
          var t1 = (s + 1) / segs;
          var off0 = Math.sin(t0 * Math.PI) * m.curve * (1 - t0);
          var off1 = Math.sin(t1 * Math.PI) * m.curve * (1 - t1);
          var x0 = m.x - ux * m.len * t0 + px * off0;
          var y0 = m.y - uy * m.len * t0 + py * off0;
          var x1 = m.x - ux * m.len * t1 + px * off1;
          var y1 = m.y - uy * m.len * t1 + py * off1;
          var aSeg = fade * (1 - t0) * (1 - t0);
          ctx.strokeStyle = rgba(m.color, aSeg * 0.7);
          ctx.lineWidth = 1.5 * (1 - t0 * 0.75);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    }

    function drawSupernovae(dt, now) {
      if (now >= nextSupernovaAt) spawnSupernova(now);
      for (var i = supernovae.length - 1; i >= 0; i--) {
        var p = supernovae[i];
        p.life += dt * timeScale;
        var u = p.life / p.maxLife;
        if (u >= 1) {
          supernovae.splice(i, 1);
          continue;
        }
        for (var r = 0; r < p.rings; r++) {
          var delay = r * 0.12;
          var ru = Math.max(0, Math.min(1, (u - delay) / (1 - delay * 0.5)));
          if (ru <= 0) continue;
          var radius = 8 + ru * 100;
          var a = (1 - ru) * 0.22;
          ctx.strokeStyle = 'rgba(220,235,255,' + a.toFixed(3) + ')';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, TWO_PI);
          ctx.stroke();
        }
      }
    }

    function drawWanderers(dt, w, h) {
      for (var i = 0; i < wanderers.length; i++) {
        var wdr = wanderers[i];
        wdr.age += dt * timeScale;
        var curve = Math.sin(wdr.age * wdr.curveFreq + wdr.curvePhase) * wdr.curveAmp;
        var nx = -wdr.vy;
        var ny = wdr.vx;
        var nmag = Math.sqrt(nx * nx + ny * ny) || 1;
        nx /= nmag;
        ny /= nmag;
        wdr.x += (wdr.vx + nx * curve * 0.02) * dt * timeScale;
        wdr.y += (wdr.vy + ny * curve * 0.02) * dt * timeScale;
        wrapPos(wdr, w, h, 40);

        var mag = Math.sqrt(wdr.vx * wdr.vx + wdr.vy * wdr.vy) || 1;
        var ux = wdr.vx / mag;
        var uy = wdr.vy / mag;
        var segs = 6;
        for (var s = 0; s < segs; s++) {
          var t0 = s / segs;
          var t1 = (s + 1) / segs;
          var bend0 = Math.sin(t0 * Math.PI) * curve * 0.15 * (1 - t0);
          var bend1 = Math.sin(t1 * Math.PI) * curve * 0.15 * (1 - t1);
          var x0 = wdr.x - ux * wdr.trailLen * t0 + nx * bend0;
          var y0 = wdr.y - uy * wdr.trailLen * t0 + ny * bend0;
          var x1 = wdr.x - ux * wdr.trailLen * t1 + nx * bend1;
          var y1 = wdr.y - uy * wdr.trailLen * t1 + ny * bend1;
          ctx.strokeStyle = rgba(wdr.color, 0.28 * (1 - t0));
          ctx.lineWidth = 1.4 * (1 - t0 * 0.6);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        ctx.fillStyle = rgba(wdr.color, 0.55);
        ctx.beginPath();
        ctx.arc(wdr.x, wdr.y, wdr.r, 0, TWO_PI);
        ctx.fill();
      }
    }

    function drawMouseFx(dt, now) {
      if (!mouse.in) return;

      var mdx = mouse.x - mouse.prevX;
      var mdy = mouse.y - mouse.prevY;
      var speed = Math.sqrt(mdx * mdx + mdy * mdy);

      if (speed > 1.2 || mouse.movedThisFrame) {
        if (speed > 1.2) {
          spawnRibbonTrail(mouse.prevX, mouse.prevY, mouse.x, mouse.y);
        }
        idleOrbits.length = 0;
      }
      mouse.movedThisFrame = false;
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;

      // 星河拖尾
      for (var i = trails.length - 1; i >= 0; i--) {
        var tr = trails[i];
        tr.life += dt * timeScale;
        var u = tr.life / tr.maxLife;
        if (u >= 1) {
          trails.splice(i, 1);
          continue;
        }
        tr.x += tr.vx * dt * 60 * timeScale;
        tr.y += tr.vy * dt * 60 * timeScale;
        var fade = 1 - easeOut(u);
        var a = tr.a0 * fade;
        if (a < 0.02) continue;
        var r = tr.r * (0.55 + 0.45 * fade);
        drawSpark(ctx, tr.x, tr.y, r, tr.ang, tr.color, a);
      }

      // 静止：缓慢旋转的微星云
      if (now - mouse.lastMoveAt > 0.85) {
        ensureIdleOrbits();
        for (i = 0; i < idleOrbits.length; i++) {
          var o = idleOrbits[i];
          o.ang += o.spin * dt * timeScale;
          var ox = mouse.x + Math.cos(o.ang) * o.radius;
          var oy = mouse.y + Math.sin(o.ang) * o.radius;
          ctx.fillStyle = rgba(o.color, o.a);
          ctx.beginPath();
          ctx.arc(ox, oy, o.r, 0, TWO_PI);
          ctx.fill();
        }
      } else if (now - mouse.lastMoveAt < 0.4) {
        idleOrbits.length = 0;
      }

      // 点击星尘
      for (i = bursts.length - 1; i >= 0; i--) {
        var b = bursts[i];
        b.life += dt * timeScale;
        var bu = b.life / b.maxLife;
        if (bu >= 1) {
          bursts.splice(i, 1);
          continue;
        }
        b.vx *= Math.pow(0.94, dt * 60);
        b.vy *= Math.pow(0.94, dt * 60);
        b.x += b.vx * dt * 60 * timeScale;
        b.y += b.vy * dt * 60 * timeScale;
        var ba = b.a0 * (1 - easeOut(bu));
        drawSpark(ctx, b.x, b.y, b.r * (1 - bu * 0.5), b.ang, b.color, ba);
      }

      // 极淡圆环
      for (i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i];
        rp.life += dt * timeScale;
        var ru = rp.life / rp.maxLife;
        if (ru >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        var rr = 10 + ru * 50;
        var ra = 0.15 * (1 - easeOut(ru));
        ctx.strokeStyle = 'rgba(220,235,255,' + ra.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rr, 0, TWO_PI);
        ctx.stroke();
      }
    }

    function tick(ts) {
      rafId = 0;
      if (!running || !ctx) return;
      var dim = size();
      var w = dim.w;
      var h = dim.h;
      var now = ts / 1000;
      var dt = lastTs ? Math.min(0.05, now - lastTs) : 0.016;
      lastTs = now;
      frameCount++;

      if (fading && timeScale > 0.15) {
        timeScale = Math.max(0.15, timeScale - dt * 0.85);
      }

      ctx.clearRect(0, 0, w, h);
      drawNebulae(now, dt, w, h);
      drawStars(now, dt, now, w, h);
      drawDust(now, dt, w, h);
      drawWanderers(dt, w, h);
      drawMeteors(dt, now, w, h);
      drawSupernovae(dt, now);
      drawMouseFx(dt, now);

      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true;
      fading = false;
      timeScale = 1;
      canvas.style.transition = '';
      ambient.style.transition = '';
      canvas.style.opacity = '1';
      ambient.style.opacity = '1';
      initAll();
      bindMouse();
      clearMouseFx();
      lastTs = 0;
      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      fading = false;
      timeScale = 1;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      for (var i = 0; i < meteors.length; i++) meteors[i].active = false;
      supernovae = [];
      clearMouseFx();
      unbindMouse();
      if (ctx) {
        var dim = size();
        ctx.clearRect(0, 0, dim.w, dim.h);
      }
    }

    function fadeOut(ms, done) {
      if (fading) return;
      fading = true;
      var dur = ms || 1000;
      canvas.style.transition = 'opacity ' + dur + 'ms ease';
      ambient.style.transition = 'opacity ' + dur + 'ms ease';
      canvas.style.opacity = '0';
      ambient.style.opacity = '0';
      window.setTimeout(function () {
        stop();
        if (done) done();
      }, dur + 40);
    }

    function resize() {
      if (!running) return;
      var dim = size();
      initStars(dim.w, dim.h);
      initDust(dim.w, dim.h);
      initNebulae(dim.w, dim.h);
      initWanderers(dim.w, dim.h);
    }

    function destroy() {
      stop();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (ambient.parentNode) ambient.parentNode.removeChild(ambient);
    }

    return {
      canvas: canvas,
      nebula: ambient,
      start: start,
      stop: stop,
      fadeOut: fadeOut,
      resize: resize,
      destroy: destroy,
      isRunning: function () {
        return running;
      },
    };
  }

  window.WaveCalcStarfield = { create: create };
})();
