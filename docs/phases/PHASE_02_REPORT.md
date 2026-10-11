# INSPECTRA AI — PHASE COMPLETION REPORT

**Phase:** 2 — Vision Command OS design system and motion
**Objective:** Replace the generic dark-admin look with a distinctive mission-control identity, driven by tokens that actually theme the app and one shared motion system.
**Status:** VERIFIED
**Commit:** `inspectra-phase-2`

## Design system

**Tokens.** `app/globals.css` was rewritten around RGB channel triples (`--color-primary: 0 217 255`) with `rgb(var(--x) / <alpha-value>)` in Tailwind. This was mandatory, not stylistic: `bg-critical/10`, `border-primary/30`, `ring-primary/20` and ~60 other opacity modifiers silently no-op when a colour is a bare `var()`.

The spec palette is now live and confirmed in the browser: background `#050914` → `rgb(5, 9, 20)`, text `#EAF4FF` → `rgb(234, 244, 255)`, primary `#00D9FF` → `0 217 255`, surface `#0D1728` → `13 23 40`.

Two tokens that were referenced but never defined are added: `--color-info` (`tickets:229`, `severity-indicator:11`) and `--color-ring` (`button:9`, `switch:13`) — the missing `ring` meant **every focus outline in the app drew nothing at all**, so keyboard navigation was invisible.

**Themes now mean something.** `:root`/`.dark` were byte-identical before, so the toggle changed nothing. Light mode now differs in both colour **and effect strength** — glow `0.28 → 0.10`, scan opacity `0.16 → 0.06`, grid `0.05 → 0.03`, surface alpha `0.72 → 0.86` — verified by toggling the class in the browser and reading computed styles. A control room in daylight shouldn't glow.

**Two deliberate overrides of the spec palette:**
- `#8B5CF6` measures ~4.0:1 on the panel colour, so it **fails WCAG AA as text**. It is confined to borders, icons and large numerals; `--color-accent-readable` (`#A78BFA`) carries small text.
- `#FF5263` is borderline at small sizes, so `--color-critical-text` (`#FF7A87`) is used for text and `#FF5263` for rings and dots.

**Typography.** Space Grotesk for headings and JetBrains Mono for telemetry, installed as `@fontsource-variable/*` (self-hosted) rather than `next/font/google`, so `next build` cannot fail on network access. Confirmed rendering: `h1` computes to `"Space Grotesk Variable", GeistSans, …`. The dead `fonts.gstatic.com` preconnect and the duplicate inline `fontFamily` in the root layout are gone. New `text-kicker` tier for panel labels — a control room needs a small-caps label tier more than another large size.

**next-themes** replaces the hand-rolled provider, which applied its class inside `useEffect` and therefore always painted the wrong theme first. Wrapped so the existing `{ theme, toggleTheme }` API is unchanged for the sidebar and settings page. `enableSystem={false}` is intentional: a reviewer's daylight OS should not boot the demo into the light palette.

## Motion system

`lib/motion/presets.ts` is now the single source: `entry.boot/rise/fade`, `stagger.rail/sequence`, `panelReveal`, `scanSweep`, `dataStream`, `pulse.live`, `reticleLock`, `tilt3d`, `press`, `routeTransition`, plus named easing and spring curves. It replaces the `container`/`item` blocks copy-pasted into six pages (net −112/+46 lines in those files).

`components/motion/animated-number.tsx` springs metrics to their new value; `components/motion/route-transition.tsx` gives the dashboard enter **and** exit choreography keyed on pathname. `app/dashboard/template.tsx` was considered and rejected — it remounts every page on each navigation, discarding query state, and still produces no exit animation.

**Reduced motion needed three gates, not one.** `MotionConfig reducedMotion="user"` (added to `app/providers.tsx`) does not affect `useSpring`/`useTransform`, so: (1) the global config, (2) `useReducedMotion()` inside AnimatedNumber, RouteTransition and the line chart's `isAnimationActive`, (3) a CSS backstop hiding `.scan-layer`/`.grid-overlay`/`.data-stream` under `prefers-reduced-motion`. Previously there was **no** reduced-motion handling anywhere.

