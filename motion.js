// Short, interruptible transitions. Never animate form edits or delay an action.
const screens = new WeakMap();
const active = new Set();
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
reduced.addEventListener('change', () => {
  if (reduced.matches) for (const animation of active) animation.cancel();
});

export function animateScreen(screen, { key, phase = '', region = '' }) {
  const previous = screens.get(screen);
  previous?.animations.forEach(animation => animation.cancel());
  const animations = [];
  screens.set(screen, { key, phase, region, animations });
  if (reduced.matches || typeof screen.animate !== 'function') return;

  function play(element, frames, delay = 0, duration = 280) {
    if (!element) return;
    const animation = element.animate(frames, {
      duration, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards',
    });
    animations.push(animation);
    active.add(animation);
    const done = () => active.delete(animation);
    animation.addEventListener('finish', done, { once: true });
    animation.addEventListener('cancel', done, { once: true });
  }

  if (previous?.key !== key) {
    const back = key === 'home';
    play(screen, [
      { opacity: 0, transform: `translate(${back ? '-7px' : '7px'}, 5px)` },
      { opacity: 1, transform: 'translate(0, 0)' },
    ], 0, 230);
    const items = screen.querySelectorAll('.region-option, .settings-row, .routing-mode, .speedtest-metrics > div, .auth-tabs > button');
    [...items].slice(0, 12).forEach((element, index) => play(element, [
      { opacity: 0, transform: 'translateY(9px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], 30 + index * 27, 290));
    play(screen.querySelector('.onboarding-emblem, .speedtest-gauge'), [
      { opacity: 0, transform: 'translateY(7px) scale(.94)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], 40, 360);
  } else if (previous.phase !== phase) {
    for (const element of screen.querySelectorAll('.hero-title, .hero-subtitle, .status-pill')) play(element, [
      { opacity: .2, transform: 'translateY(4px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], 0, 220);
  }

  if (previous && previous.region !== region && key === 'home') {
    play(screen.querySelector('.location-card .flag'), [
      { opacity: .25, transform: 'translateY(5px) scale(.82) rotate(-5deg)' },
      { opacity: 1, transform: 'translateY(0) scale(1) rotate(0)' },
    ], 10, 360);
    play(screen.querySelector('.location-copy'), [{ opacity: 0 }, { opacity: 1 }], 50, 240);
  }
  if (phase === 'connected' && previous?.phase !== 'connected') {
    play(screen.querySelector('.power-button'), [
      { transform: 'scale(.92)' }, { transform: 'scale(1.035)', offset: .65 }, { transform: 'scale(1)' },
    ], 0, 390);
  }
}
