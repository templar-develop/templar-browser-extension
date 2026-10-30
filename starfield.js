// Quiet star background. Render only on open, size or theme change.
// No animation frame loop, interval, meteor, moving particle or background job.
export function startStarfield(canvas) {
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!ctx) return () => {};
  let width = 0, height = 0, stars = [], disposed = false;
  let theme;
  canvas.dataset.animated = 'false';
  function draw() {
    if (disposed || document.hidden) return;
    const nextWidth = window.innerWidth, nextHeight = window.innerHeight;
    const nextTheme = document.documentElement.dataset.theme;
    if (width === nextWidth && height === nextHeight && theme === nextTheme) return;
    const oldWidth = width, oldHeight = height;
    width = nextWidth; height = nextHeight; theme = nextTheme;
    // A fixed bitmap at CSS resolution is enough for a background. A bounded
    // particle count also keeps full-page preview inexpensive on Retina screens.
    canvas.width = width; canvas.height = height;
    if (!stars.length) {
      stars = Array.from({ length: Math.min(100, Math.floor(width * height / 3000)) }, () => ({
        x: Math.random() * width, y: Math.random() * height,
        r: .3 + Math.random() * .85, a: .25 + Math.random() * .4,
        gold: Math.random() < .12,
      }));
    } else if (oldWidth && oldHeight) {
      for (const star of stars) { star.x *= width / oldWidth; star.y *= height / oldHeight; }
    }
    const light = theme === 'light';
    const base = light ? '128,102,55' : '245,237,222';
    const gold = light ? '168,138,77' : '235,199,117';
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${star.gold ? gold : base},${star.a})`; ctx.fill();
    }
  }
  const observer = new MutationObserver(draw);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('resize', draw);
  document.addEventListener('visibilitychange', draw);
  draw();
  return () => {
    disposed = true; observer.disconnect();
    window.removeEventListener('resize', draw);
    document.removeEventListener('visibilitychange', draw);
  };
}
