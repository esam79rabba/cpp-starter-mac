// Renders scenes.mjs into a narrated 1080p MP4: HTML -> PNG (headless Chrome), text -> speech (say -v Majed),
// then one ffmpeg segment per scene, concatenated.
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { scenes } from './scenes.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, 'out');
const ICON = path.resolve(DIR, '../../media/icon.png');
const CHROME = process.env.CHROME ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const FINAL = process.argv[2] ?? path.join(OUT, 'cpp-starter-tutorial.mp4');
const TTS = process.env.EDGE_TTS ?? 'edge-tts';
const ONLY = process.env.ONLY; // render images only, for previewing
mkdirSync(OUT, { recursive: true });

const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1920px; height: 1080px; overflow: hidden; font-family: "SF Arabic", "Helvetica Neue", Arial, sans-serif, -apple-system, sans-serif;
  background: radial-gradient(circle at 30% 20%, #3b1d5e 0%, #1a1028 55%, #0e0a16 100%); color: #fff; }
.stage { position: absolute; inset: 70px 120px 210px; display: flex; align-items: center; justify-content: center; }
.step { position: absolute; top: 40px; right: 60px; background: #7c3aed; padding: 10px 30px; border-radius: 40px; font-size: 38px; font-weight: 700; direction: rtl; }
.brand { position: absolute; top: 46px; left: 60px; display: flex; gap: 14px; align-items: center; font: 600 28px "Helvetica Neue", Arial, sans-serif; opacity: .8; }
.brand img { width: 44px; border-radius: 10px; }
.caption { position: absolute; bottom: 50px; left: 120px; right: 120px; min-height: 120px; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.72); border-radius: 24px; padding: 18px 40px; font-size: 46px; font-weight: 600; line-height: 1.45; direction: rtl; text-align: center; }
.hero { text-align: center; } .hero img { width: 260px; border-radius: 52px; box-shadow: 0 20px 60px rgba(124,58,237,.5); }
.hero h1 { font: 800 110px "Helvetica Neue", Arial, sans-serif; margin-top: 30px; } .hero p { font-size: 58px; margin-top: 16px; direction: rtl; color: #d8c8ff; }
.hero .link { margin-top: 36px; font: 500 36px Menlo; color: #c4b5fd; background: rgba(255,255,255,.08); padding: 14px 30px; border-radius: 14px; display: inline-block; }
.vs { display: flex; gap: 50px; align-items: center; }
.card { width: 640px; height: 460px; background: #1e1e1e; border-radius: 28px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; border: 3px solid #333; }
.card.mac { border-color: #7c3aed; } .os { font: 600 34px "Helvetica Neue", Arial, sans-serif; color: #aaa; } .big { font: 700 54px "Helvetica Neue", Arial, sans-serif; }
.ok { font-size: 70px; color: #4ade80; } .eq { font-size: 100px; font-weight: 800; color: #c4b5fd; }
.keys { display: flex; gap: 12px; align-items: center; justify-content: center; direction: ltr; }
kbd { font: 700 40px "Helvetica Neue", Arial, sans-serif; background: linear-gradient(#fafafa, #d4d4d4); color: #222; padding: 12px 26px; border-radius: 14px; box-shadow: 0 6px 0 #888; }
.keys b { font-size: 40px; color: #c4b5fd; }
.win { width: 1600px; height: 760px; background: #1e1e1e; border-radius: 18px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.6); position: relative; direction: ltr; display: flex; flex-direction: column; }
.bar { height: 46px; background: #2d2d2d; display: flex; align-items: center; gap: 10px; padding-left: 18px; flex-shrink: 0; }
.dot { width: 16px; height: 16px; border-radius: 50%; } .r { background: #ff5f56; } .y { background: #ffbd2e; } .g { background: #27c93f; }
.wtitle { flex: 1; text-align: center; color: #aaa; font: 22px "Helvetica Neue", Arial, sans-serif; margin-right: 80px; }
.vscode { flex: 1; display: flex; min-height: 0; } .activity { width: 64px; background: #333; display: flex; flex-direction: column; gap: 22px; padding-top: 20px; align-items: center; }
.activity i { width: 30px; height: 30px; border-radius: 6px; background: #555; } .activity i.on { background: #ddd; }
.side { width: 520px; background: #252526; padding: 18px; color: #ccc; font: 22px "Helvetica Neue", Arial, sans-serif; }
.stitle { font-size: 18px; letter-spacing: 1px; color: #999; margin: 6px 0 14px; } .var { margin-bottom: 24px; font-family: Menlo; font-size: 20px; }
.search { background: #3c3c3c; border: 2px solid #007fd4; padding: 10px 14px; border-radius: 4px; margin-bottom: 20px; }
.ext { display: flex; gap: 14px; align-items: flex-start; background: #04395e; padding: 14px; border-radius: 6px; position: relative; }
.ext img { width: 70px; border-radius: 10px; } .ext b { display: block; font-size: 22px; } .ext span { display: block; color: #aaa; font-size: 18px; margin: 4px 0; }
.ext small { font-size: 16px; color: #bbb; display: block; width: 260px; }
.inst { position: absolute; right: 14px; bottom: 14px; background: #0e639c; color: #fff; padding: 6px 18px; border-radius: 4px; font-size: 20px; }
.main { flex: 1; position: relative; display: flex; flex-direction: column; min-width: 0; }
.empty { flex: 1; display: flex; align-items: center; justify-content: center; } .dim { font: 800 200px "Helvetica Neue", Arial, sans-serif; color: #2a2a2a; }
.status { height: 34px; background: #68217a; display: flex; gap: 30px; align-items: center; padding: 0 20px; font: 20px "Helvetica Neue", Arial, sans-serif; color: #fff; flex-shrink: 0; }
.status .sb { background: rgba(255,255,255,.15); padding: 2px 12px; border-radius: 4px; }
.toast { position: absolute; right: 30px; bottom: 60px; width: 720px; background: #252526; border: 1px solid #454545; border-radius: 8px; padding: 26px 26px 80px;
  font: 26px "Helvetica Neue", Arial, sans-serif; color: #ddd; box-shadow: 0 10px 40px rgba(0,0,0,.6); } .toast.good { padding-bottom: 26px; }
.toast .ic { color: #3794ff; margin-right: 14px; font-weight: 700; } .toast.good .ic { color: #4ade80; }
.tbtn { position: absolute; right: 26px; bottom: 20px; background: #0e639c; color: #fff; padding: 8px 26px; border-radius: 4px; }
.start { padding: 70px 90px; } .start h1 { font: 300 70px "Helvetica Neue", Arial, sans-serif; color: #eee; margin-bottom: 40px; }
.sbtn { width: 560px; font: 30px "Helvetica Neue", Arial, sans-serif; padding: 18px 26px; border-radius: 6px; margin-bottom: 18px; background: #3a3d41; color: #eee; }
.sbtn.primary { background: #0e639c; }
.quick { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); width: 900px; background: #252526; border: 1px solid #454545; border-radius: 8px; padding: 18px; box-shadow: 0 10px 40px rgba(0,0,0,.6); font-family: "Helvetica Neue", Arial, sans-serif; }
.qtitle { color: #ccc; font-size: 22px; margin-bottom: 12px; text-align: center; } .qin { background: #3c3c3c; border: 2px solid #007fd4; padding: 12px; font-size: 28px; color: #fff; }
.caret { display: inline-block; width: 2px; height: 30px; background: #fff; vertical-align: middle; margin-left: 2px; } .qhint { color: #999; font-size: 18px; margin-top: 10px; }
.tab { background: #1e1e1e; color: #fff; font: 22px "Helvetica Neue", Arial, sans-serif; padding: 12px 24px; border-top: 2px solid #7c3aed; width: max-content; }
.code { font: 34px/1.7 Menlo, monospace; color: #d4d4d4; padding: 20px 0; }
.ln { display: flex; align-items: center; } .src { white-space: pre; } .num { width: 70px; text-align: right; color: #858585; margin-right: 34px; }
.bp, .nobp { width: 22px; height: 22px; border-radius: 50%; margin-left: 16px; } .bp { background: #e51400; }
.stopline { background: rgba(255,204,0,.22); outline: 2px solid rgba(255,204,0,.6); } .stopline .bp { box-shadow: 0 0 0 4px #ffcc00; }
.kw { color: #c586c0; } .str { color: #ce9178; } .ty { color: #569cd6; } .fn { color: #dcdcaa; }
.squig { text-decoration: underline wavy #f14c4c; text-underline-offset: 8px; padding: 0 8px; }
.main > .keys { position: absolute; right: 50px; top: 120px; }
.keyrow { display: flex; gap: 18px; align-items: center; padding: 20px 40px; direction: ltr; font: 600 30px "SF Arabic"; color: #ddd; } .keyrow .keys kbd { font-size: 30px; padding: 8px 18px; }
.keyrow span { margin-right: 26px; }
.dbgbar { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: #333; padding: 6px 20px; border-radius: 6px; font-size: 30px; letter-spacing: 12px; color: #75beff; }
.term { border-top: 1px solid #444; flex: 1; padding: 0 30px; } .ttabs { display: flex; gap: 40px; font: 20px "Helvetica Neue", Arial, sans-serif; color: #999; padding: 14px 0; }
.ttabs .on { color: #fff; border-bottom: 2px solid #7c3aed; } .ttabs em { font-style: normal; background: #0e639c; border-radius: 10px; padding: 0 8px; }
.term pre { font: 30px/1.5 Menlo; color: #ddd; } .prob { font: 28px "Helvetica Neue", Arial, sans-serif; color: #ddd; padding: 8px 0; } .prob small { color: #888; margin-left: 12px; }
.err { color: #f14c4c; margin-right: 12px; } .expl { color: #fde68a; padding-left: 44px; }
.browser .site { text-align: center; padding-top: 30px; color: #222; background: #fff; flex: 1; }
.site .url { font: 24px "Helvetica Neue", Arial, sans-serif; background: #eee; margin: 0 200px 70px; padding: 10px; border-radius: 20px; color: #444; }
.site h2 { font: 700 84px "Helvetica Neue", Arial, sans-serif; } .site p { font: 34px "Helvetica Neue", Arial, sans-serif; color: #555; margin: 20px 0 60px; }
.dl { display: inline-block; background: #0066b8; color: #fff; font: 600 40px "Helvetica Neue", Arial, sans-serif; padding: 22px 60px; border-radius: 8px; }
.pulse { box-shadow: 0 0 0 6px rgba(250,204,21,.95), 0 0 40px 10px rgba(250,204,21,.55); }
.chips { display: flex; flex-wrap: wrap; gap: 34px; justify-content: center; max-width: 1500px; }
.chips code { font: 600 54px Menlo; background: #1e1e1e; border: 3px solid #7c3aed; padding: 26px 40px; border-radius: 20px; color: #fde68a; }
.chips code::after { content: " ✓"; color: #4ade80; }
`;

// Keep Latin runs (C++, Ctrl + fn + F5, "Ready to build C++") left-to-right inside Arabic text.
const ltr = (t) => t.replace(/\(?[A-Za-z"][A-Za-z0-9+.\-_ ()";'#<>\/:]*[A-Za-z0-9+)"]/g, (m) => `<bdi dir="ltr">${m}</bdi>`);

function page(scene) {
  const body = scene.body.replaceAll('ICON', `file://${ICON}`).replace(/<p>([^<]*)<\/p>/g, (_, t) => `<p>${ltr(t)}</p>`);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<div class="brand"><img src="file://${ICON}">C++ Starter for Mac</div>
${scene.step ? `<div class="step">${scene.step}</div>` : ''}
<div class="stage">${body}</div>
<div class="caption"><span>${ltr(scene.caption)}</span></div></body></html>`;
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const segments = [];

scenes.forEach((scene, i) => {
  const id = String(i + 1).padStart(2, '0');
  const html = path.join(OUT, `${id}.html`);
  const png = path.join(OUT, `${id}.png`);
  writeFileSync(html, page(scene));
  run(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--window-size=1920,1080', `--screenshot=${png}`, `file://${html}`]);
  if (ONLY) return;

  const aiff = path.join(OUT, `${id}.aiff`);
  // One multilingual neural voice reads the Arabic and the English terms ({...} marks them; braces dropped).
  const mp3 = path.join(OUT, `${id}.mp3`);
  run(TTS, ['--voice', 'en-US-AndrewMultilingualNeural', '--rate=-5%', '--text', scene.say.replace(/[{}]/g, ''), '--write-media', mp3]);
  run('ffmpeg', ['-y', '-i', mp3, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '48000', aiff]);
  const speech = parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', aiff]));
  const lead = 0.5;
  const dur = (lead + speech + 0.9).toFixed(2);
  const fadeOut = (dur - 0.35).toFixed(2);
  const seg = path.join(OUT, `${id}.mp4`);
  run('ffmpeg', ['-y', '-loop', '1', '-framerate', '30', '-i', png, '-i', aiff,
    '-filter_complex',
    `[0:v]format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOut}:d=0.35[v];` +
    `[1:a]aresample=48000,adelay=${lead * 1000}:all=1,apad[a]`,
    '-map', '[v]', '-map', '[a]', '-t', dur, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ac', '2', seg]);
  segments.push(seg);
  console.log(`scene ${id}: ${dur}s`);
});

if (!ONLY) {
  const list = path.join(OUT, 'list.txt');
  writeFileSync(list, segments.map((s) => `file '${s}'`).join('\n'));
  run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', FINAL]);
  console.log('wrote', FINAL);
}
