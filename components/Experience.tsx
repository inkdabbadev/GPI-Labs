'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const PlazaScene = dynamic(() => import('./PlazaScene'), { ssr: false });

const PHASE_SECONDS = 10;
const phases = [
  { name: 'Art', title: 'It begins with a form.', line: 'A landmark that gives a place its identity.' },
  { name: 'Light', title: 'Then the place comes alive.', line: 'Light that changes how it feels after dark.' },
  { name: 'Technology', title: 'And the place responds.', line: 'Holography and AR turn every visitor into a participant.' }
];

export default function Experience() {
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    // Shareable links such as /?phase=light open on a chosen act.
    const requested = new URLSearchParams(location.search).get('phase')?.toLowerCase();
    const index = phases.findIndex(p => p.name.toLowerCase() === requested);
    if (index >= 0) setPhase(index);
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    if (query.matches) setPlaying(false);
    const change = () => { if (query.matches) setPlaying(false); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  // Auto-advance through Art → Light → Technology while playing.
  useEffect(() => {
    if (!playing || sceneState === 'loading') return;
    const id = setTimeout(() => setPhase(p => (p + 1) % phases.length), PHASE_SECONDS * 1000);
    return () => clearTimeout(id);
  }, [phase, playing, sceneState]);

  // Fall back to the static mark if the scene is slow to start.
  useEffect(() => {
    const id = setTimeout(() => setSceneState(s => (s === 'loading' ? 'failed' : s)), 12000);
    return () => clearTimeout(id);
  }, []);

  const onReady = useCallback(() => setSceneState('ready'), []);
  const onFail = useCallback(() => setSceneState('failed'), []);
  const choose = (index: number) => { setPhase(index); setPlaying(false); };

  return (
    <div className={`site phase-${phase} scene-${sceneState} ${playing ? 'is-playing' : 'is-paused'}`} style={{ '--phase-duration': `${PHASE_SECONDS}s` } as React.CSSProperties}>
      <div className="stage" aria-hidden="true">
        {sceneState !== 'failed' && <PlazaScene phase={phase} playing={playing} onReady={onReady} onFail={onFail} />}
        <div className="fallback"><img src="/logo-mark.png" alt="" /></div>
        <div className="shade" />
      </div>

      <header className="top">
        <img className="brand" src="/logo-mark.png" alt="GI Lab" width={640} height={542} />
      </header>

      <main className="hero">
        <h1>
          {phases.map((p, i) => (
            <span key={p.name}>
              <span className={`word ${i === phase ? 'is-active' : ''}`} style={{ '--i': i } as React.CSSProperties}>{p.name}.</span>
              {i === 1 ? <br /> : ' '}
            </span>
          ))}
        </h1>
        <p className="lead">A new experience is taking shape.</p>

        <p className="soon">Coming soon</p>

        <div className="detail">
          {phases.map((p, i) => (
            <div key={p.name} className={`detail-item ${i === phase ? 'is-active' : ''}`} aria-hidden={i !== phase}>
              <p className="detail-title">{p.title}</p>
              <p className="detail-line">{p.line}</p>
            </div>
          ))}
        </div>

        <div className="controls">
          <div className="phases" role="group" aria-label="Choose what the plaza shows">
            {phases.map((p, i) => (
              <button key={p.name} className={i === phase ? 'is-active' : ''} aria-pressed={i === phase} onClick={() => choose(i)}>
                <span className="phase-index">0{i + 1}</span>
                <span className="phase-name">{p.name}</span>
                <span className="phase-track"><span className="phase-fill" key={`${phase}-${playing}`} /></span>
              </button>
            ))}
          </div>
          <button className="play" onClick={() => setPlaying(v => !v)} aria-label={playing ? 'Pause the scene' : 'Play the scene'} title={playing ? 'Pause' : 'Play'}>
            <span className="play-icon" aria-hidden="true" />
          </button>
        </div>
      </main>

      <footer className="bottom">
        <p className="motto">Transforming Spaces. Inspiring People.</p>
        <p className="domain">GILab.works</p>
      </footer>
    </div>
  );
}
