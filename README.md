# LZ Callsign Tool

Web application for checking available Bulgarian amateur radio callsigns (LZ prefix). Built with React, Vite, and Tailwind CSS.

## Features

- Search for available callsigns by suffix pattern (1-3 characters)
- Region-based digit filtering (South: 1,3,5,7,9 | North: 2,4,6,8)
- Click-to-copy functionality for available callsigns
- Real-time debounced search
- Dark theme with responsive design

## Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Icons**: Bootstrap Icons
- **Data**: JSON-based static dataset

## Project Structure

```
├── src/
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind directives + custom styles
├── public/
│   └── data/
│       └── callsigns.json    # Generated callsign database
├── scripts/
│   └── sync.mjs         # Sync script (fetches from Oracle APEX)
├── .github/
│   └── workflows/
│       └── sync-and-deploy.yml  # Daily sync + deploy to GitHub Pages
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Sync data from Oracle APEX:
   ```bash
   npm run sync
   ```
   This fetches the latest callsign data from the external Oracle APEX system and generates `public/data/callsigns.json`.

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser.

## Production Build

```bash
npm run build
```

The built files will be in the `dist/` directory.

## GitHub Actions Automation

The repository includes a GitHub Actions workflow that:

1. **Runs daily at 2 AM UTC** (via cron schedule)
2. Syncs the latest callsign data from Oracle APEX
3. Builds the static site
4. Deploys to GitHub Pages

The workflow can also be triggered manually via the "Workflow Dispatch" option in the GitHub Actions tab.

## How Data Sync Works

1. The sync script (`scripts/sync.mjs`) fetches the Oracle APEX page to obtain a session ID
2. Downloads the HTML export of the callsign table
3. Parses the table using Cheerio (server-side DOM parsing)
4. Deduplicates and normalizes the data
5. Outputs a JSON file to `public/data/callsigns.json`

**Important**: The sync script requires internet access to `http://91.132.60.93:8080/ords/`.

## Data Format

The `callsigns.json` file contains an array of objects:

```json
[
  {
    "callsign": "LZ1ABC",
    "type": " TYPE ",
    "class": " CLASS ",
    "responsible": "Name",
    "club_name": "Club",
    "address": "Address"
  }
]
```

The UI code loads this JSON, creates a Set for O(1) lookup, and generates all possible callsign combinations based on user input to determine which ones are available.

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge).

## License

Copyright © 2026. All rights reserved.
