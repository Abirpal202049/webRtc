/**
 * ParticleEngine — Interactive Canvas-based packet flow visualization.
 *
 * Features:
 * - Animated particles representing network packets
 * - Click-to-inspect: click a packet to see its details
 * - Speed control: slow down / pause / speed up the visualization
 * - Highlighted particle: selected packet pulses and shows a label
 * - Hit detection for mouse clicks on particles
 */

const COLORS = {
  videoSend: "#3B82F6",
  videoRecv: "#60A5FA",
  audioSend: "#22C55E",
  audioRecv: "#4ADE80",
  videoLost: "#EF4444",
  audioLost: "#EF4444",
};

const TYPE_LABELS = {
  videoSend: "Video (Sending)",
  videoRecv: "Video (Receiving)",
  audioSend: "Audio (Sending)",
  audioRecv: "Audio (Receiving)",
  videoLost: "Video (Lost)",
  audioLost: "Audio (Lost)",
};

const LANES = {
  videoSend: 0.2,
  audioSend: 0.38,
  videoRecv: 0.62,
  audioRecv: 0.8,
  videoLost: 0.62,
  audioLost: 0.8,
};

const MAX_PARTICLES = 200;
const PARTICLE_RADIUS = 3;
const GLOW_RADIUS = 6;

let nextId = 0;

