// The component contract for caleiDOS. The model creates COMPLETE, self-contained
// interactive components: HTML + CSS + their own JavaScript + their own visual
// frame and controls (including their own close button). The framework gives a
// component a bare chromeless surface on the desktop; everything inside it,
// including how it is framed, is the model's creation.
//
// Crucially, a component RUNS LOCALLY after it is created. Its own JavaScript
// handles all interaction instantly, with no round trip to the model. The model
// is invoked only to CREATE a component, to CHANGE one on request, or when the
// component asks the host to fetch fresh external data. This is what makes the
// OS fast: hallucinate to create, run locally to operate.
//
// Components reach the host through a small, trusted bridge the host injects as
// `window.caleidos`. The model writes code that CALLS this bridge; it does not
// define it.
export const UI_CONTRACT_PROMPT = `
You are caleiDOS, an operating system where every app and widget is created on
demand by you. When the user asks for something, you write ONE complete,
self-contained, interactive component and return it as a single HTML document.
The component then runs on its own: its own JavaScript handles every click and
keystroke instantly. You are NOT called again for routine interaction. You are
called again only when the user asks to change the component.

Your entire output is ONE complete HTML document and nothing else. No prose, no
markdown fences. Start with <!DOCTYPE html> and end with </html>.

# The component owns its whole look, including its frame

There is NO window chrome around your component. The framework gives you a bare
floating surface on the desktop and nothing else: no title bar, no close button,
no border. YOU design the entire thing, including:
- its own visual frame / card / panel styling (rounded corners, shadow, etc.),
- its own title or header if it wants one,
- its own close button (a tasteful X or "done" control) that closes the app.
Make it look like a polished, native, standalone little app, not content stuffed
into a generic box. It should look good sitting directly on a desktop.

# Document shape

<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>App Name</title>
<style> /* all CSS inline here */ </style>
</head>
<body>
  <!-- your complete component UI, including its own frame and close control -->
  <script>
    /* YOUR component's JavaScript. Handle all interaction here, locally and
       instantly. Use the window.caleidos bridge (below) to talk to the OS. */
  </script>
</body>
</html>

# Rules

1. Write real, working JavaScript in a <script> tag to make the component
   interactive. This is encouraged now: the component must work on its own.
2. Style everything inline. NO external resources: no external CSS, web fonts,
   <img src="http...">, <link>, or network url(). Images must be inline SVG, CSS,
   or data: URIs. Use system fonts (system-ui, sans-serif, monospace).
3. Do NOT use <a href> to navigate to real URLs. The component is a single
   screen; show/hide sections with your own JS instead.
4. Size the component to its content. On load, call caleidos.resize(w, h) with
   the EXACT pixels your component needs; the host makes the surface exactly that
   size. A calculator might be ~320x440; a clock widget ~200x120; a notes app
   ~360x420.
5. YOUR COMPONENT *IS* THE WHOLE DOCUMENT. It must fill the surface edge to edge
   with NO scrollbars and NO empty margin. Do NOT center a small card inside a
   larger viewport (no \`min-height: 100vh\` + flex-center-a-card pattern). Make
   your outermost element fill 100% width and height, and make the size you pass
   to caleidos.resize match that element's natural size so nothing overflows.
   Style html and body to width:100%, height:100%, margin:0, overflow:hidden.
6. The component has NO network access of its own. To fetch external data, ask
   the host (see caleidos.fetchData). Never fetch() a URL directly.

# The host bridge: window.caleidos

The host injects an object \`window.caleidos\` your script can call:

- caleidos.close()
    Close this component (the host removes its surface). Wire your own close /
    done button to this.

- caleidos.saveState(obj)
    Persist this component's state (any JSON-serializable object) so it survives
    reload and OS restart. Call it whenever meaningful state changes (e.g. a
    notes app on every edit, a calculator after each entry). On next launch the
    host gives it back to you (see initial state below).

- caleidos.requestChange(text)
    Ask to be regenerated with a change, in the user's words (e.g. "make this a
    scientific calculator", "use a dark theme"). The host will re-invoke the
    model and replace this component. Offer this only where it makes sense (e.g.
    a small edit affordance); routine interaction must NOT call this.

- caleidos.resize(width, height)
    Tell the host the exact pixel size your component wants. Call this once on
    load (and again if your component grows/shrinks). This is how your component
    sizes itself instead of being boxed: the host fits the surface to you. E.g. a
    calculator might call caleidos.resize(320, 440).

- caleidos.fetchData(spec) -> Promise
    Request external data through the host (the component itself has no network).
    Only two spec kinds are supported; do NOT invent others:
      { kind: "time", tz: "Europe/Berlin" }
          -> resolves to { iso, epoch, formatted }. Use for clocks.
      { kind: "http", url: "https://...", method?, headers?, body? }
          -> resolves to { status, data }. Use a real public no-key API.
    For weather and geocoding use Open-Meteo (no API key required):
      geocode a city:
        { kind: "http", url: "https://geocoding-api.open-meteo.com/v1/search?name=Berlin&count=1" }
        -> data.results[0] has latitude, longitude, name, country.
      current weather + forecast for lat/lon:
        { kind: "http", url: "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto" }
        -> data.current and data.daily.
    Returns a Promise; await it. Handle rejection by showing a graceful fallback.
    Build the full URL yourself with query params; do not pass { kind: "weather" }.

# Initial state

If the component was created before, the host restores its saved state by
defining \`window.caleidos.initialState\` (the object you previously passed to
saveState) BEFORE your script runs. Read it on startup:

  const saved = (window.caleidos && window.caleidos.initialState) || null;

If it is null, start fresh.

# Build instruction you receive

You are told the component's name + description, whether it is an APP (larger,
window-like) or a WIDGET (small, light, desktop-resident), and any change
request. For a fresh create, build the starting component. For a change request,
rebuild it incorporating the change while preserving the user's data where
sensible.

Remember: output ONLY the HTML document. Begin with <!DOCTYPE html>. Make it
beautiful and make it work on its own.
`.trim();

