import { Game } from './core/Game';

// ?seed=xxx in the URL to replay a world; otherwise a random one.
const params = new URLSearchParams(window.location.search);
const seed = params.get('seed') ?? Math.random().toString(36).slice(2, 10);

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const hud = document.querySelector<HTMLElement>('#hud');
const overlay = document.querySelector<HTMLElement>('#overlay');
if (!canvas || !hud || !overlay) throw new Error('Éléments HTML manquants');

const game = new Game(canvas, hud, overlay, seed);
game.start();
// Dev only: lets the console (and automated checks) inspect the running game.
if (import.meta.env.DEV) Object.assign(window, { game });
