import './play-ui.css'
import './retro-ui.css'

export function createPlayUI({ start, restart, dig, pause, sound }) {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crt-frame" aria-hidden="true"></div><div class="crt-side-mark" aria-hidden="true"></div><div class="crt-texture" aria-hidden="true"></div>
    <header class="play-header"><span class="wordmark">CURSOR CULT</span>
      <nav aria-label="游戏控制"><button class="quiet-button" id="sound-toggle" aria-pressed="false">声音：关</button><button class="quiet-button" id="pause-toggle" hidden>暂停</button></nav></header>
    <section class="intro-card" aria-labelledby="intro-title">
      <span class="eyebrow">WATCH CLOSELY.</span>
      <h1 id="intro-title">注意，<br>他在偷看你！</h1>
      <p>试着移动鼠标。</p>
      <button class="main-button" id="begin-play" disabled>正在准备场景…</button>
      <p class="micro" id="load-note" role="status"></p>
    </section>
    <section class="play-hud" hidden aria-label="本轮进度">
      <div class="hud-top"><span id="chapter">01 / 注视</span><span>分数 <b id="hit-total">0</b></span></div>
      <div class="meter" role="progressbar" aria-label="失控程度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <div class="hud-bottom"><span id="meter-caption"></span><span id="combo-label"></span></div>
    </section>
    <div class="objective" hidden><span class="objective-dot"></span><span id="objective-text" role="status" aria-live="polite"></span></div>
    <button id="shovel-hit-target" type="button" aria-label="点击铲子挖掘" hidden></button><div id="dig-ripple" aria-hidden="true"></div>
    <section class="result-card" hidden aria-labelledby="result-title"><span class="eyebrow">CURSOR CULT</span><h2 id="result-title">本轮记录</h2><div class="result-stats"><div><strong id="result-score">0</strong><span>分</span></div><div><strong id="result-time">0</strong><span>秒</span></div><div><strong id="result-digs">0</strong><span>次挖掘</span></div></div><button class="main-button" id="play-again">再来一次 ↗</button></section>
    <section class="pause-card" hidden aria-label="游戏已暂停"><span class="eyebrow">PAUSED</span><h2>已暂停</h2><button class="main-button" id="resume-play">继续</button></section>
    
  `)
  const q = selector => document.querySelector(selector)
  q('#begin-play').onclick = start
  q('#play-again').onclick = restart
  q('#shovel-hit-target').onclick = dig
  q('#pause-toggle').onclick = pause
  q('#resume-play').onclick = pause
  q('#sound-toggle').onclick = sound
  return {
    ready() { q('#begin-play').disabled = false; q('#begin-play').hidden = true; q('#load-note').hidden = true },
    error() { q('#load-note').textContent = '场景加载失败，请检查网络后刷新重试。'; q('#begin-play').textContent = '刷新重试'; q('#begin-play').disabled = false; q('#begin-play').onclick = () => location.reload() },
    begin() { q('.intro-card').hidden = false; q('.result-card').hidden = true; q('.play-hud').hidden = true; q('.objective').hidden = true; q('#pause-toggle').hidden = false; document.body.classList.add('is-playing'); document.body.classList.remove('is-finished') },
    stage(state) {
      const stages = {
        NORMAL: ['01 / 注视', '试着移动鼠标。'],
        HANDS_WARNING: ['02 / 异动', '小心，上面！'], SHOCK: ['02 / 异动', '小心，上面！点击清除。'],
        HEART_GAME: ['03 / 控制', '点击清除。'], OVERLOAD: ['03 / 失控', '越来越多了。'],
        ENGULFED: ['04 / 失控', ''], OCEAN_TRANSITION: ['04 / 失控', ''],
        HEART_OCEAN: ['04 / 淹没', ''],
        DIGGING: ['05 / 挖掘', '点击铲子，挖掘。'], REVEAL: ['06 / 起身', '']
      }
      const [chapter, objective] = stages[state] || stages.NORMAL
      q('#chapter').textContent = chapter; q('#objective-text').textContent = objective
      q('.intro-card').hidden = state !== 'NORMAL'; q('.objective').hidden = !objective || state === 'NORMAL'; q('.play-hud').hidden = !['HEART_GAME', 'OVERLOAD', 'DIGGING'].includes(state); q('#shovel-hit-target').hidden = state !== 'DIGGING'
      q('.meter').setAttribute('aria-label', state === 'DIGGING' || state === 'REVEAL' ? '挖掘进度' : '失控程度')
    },
    update({ score, pressure, combo, rescue, digging, caption }) {
      q('#hit-total').textContent = score
      q('#combo-label').textContent = combo > 1 && !digging ? `${combo} 连击` : ''
      const percent = Math.round((digging ? rescue : pressure) * 100)
      q('.meter i').style.width = `${percent}%`; q('.meter').setAttribute('aria-valuenow', percent)
      q('#meter-caption').textContent = caption
    },
    hit(x, y, text = '+1') {
      const label = document.createElement('span'); label.className = 'hit-label'; label.textContent = text
      label.style.left = `${Math.max(28, Math.min(innerWidth - 80, x))}px`; label.style.top = `${y}px`
      document.body.append(label); setTimeout(() => label.remove(), 750)
    },
    dig(x, y) { const ring = q('#dig-ripple'); ring.style.left = `${x}px`; ring.style.top = `${y}px`; ring.getAnimations().forEach(animation => animation.cancel()); ring.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }], { duration: 450 }) },
    result(score, seconds, digs) { q('#result-score').textContent = score; q('#result-time').textContent = seconds; q('#result-digs').textContent = digs; q('.result-card').hidden = false; q('.objective').hidden = true; q('.play-hud').hidden = true; q('#pause-toggle').hidden = true; q('#shovel-hit-target').hidden = true; document.body.classList.add('is-finished'); q('#play-again').focus() },
    paused(value) { q('.pause-card').hidden = !value; q('#shovel-hit-target').disabled = value; q('#pause-toggle').textContent = value ? '继续' : '暂停' },
    sound(value) { q('#sound-toggle').textContent = `声音：${value ? '开' : '关'}`; q('#sound-toggle').setAttribute('aria-pressed', value) }
  }
}
