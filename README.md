IOS 26.2 friendly (user userscipts or stay from app store)
https://github.com/DevSkits916/Userscipt/blob/main/Exported%20csv.png

# Facebook Groups Scraper Userscript
(Violates Facebook TOS but works and they cant tell)
A userscript that scans Facebook group pages and exports group data to CSV so you can stop manually copying URLs like it’s 2009.

Designed for bulk group collection, filtering, and later automation workflows.

## What This Script Does

- Scans Facebook group listings
- Extracts group names and URLs
- Exports results to a CSV file
- Removes repetitive, manual work from group discovery
- Plays nicely with downstream automation tools
such as https://paste-tmko.onrender.com

If you deal with Facebook groups at scale, this saves time and wrist cartilage.

## Supported Platforms (Important Reality Check)

### Greasemonkey (Official Support)
- **Firefox on Desktop (Windows / macOS / Linux)**

This is the only platform where Greasemonkey is officially supported and reliable.

### Other Browsers (Alternative Managers)
- **Chrome / Edge / Brave** → Tampermonkey
- **Safari (macOS)** → Tampermonkey or Userscripts extension

### Mobile Devices
- **iOS Safari**: No native Greasemonkey support  
  (Userscripts are limited and inconsistent on iOS)
- **Android**: Possible using Firefox + add-ons, but not officially recommended

If you want stability, use desktop Firefox.

## Installation Instructions

### Firefox (Windows / macOS / Linux) – Greasemonkey

1. Install **Firefox**  
   https://www.mozilla.org/firefox/

2. Install **Greasemonkey**:
   - Open Firefox
   - Go to `about:addons`
   - Search for **Greasemonkey**
   - Click **Add to Firefox**

3. Install the userscript:
   - Open the raw userscript file:
     ```
     https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/FB%20groups%20Scraper.user.js
     ```
   - Greasemonkey will open an install page
   - Click **Install**

4. Visit a Facebook groups page covered by the script’s `@match`
   - The script runs automatically when conditions are met

### Chrome / Edge / Brave (Tampermonkey)

1. Install **Tampermonkey** from the browser extension store
2. Open the raw `.user.js` file
3. Click **Install**
4. Navigate to the supported Facebook page

### Safari (macOS)

1. Install **Tampermonkey for Safari** or **Userscripts**
2. Enable extension permissions
3. Open the raw `.user.js` file
4. Install and refresh the page

## Usage

1. Navigate to a Facebook groups listing or discovery page
2. Let the page fully load
3. Trigger the scraper (automatic or UI-based, depending on script version)
4. Export the collected data to CSV
5. Use the CSV however you want:
   - Sorting
   - Filtering
   - Automation
   - Mass posting workflows

## Output

- CSV file containing:
  - Group name
  - Group URL
  - (Additional fields if enabled in the script)

## Troubleshooting

- **Nothing happens**
  - Confirm you are on a page that matches the script’s `@match`
  - Reload the page after installing
- **CSV is empty**
  - Scroll the page so groups fully load
- **Facebook layout changed**
  - Selectors may need updating (welcome to Facebook)

## Notes

- This script only runs on Facebook pages specified in the `@match`
- No data is sent anywhere external
- Everything runs locally in your browser

## License

MIT License.  
Do whatever you want, just don’t blame the script when Facebook changes the UI again.
