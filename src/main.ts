import '@fontsource/russo-one';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import { Game } from './game';
import { audio } from './audio';

const game = new Game(document.getElementById('app')!);
game.hud.intro(() => { audio.start(); game.started = true; });

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