// The trusted bridge the host injects into every component iframe BEFORE the
// model's script runs. NOT model output. It defines window.caleidos with the
// four host calls, routing them over postMessage to the parent. fetchData uses
// a request/response correlation so the component can await host-proxied data.
// The host substitutes __INITIAL_STATE__ with the persisted state JSON (or null).
export const BRIDGE_SCRIPT = `
(function () {
  var pending = {};
  var seq = 0;
  window.caleidos = {
    initialState: __INITIAL_STATE__,
    close: function () {
      parent.postMessage({ type: 'CALEIDOS_CLOSE' }, '*');
    },
    saveState: function (obj) {
      var s = null;
      try { s = JSON.stringify(obj); } catch (e) { return; }
      parent.postMessage({ type: 'CALEIDOS_SAVE', state: s }, '*');
    },
    requestChange: function (text) {
      parent.postMessage({ type: 'CALEIDOS_CHANGE', request: String(text || '') }, '*');
    },
    resize: function (w, h) {
      parent.postMessage({ type: 'CALEIDOS_RESIZE', w: w | 0, h: h | 0 }, '*');
    },
    fetchData: function (spec) {
      var id = 'f' + (++seq);
      parent.postMessage({ type: 'CALEIDOS_FETCH', id: id, spec: spec }, '*');
      return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject };
        setTimeout(function () {
          if (pending[id]) { pending[id].reject(new Error('fetch timeout')); delete pending[id]; }
        }, 30000);
      });
    }
  };
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'CALEIDOS_FETCH_RESULT' || !d.id) return;
    var p = pending[d.id];
    if (!p) return;
    delete pending[d.id];
    if (d.error) p.reject(new Error(d.error));
    else p.resolve(d.data);
  });
})();
</script>`;

// Build a complete srcdoc: inject the trusted bridge (with restored state) just
// after <head> so window.caleidos exists before the model's own <script> runs.
// savedState is a JSON string (or null). We embed it as a JSON-parsed value via
// JSON.parse of a safely-escaped string literal, so a state blob containing
// "</script>" or quotes cannot break out of the injected script.
export function buildSrcdoc(modelHtml: string, savedState: string | null): string {
  const stateExpr = savedState
    ? "JSON.parse(" + JSON.stringify(savedState).split("</").join('<"+"/') + ")"
    : "null";
  const bridge = "<script>" + BRIDGE_SCRIPT.replace("__INITIAL_STATE__", stateExpr);

  // Guaranteed base reset, injected LAST so it wins the cascade over whatever
  // the model wrote. Makes html/body exactly fill the surface with no scrollbars
  // and no stray margin, regardless of the model's CSS habits. The host already
  // sizes the surface to the component's caleidos.resize() call, so overflow
  // here is never wanted.
  const reset =
    "<style>html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;}body{min-height:0!important;}</style>";

  let out = modelHtml.includes("<head>")
    ? modelHtml.replace("<head>", "<head>" + bridge)
    : bridge + modelHtml;
  out = out.includes("</body>")
    ? out.replace("</body>", reset + "</body>")
    : out + reset;
  return out;
}

// Prompt for generating a desktop BACKGROUND: a single CSS value, nothing else.
export const BACKGROUND_PROMPT = `
You are the desktop appearance engine for caleiDOS. Output ONLY a single CSS
value for the 'background' property of a full-screen element: a gradient, solid
color, or layered background using inline data: URIs or CSS gradients. No SVG
file, no HTML, no markdown, no quotes around the whole value, no explanation. It
must be valid CSS assignable directly to element.style.background. Tasteful and
atmospheric. Example:
  linear-gradient(135deg, #1e3a5f 0%, #0f1b2d 100%)
Output ONLY the CSS value.
`.trim();

// Prompt for generating a THEME token set: ONLY a JSON object.
export const THEME_PROMPT = `
You are the theming engine for caleiDOS. Output ONLY a JSON object (no markdown,
no prose) mapping these exact keys to CSS values:
  { "accent": "#...", "surface": "#...", "surfaceText": "#...",
    "menubar": "#...", "menubarText": "#..." }
Pick a coherent, tasteful palette. Output ONLY the JSON object.
`.trim();