export class ParticleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.running = false;
    this.lastFrame = 0;
    this.spawnConfig = null;
    this.spawnTimers = {};
    this.transitMs = 1500;
    this.animationId = null;

    // Interactive state
    this.speedMultiplier = 1.0; // 0 = paused, 0.25 = slow-mo, 1 = normal, 2 = fast
    this.selectedParticle = null;
    this.hoveredParticle = null;
    this.onParticleSelect = null; // callback: (particle | null) => void
    this.lastStats = null; // store latest stats for packet metadata

    // Mouse handling
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onClick = this._onClick.bind(this);
    canvas.addEventListener("mousemove", this._onMouseMove);
    canvas.addEventListener("click", this._onClick);
  }

  updateSpawnConfig(config) {
    this.spawnConfig = config.spawnRate;
    this.transitMs = config.transitMs;
    this.lastStats = config.stats;

    const types = ["videoSend", "audioSend", "videoRecv", "audioRecv", "videoLost", "audioLost"];
    for (const type of types) {
      const count = this.spawnConfig[type] || 0;
      if (count > 0) {
        this.spawnTimers[type] = {
          remaining: count,
          intervalMs: 1500 / count,
          elapsed: 0,
        };
      } else {
        this.spawnTimers[type] = null;
      }
    }
  }

  setSpeed(multiplier) {
    this.speedMultiplier = multiplier;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this._tick();
  }

  stop() {
    this.running = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.canvas.removeEventListener("mousemove", this._onMouseMove);
    this.canvas.removeEventListener("click", this._onClick);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
  }

  // ── Hit detection ──

  _getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _findParticleAt(mx, my) {
    const w = this.displayWidth;
    const h = this.displayHeight;
    if (!w || !h) return null;

    // Check in reverse order (top-drawn last = most visible)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const px = 30 + p.x * (w - 60);
      const py = p.y * h;
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (dist <= 8) return p; // 8px hit radius (generous for easy clicking)
    }
    return null;
  }

  _onMouseMove(e) {
    const { x, y } = this._getMousePos(e);
    const hit = this._findParticleAt(x, y);
    this.hoveredParticle = hit;
    this.canvas.style.cursor = hit ? "pointer" : "default";
  }

  _onClick(e) {
    const { x, y } = this._getMousePos(e);
    const hit = this._findParticleAt(x, y);

    if (hit) {
      this.selectedParticle = hit === this.selectedParticle ? null : hit;
    } else {
      this.selectedParticle = null;
    }

    if (this.onParticleSelect) {
      this.onParticleSelect(this.selectedParticle);
    }
  }

  // ── Animation loop ──

  _tick() {
    if (!this.running) return;

    const now = performance.now();
    const rawDt = now - this.lastFrame;
    this.lastFrame = now;

    const dt = rawDt * this.speedMultiplier;

    if (this.speedMultiplier > 0) {
      this._spawnParticles(dt);
    }
    this._updateParticles(dt);
    this._draw();

    this.animationId = requestAnimationFrame(() => this._tick());
  }

  _spawnParticles(dt) {
    if (!this.spawnConfig) return;

    for (const type of Object.keys(this.spawnTimers)) {
      const timer = this.spawnTimers[type];
      if (!timer || timer.remaining <= 0) continue;

      timer.elapsed += dt;
      while (timer.elapsed >= timer.intervalMs && timer.remaining > 0) {
        timer.elapsed -= timer.intervalMs;
        timer.remaining--;

        if (this.particles.length >= MAX_PARTICLES) break;

        const isLost = type.includes("Lost");
        const isSend = type.includes("Send") || type.includes("Lost");
        const isVideo = type.includes("video") || type.includes("Video");
        const laneY = LANES[type] || 0.5;
        const stats = this.lastStats;

        this.particles.push({
          id: nextId++,
          type,
          x: isSend ? 0 : 1,
          y: laneY + (Math.random() - 0.5) * 0.08,
          speed: (1.0 / this.transitMs) * (isSend ? 1 : -1),
          opacity: 1.0,
          isLost,
          dieAt: isLost ? 0.3 + Math.random() * 0.4 : null,
          dying: false,
          radius: PARTICLE_RADIUS + Math.random() * 1.5,
          born: performance.now(),
          // Metadata for inspection
          meta: {
            direction: isSend ? "Sending" : "Receiving",
            mediaType: isVideo ? "Video" : "Audio",
            status: isLost ? "Lost" : "Delivered",
            protocol: "UDP (SRTP)",
            bitrate: isVideo
              ? (isSend ? stats?.videoSendBitrate : stats?.videoRecvBitrate)
              : (isSend ? stats?.audioSendBitrate : stats?.audioRecvBitrate),
            codec: isVideo
              ? (stats?.videoCodecSent || "VP8")
              : (stats?.audioCodecSent || "Opus"),
            rtt: stats?.rtt,
            jitter: isVideo ? stats?.videoJitter : stats?.audioJitter,
            resolution: isVideo && isSend
              ? (stats?.videoWidthSent ? `${stats.videoWidthSent}x${stats.videoHeightSent}` : null)
              : isVideo && !isSend
                ? (stats?.videoWidthReceived ? `${stats.videoWidthReceived}x${stats.videoHeightReceived}` : null)
                : null,
            fps: isVideo
              ? (isSend ? stats?.videoFpsSent : stats?.videoFpsReceived)
              : null,
          },
        });
      }
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.x += p.speed * dt;

      if (p.isLost) {
        const progress = p.speed > 0 ? p.x : 1 - p.x;
        if (progress >= p.dieAt && !p.dying) {
          p.dying = true;
        }
        if (p.dying) {
          p.opacity -= dt * 0.003;
        }
      }

      if (p.x > 1.05 || p.x < -0.05 || p.opacity <= 0) {
        // If removing the selected particle, deselect
        if (p === this.selectedParticle) {
          this.selectedParticle = null;
          if (this.onParticleSelect) this.onParticleSelect(null);
        }
        this.particles.splice(i, 1);
      }
    }
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    // Lane divider
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, h * 0.5);
    ctx.lineTo(w - 40, h * 0.5);
    ctx.stroke();

    // Lane labels
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillText("SENDING →", w / 2, h * 0.1);
    ctx.fillText("← RECEIVING", w / 2, h * 0.55);

    // Speed indicator
    if (this.speedMultiplier !== 1) {
      ctx.fillStyle = this.speedMultiplier === 0 ? "rgba(239,68,68,0.5)" : "rgba(234,179,8,0.5)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "right";
      const label = this.speedMultiplier === 0 ? "⏸ PAUSED" : `${this.speedMultiplier}x SPEED`;
      ctx.fillText(label, w - 8, h * 0.1);
    }

    // Endpoints
    this._drawEndpoint(ctx, 16, h / 2, "You");
    this._drawEndpoint(ctx, w - 16, h / 2, "Peer");

    // Particles
    for (const p of this.particles) {
      const px = 30 + p.x * (w - 60);
      const py = p.y * h;
      const color = COLORS[p.type] || "#888";
      const isSelected = p === this.selectedParticle;
      const isHovered = p === this.hoveredParticle;

      // Selection ring
      if (isSelected) {
        ctx.globalAlpha = 0.6 + Math.sin(performance.now() * 0.005) * 0.3;
        ctx.strokeStyle = "#FFF";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, p.radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Hover ring
      if (isHovered && !isSelected) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#FFF";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, p.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Glow
      ctx.globalAlpha = p.opacity * (isSelected ? 0.4 : 0.2);
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? GLOW_RADIUS + 2 : GLOW_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Main dot
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? p.radius + 1 : p.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Lost packet X
      if (p.isLost && p.dying) {
        ctx.strokeStyle = "#EF4444";
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = p.opacity * 0.8;
        const s = 4;
        ctx.beginPath();
        ctx.moveTo(px - s, py - s);
        ctx.lineTo(px + s, py + s);
        ctx.moveTo(px + s, py - s);
        ctx.lineTo(px - s, py + s);
        ctx.stroke();
      }

      // Selected particle label
      if (isSelected) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        const label = TYPE_LABELS[p.type] || p.type;
        ctx.font = "bold 9px sans-serif";
        const tw = ctx.measureText(label).width;
        const lx = Math.min(Math.max(px - tw / 2 - 4, 2), w - tw - 10);
        ctx.beginPath();
        ctx.roundRect(lx, py - 20, tw + 8, 14, 3);
        ctx.fill();
        ctx.fillStyle = "#FFF";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, lx + 4, py - 13);
      }
    }

    ctx.globalAlpha = 1;
  }

  _drawEndpoint(ctx, x, y, label) {
    const mw = 22;
    const mh = 14;
    const my = y - 10;

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(59,130,246,0.08)";
    ctx.beginPath();
    ctx.roundRect(x - mw / 2, my - mh / 2, mw, mh, 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, my + mh / 2);
    ctx.lineTo(x, my + mh / 2 + 4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 6, my + mh / 2 + 4);
    ctx.lineTo(x + 6, my + mh / 2 + 4);
    ctx.stroke();

    ctx.fillStyle = "#22C55E";
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x, my, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, x, my + mh / 2 + 7);
  }
}
