/**
 * visualizer.js - Futuristic Canvas Voice Orb Visualizer
 * Reacts to User Speech Volume, Gemini Audio Output, and State Transitions (Listening, Speaking, Interrupted).
 */

class VoiceOrbVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    
    this.state = 'idle'; // 'idle', 'connecting', 'listening', 'thinking', 'speaking', 'interrupted'
    this.userVolume = 0;
    this.aiVolume = 0;
    this.targetRadius = 60;
    this.currentRadius = 60;
    this.time = 0;
    this.particles = [];
    this.rings = [];
    this.isRunning = false;
    this.animId = null;

    this.initCanvas();
    this.initParticles();
    window.addEventListener('resize', () => this.resize());
  }

  initCanvas() {
    this.resize();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 320;
    const height = rect.height || 320;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);
    this.displayWidth = width;
    this.displayHeight = height;
    this.centerX = width / 2;
    this.centerY = height / 2;
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < 45; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        distance: 40 + Math.random() * 80,
        speed: 0.005 + Math.random() * 0.015,
        size: 1.5 + Math.random() * 2.5,
        color: Math.random() > 0.5 ? '#38bdf8' : '#a855f7',
        alpha: 0.2 + Math.random() * 0.6
      });
    }
  }

  setState(newState) {
    this.state = newState;
    if (newState === 'interrupted') {
      // Trigger a brief burst animation
      this.triggerInterruptedBurst();
    }
  }

  setUserVolume(vol) {
    this.userVolume = vol;
  }

  setAiVolume(vol) {
    this.aiVolume = vol;
  }

  triggerInterruptedBurst() {
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        distance: 50,
        speed: 0.04 + Math.random() * 0.04,
        size: 2 + Math.random() * 3,
        color: '#00f5d4',
        alpha: 0.9,
        decay: 0.02
      });
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.render();
  }

  stop() {
    this.isRunning = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  render() {
    if (!this.isRunning) return;
    this.time += 0.03;

    const ctx = this.ctx;
    const width = this.displayWidth;
    const height = this.displayHeight;
    const cx = this.centerX;
    const cy = this.centerY;

    ctx.clearRect(0, 0, width, height);

    // Calculate dynamic activity level
    let activity = 0;
    let mainColor1 = '#38bdf8'; // Cyan
    let mainColor2 = '#818cf8'; // Indigo
    let glowColor = 'rgba(56, 189, 248, 0.4)';

    if (this.state === 'listening') {
      activity = Math.max(0.15, this.userVolume * 1.5);
      mainColor1 = '#00f5d4'; // Neon Aquamarine
      mainColor2 = '#38bdf8'; // Electric Sky
      glowColor = `rgba(0, 245, 212, ${0.3 + activity * 0.5})`;
    } else if (this.state === 'speaking') {
      activity = Math.max(0.2, this.aiVolume * 2.0);
      mainColor1 = '#ec4899'; // Pink / Magenta
      mainColor2 = '#8b5cf6'; // Violet
      glowColor = `rgba(236, 72, 153, ${0.35 + activity * 0.6})`;
    } else if (this.state === 'thinking') {
      activity = 0.4;
      mainColor1 = '#a855f7';
      mainColor2 = '#6366f1';
      glowColor = 'rgba(168, 85, 247, 0.5)';
    } else if (this.state === 'connecting') {
      activity = 0.2;
      mainColor1 = '#f59e0b';
      mainColor2 = '#06b6d4';
      glowColor = 'rgba(245, 158, 11, 0.4)';
    } else if (this.state === 'interrupted') {
      activity = 0.6;
      mainColor1 = '#00f5d4';
      mainColor2 = '#38bdf8';
      glowColor = 'rgba(0, 245, 212, 0.8)';
    } else {
      // Idle
      activity = 0.05 + Math.sin(this.time * 1.2) * 0.04;
      mainColor1 = '#38bdf8';
      mainColor2 = '#6366f1';
      glowColor = 'rgba(56, 189, 248, 0.2)';
    }

    // Dynamic Base Radius
    const baseRadius = 55 + activity * 35;
    this.currentRadius += (baseRadius - this.currentRadius) * 0.15;

    // 1. Draw Outer Ambient Glow
    const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, this.currentRadius * 2.2);
    bgGrad.addColorStop(0, glowColor);
    bgGrad.addColorStop(0.6, glowColor.replace(/[\d\.]+\)$/, '0.08)'));
    bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, this.currentRadius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 2. Draw Orbiting Harmonic Wave Rings
    const ringCount = this.state === 'speaking' ? 4 : 3;
    for (let r = 0; r < ringCount; r++) {
      ctx.save();
      ctx.beginPath();
      const ringRadius = this.currentRadius + (r + 1) * (14 + activity * 12);
      const points = 60;
      for (let i = 0; i <= points; i++) {
        const theta = (i / points) * Math.PI * 2;
        const wave = Math.sin(theta * (4 + r) + this.time * (2 + r) + (r * Math.PI / 3)) * (4 + activity * 16);
        const rad = ringRadius + wave;
        const x = cx + Math.cos(theta) * rad;
        const y = cy + Math.sin(theta) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = r % 2 === 0 ? mainColor1 : mainColor2;
      ctx.lineWidth = 1.5 + (activity * 1.5);
      ctx.globalAlpha = Math.max(0.1, 0.4 - r * 0.08 + (activity * 0.3));
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw Orbiting Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.angle += p.speed;
      const wobble = Math.sin(this.time + i) * 8 * activity;
      const dist = p.distance + wobble;
      const px = cx + Math.cos(p.angle) * dist;
      const py = cy + Math.sin(p.angle) * dist;

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (p.decay) {
        p.alpha -= p.decay;
        p.distance += 2;
        if (p.alpha <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }

    // 4. Draw Core Glowing Blob / Sphere with Fluid Morphing
    ctx.save();
    ctx.beginPath();
    const corePoints = 36;
    for (let i = 0; i <= corePoints; i++) {
      const angle = (i / corePoints) * Math.PI * 2;
      // Perlin-like organic ripple
      const ripple1 = Math.sin(angle * 3 + this.time * 2.5) * (6 + activity * 18);
      const ripple2 = Math.cos(angle * 5 - this.time * 3.0) * (4 + activity * 12);
      const r = this.currentRadius + ripple1 + ripple2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    const coreGrad = ctx.createLinearGradient(
      cx - this.currentRadius,
      cy - this.currentRadius,
      cx + this.currentRadius,
      cy + this.currentRadius
    );
    coreGrad.addColorStop(0, mainColor1);
    coreGrad.addColorStop(0.5, mainColor2);
    coreGrad.addColorStop(1, '#ffffff');

    ctx.fillStyle = coreGrad;
    ctx.shadowColor = mainColor1;
    ctx.shadowBlur = 25 + activity * 30;
    ctx.fill();
    ctx.restore();

    // 5. Draw Inner Specular Core Highlight
    ctx.save();
    const innerGrad = ctx.createRadialGradient(
      cx - this.currentRadius * 0.25,
      cy - this.currentRadius * 0.25,
      2,
      cx,
      cy,
      this.currentRadius * 0.7
    );
    innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    innerGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)');
    innerGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(cx - this.currentRadius * 0.15, cy - this.currentRadius * 0.15, this.currentRadius * 0.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.animId = requestAnimationFrame(() => this.render());
  }
}

window.VoiceOrbVisualizer = VoiceOrbVisualizer;