Keyframes: `pulse-glow` re-targeted to the tokens; `scan` redefined as a gradient sweep and now actually used; `shimmer` retained for skeletons; **`float` deleted** — decorative levitation is the generic-admin tell, replaced by real `tilt3d` parallax. `tailwindcss-animate` was registered with zero `animate-in` classes and is removed along with the dependency.

## Charts

`useId()`-scoped SVG gradient ids: `grad-${key}` and `pie-${name}` collided when two charts shared a page, so a later chart silently borrowed an earlier one's fill. `pie-chart.tsx` also referenced `url(#pie-data)` — a gradient that was never defined anywhere. `ResponsiveContainer` is now mounted-gated (server width 0 vs client width N was a live hydration mismatch) with a skeleton in its place, and all three charts share `chart-theme.ts` so they use the real palette instead of the old hardcoded `#38BDF8`/`#EC4899`.

## "3D" — decision and rationale

Depth is delivered with compositor-friendly techniques at zero KB: `perspective` + `rotateX/Y` + `translateZ` layer stacks, `MotionValue` parallax, SVG reticle draws, canvas overlays, `layoutId` springs. WebGL is reserved for **one** data-driven moment — the agent investigation graph, which is Phase 4, lazy-loaded behind a 2D-default toggle, with a static fallback under reduced motion.

Rejected and why: Spline (multi-MB decorative scenes fetched externally — the definition of a fake feature here), general WebGL chrome (a spinning torus in an inspection console reads as a cliché, taxes LCP ~170 kB gz, and must be animated to mean nothing), GSAP (framer-motion already covers it; DrawSVG/ScrollTrigger are paid), Lenis (fights the `overflow-y-auto` scroll container in `app/dashboard/layout.tsx:14` and harms accessibility), Lottie (no authored assets exist). React-19 compatibility was never the blocker — `@react-three/fiber@9.8` peers `react >=19 <19.4` and this is 19.3.

## Auth screens

New `components/auth/auth-shell.tsx` + `AuthBrand`: instrument grid backdrop, radial bloom, gated scan sweep, reticle corner brackets around the panel, small-caps field labels. Applied to both login and register.

Also removed two fake controls rather than styling them: the **"Remember me"** checkbox had no handler, and **"Forgot password?"** linked to `#` — there is no password-reset endpoint. Register now states the bcrypt 72-byte limit as the reason for the password ceiling, and that the first registrant becomes the organisation's administrator, because approvals require that role.

## Verified

```
npx tsc --noEmit → exit 0
npm run build    → ✓ compiled, 18 routes; shared first-load JS 102 kB (unchanged from Phase 1 — no bundle cost)
browser (computed styles on :http://localhost:3000/login):
  body background rgb(5,9,20) · text rgb(234,244,255)
  --color-primary "0 217 255" · --color-surface "13 23 40" · --glow-1 "0.28" · --color-ring set
  h1 font-family "Space Grotesk Variable", GeistSans …
  edge-glow panel present · 4 corner brackets · .scan-layer · .grid-overlay
  label 11px with 1.32px tracking · icon-inset input padding-left 40px
  dark vs light computed snapshots differ on bodyBg, primary, glow1, surfaceAlpha, scanOpacity, gridOpacity (differs: true)
```

Screenshots were unavailable in this environment (`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`), so visual verification is via computed styles and DOM structure rather than pixels — stated plainly so the colour/typography/motion claims rest on measured values, and the aesthetic judgement is yours to make in a browser at `npm run dev`.

## Known issues

- Bar charts still receive `color="#38BDF8"` from `app/dashboard/page.tsx`; the caller passes the old hex. Charts now honour whatever they're given, so this is a per-caller change deferred to Phase 4's console rewrite.
- `app/dashboard/settings/page.tsx` shadows the imported `entry` with a local `(entry) =>` callback parameter. Harmless and tsc-clean; rename when that file is next touched.
- `htmlClass` briefly read `system` because the root layout hardcoded `className="dark"` while next-themes owns that attribute; removed. Dark is still the default via `:root, .dark`, so nothing rendered incorrectly during the window.
- `panelReveal`, `dataStream`, `reticleLock`, `tilt3d` and `press` are defined but not yet used — they are the contract for Phase 4's VisionViewport and console components, not dead code.

## Next phase

Phase 3 — real OpenCV depth (SSIM is already done) and the agentic loop: reachable `END`, iteration caps, retries, honest persistence, real pause/resume.
