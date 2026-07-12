# Creating Modules

Modules are simple folders inside the `modules/` directory. Each module needs a `manifest.json` file.

## Minimal module structure

```text
modules/my-module/
├── manifest.json
├── view.html
├── style.css
└── main.js
```

## manifest.json

```json
{
  "name": "My Module",
  "version": "1.0.0",
  "description": "Short description",
  "author": "Your Name",
  "view": "view.html",
  "style": "style.css",
  "main": "main.js"
}
```

## view.html

Plain HTML that becomes the module content.

```html
<div class="my-value">0</div>
```

## style.css

Optional CSS scoped to your module.

```css
.my-value {
  font-size: 2rem;
}
```

## main.js

Optional JavaScript module. Export a default function that receives an object with `id`, `container`, `config`, and `bus`.

```javascript
export default function ({ container, config, bus }) {
  const valueEl = container.querySelector('.my-value');

  bus.addEventListener('push:my-module', event => {
    valueEl.textContent = event.detail.value;
  });
}
```

## Page lifecycle

If your module uses timers, animations, or other running processes, return an object with `pause` and `resume` methods. The mirror calls these when a page is hidden or shown during rotation.

```javascript
export default function ({ container }) {
  let interval = setInterval(() => {
    container.textContent = new Date().toLocaleTimeString();
  }, 1000);

  return {
    pause() {
      clearInterval(interval);
      interval = null;
    },
    resume() {
      if (!interval) {
        interval = setInterval(() => {
          container.textContent = new Date().toLocaleTimeString();
        }, 1000);
      }
    }
  };
}
```

## Placement

OpenMirror uses a coordinate-based grid with support for multiple pages. Open `http://localhost:3000/setup.html` to drag and resize modules visually, or edit `config/config.json` directly.

Example config:

```json
{
  "grid": {
    "columns": 12,
    "rows": 8
  },
  "rotation": {
    "enabled": true,
    "interval": 10
  },
  "pages": [
    {
      "name": "Main",
      "modules": {
        "my-module": {
          "x": 0,
          "y": 0,
          "width": 4,
          "height": 2,
          "config": {
            "title": "Hello"
          }
        }
      }
    }
  ]
}
```

Values:

- `x` and `y`: top-left position on the grid, starting from 0
- `width` and `height`: size in grid cells
- `config`: custom settings for the module
- `rotation.interval`: seconds between page switches

The grid defaults to 12 columns and 8 rows, but you can change this in the config.

## Receiving third-party data

Any module can receive data from external services through the push API. Listen for `push:YOUR_MODULE_ID` events on the bus.

## Module configuration

Modules can expose a `configSchema` in their `manifest.json`. The setup dashboard uses this schema to render a configuration popup when you click the gear icon on a placed module.

Example `manifest.json`:

```json
{
  "name": "My Module",
  "configSchema": {
    "title": {
      "type": "text",
      "label": "Title",
      "default": ""
    },
    "count": {
      "type": "number",
      "label": "Count",
      "default": 5
    }
  }
}
```

Supported field types:

- `text`: single-line input
- `number`: numeric input
- `textarea`: multi-line input
- `select`: dropdown with `options`
- `checkbox`: boolean toggle
- `file`: file upload

The values are passed to the module as `config` in `main.js`.

## Alignment

Every built-in module exposes an `align` config option that controls whether its content is left, center or right aligned. The default matches the module's original design so existing layouts stay unchanged.

```json
{
  "align": "left"
}
```

Supported values: `left`, `center`, `right`.

Modules that only contain text inherit alignment automatically. Modules that use a flex layout (clock, countdown, RSS slide mode, etc.) read the CSS variables `--module-align` and `--module-align-flex` to honor the setting. When building a custom module, use these variables if you want alignment to work out of the box:

```css
.my-module {
  text-align: var(--module-align, left);
  align-items: var(--module-align-flex, flex-start);
}
```

## Multiple instances of the same module

To show the same module more than once (for example two weather modules for different cities, or two clocks for different countries), duplicate the module folder and give it a new ID.

You can do this in the setup dashboard:

1. Find the module in the **Available Modules** list.
2. Click the **+** button next to it.
3. Enter a new ID like `weather-berlin` or `clock-newyork`.
4. Drag the new module onto the grid.
5. Click the gear icon to configure it.

Or manually on the Pi / server:

```bash
cp -r modules/weather modules/weather-berlin
```

Then add `weather-berlin` to your config and set its `location`.

## Built-in modules

### Clock

Simple digital clock with date. Copy the `modules/clock/` folder, rename it (for example `modules/clock-newyork/`), and add it to your config to show multiple clocks.

Config options:

```json
{
  "title": "New York",
  "timezone": "America/New_York",
  "align": "center"
}
```

- `title`: small header shown above the time (e.g. "Time New York", "Time China")
- `timezone`: any IANA time zone such as `America/New_York`, `Asia/Shanghai`, `Europe/Berlin`. Uses the mirror's local time if omitted.
- `align`: `left`, `center` or `right` (default `center`)

### Weather

Shows current weather for a location. Uses the server-side `/api/weather` endpoint.

```json
{
  "location": "Berlin",
  "align": "left"
}
```

- `location`: city name
- `align`: `left`, `center` or `right` (default `left`)

### Calendar

Shows upcoming events from any public ICS calendar link (Google Calendar, Nextcloud, etc.). Uses the server-side `/api/calendar` endpoint.

Copy the `modules/calendar/` folder and rename it for each calendar you want to show (for example `modules/calendar-timo/` or `modules/calendar-uwe/`).

Config options:

```json
{
  "title": "Kalender Timo",
  "icsUrl": "https://calendar.google.com/calendar/ical/.../basic.ics",
  "maxEvents": 8,
  "refreshInterval": 5
}
```

- `title`: small header shown above the list
- `icsUrl`: public ICS link
- `maxEvents`: how many events to show (default 10)
- `refreshInterval`: how often to refresh, in minutes (default 5)

Google Calendar ICS link: open the calendar settings, scroll to "Integrate calendar", and copy the "Public address in iCal format" URL.

### News / RSS

Displays headlines from any RSS or Atom feed.

Config options:

```json
{
  "title": "News",
  "url": "https://news.ycombinator.com/rss",
  "displayMode": "list",
  "showSnippet": true,
  "snippetLength": 120,
  "snippetLines": 1,
  "slideInterval": 10,
  "maxItems": 6,
  "refreshInterval": 10,
  "showDate": true,
  "fontScale": 1,
  "align": "left"
}
```

- `displayMode`: `list` shows several headlines, `slide` shows one entry at a time
- `showSnippet`: show a short description in list mode
- `snippetLength`: max characters of the description before truncating
- `snippetLines`: how many snippet lines to show in list mode (`0`, `1` or `2`)
- `showDate`: show the publish date
- `fontScale`: scale all RSS text up or down
- `align`: `left`, `center` or `right`
