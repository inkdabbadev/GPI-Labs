# GILab: Art. Light. Technology.

Coming-soon landing page for GILab: one screen with a single contact invitation and no forms. Next.js (App Router), React, TypeScript and Three.js.

## Run

```sh
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run check:logo
npm run build && npm start
```

Root `index.html`, `script.js` and `style.css` are left over from the earlier static version. Next.js does not use them.

## The experience

The page is built around one real-time scene: a public plaza at the edge of a city, where the GILab logo stands as a monumental sculpture. The three words of the headline are three acts, and the plaza changes with each one:

| Act | What the plaza shows |
| --- | --- |
| **Art** | Dusk. The sculpture as a landmark: true brand gradient on the face, brushed stainless sides, warm sky glow behind the skyline. |
| **Light** | Night. Uplights, LED-lined terraces, light beams, lit city windows and warm motes in the air. |
| **Technology** | A hologram of the sculpture builds up from the plinth: fresnel edges, travelling scanlines, a rising scan band, brief glitch slices, a light volume from the projector ring, dashed interface rings, comet orbits in the brand colours and an AR grid on the floor. |

The acts advance every 10 seconds. Visitors can choose an act, pause the scene and drag to turn the sculpture. `/?phase=art`, `/?phase=light` and `/?phase=technology` open directly on an act.

### Corrections over the client reference videos

- The sculpture uses the **original logo artwork and colours**, not a single gold material.
- The **"i" dot floats freely**, held by a column of light. It has no support rod.
- The back of the sculpture is plain brushed metal, so the logo **never appears mirrored**. Rotation is limited so the mark never turns edge-on.
- A minimal layout: headline, a "Coming soon" line with a light sweep, one supporting line per act and the act selector with a play/pause control. **No microtext**: the smallest text is 14px, and the footer is 15px.
- The logo appears in the header on every view.

### Story

The three acts play as one story, each with its own camera shot and a short sequence on its own clock:

1. **Art: "It begins with imagination."** Dusk. The sculpture stands alone.
2. **Light: "Light brings it to life."** Light runs around the plinth rings, then the steps ignite from front to back. A spotlight sweeps the face, beams sway, and pulses chase along the steps. The camera moves lower and closer.
3. **Technology: "Technology invites participation."** A scan wave rolls out across the floor and the plinth rings turn blue. The sculpture dissolves from the top down into a swirling cloud of points in its own colours, then the points stream back and it re-forms from the bottom up, with a glowing outline leading the build. Data streams fly in from the city, and the hologram settles over the finished work.

### Motion

- A 6.5-second cinematic arrival on the wall clock, so it takes the same time on slow devices. The scene fades up first, then the camera settles.
- Act changes are eased tweens (2.6s) from the current look, so a change made mid-transition stays smooth.
- Pause and play ease the scene's clock in and out instead of freezing it.
- Drag has momentum, rubber-band limits and a soft spring back to the idle pose. Mouse parallax is smoothed.
- The sculpture drifts on two unrelated slow waves, and the camera breathes slightly.
- The headline enters word by word, and each act's line crossfades in place.

### Details

- Wet stone floor with live reflections, bloom, ACES tone mapping and a custom night reflection environment for the metal.
- A clamp pass keeps HDR values finite before bloom, so specular spikes cannot flood the screen on any GPU.
- Framing adapts: the sculpture sits to the right of the copy on landscape screens and above the copy on portrait screens.
- Renders only while visible. When paused it renders only when something changes. Pixel ratio, particle counts, reflections and shadows scale down on small or low-core devices.
- Respects `prefers-reduced-motion`: no intro move and no auto-advance.
- If WebGL is unavailable or slow to start, a static branded fallback is shown within 12 seconds.

## Structure

- `app/layout.tsx`: document, font (Plus Jakarta Sans), metadata and viewport.
- `next.config.ts`: hides the development badge, which would otherwise sit over the footer.
- `app/page.tsx`: route.
- `app/icon.png`: favicon.
- `components/Experience.tsx`: copy, acts, controls, intro and fallback.
- `components/PlazaScene.tsx`: the Three.js plaza, lighting looks per act, holographic layer and post-processing.
- `lib/logoGeometry.mjs`: extrudes the traced logo, maps UVs to the original artwork and separates the front and back faces. Shared by the scene and the check script.
- `app/globals.css`: layout, typography, responsive rules and reduced-motion rules.

## Assets

- `public/logo_transparent.png`: byte-identical copy of the supplied logo. `npm run check:logo` verifies this.
- `public/logo-shape.json`: alpha contour of the logo (`python scripts/trace_logo.py`).
- `public/textures/logo-face.png`, `public/logo-mark.png` and `app/icon.png`: derived with `python scripts/prepare_assets.py` (requires OpenCV). The face texture is 2048px wide so it fits mobile GPU texture limits.

## Contact link

"Discuss a project" opens `CONTACT_HREF` in `components/Experience.tsx`. Add the studio's email after `mailto:`, or replace it with a contact page URL.

## Liquid glass layer

- Headline letters are glass: a white glass fill with a refraction line, the act's colours fading in on the active word, and a slow specular highlight gliding across.
- The act copy and the studio invitation sit on a frosted glass panel with a rim light and a pointer-following highlight. The act selector is a glass pill bar whose liquid indicator springs to the active act and shows its progress; the play control is a glass pill and the CTA is tinted glass.
- In Chromium browsers the glass also refracts the scene through an SVG displacement filter (`#liquid-glass`); other browsers keep the frosted glass.
- The 3D logo wears a liquid-glass casing in every act: the logo's own outline bevelled outward (`glassParts` in `lib/logoGeometry.mjs`), with real refraction, a faint iridescent sheen and a slow ripple. It dissolves and rebuilds with the logo in the Technology act, and `npm run check:logo` verifies it wraps the logo evenly.
