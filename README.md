# Webflow Toolkit

A collection of browser-based productivity tools for Webflow creators.

## SEO Alt Text Generator

Open [index.html](./index.html) in a browser to generate SEO-friendly image filenames and descriptive alt text for Webflow Templates. No build tools, accounts, paid APIs, or external services are required.

### Features

- Live generation from an image description and a reusable template name.
- Editable filename and alt text with individual copy buttons.
- 100-character output limits, counters, and input validation.
- Filename normalization and readable alt text.
- Responsive layout and accessible input labels, focus states, and status messages.

### Example

Template name: `AgentFlow`

Image description: `Agent Monitoring Dashboard`

Filename: `agent-monitoring-dashboard-agentflow-webflow-template`

Alt text: `Agent Monitoring Dashboard AgentFlow Webflow Template`

### Deployment

This is a standalone static HTML application. Host `index.html` on any static web host or enable GitHub Pages for this repository.

> Accessibility note: Image alt text should describe the image's actual content or function. The requested template suffix is appended by this tool, but you can manually edit the result when the context calls for a shorter or more natural alternative.


## Image Compressor

Open `image-compressor.html` through a static web server (including GitHub Pages).
Smart mode is the default. PNGs use UPNG.js adaptive palettes of 256, 192 or 128
colors, with encode/decode verification and numerical quality checks on black and
white backgrounds. Checks include 32-pixel tiles and transparency errors; they are
heuristics, not a guarantee of visual equivalence. The tool stops reducing color
count when it reaches 385,000 bytes. Quality takes priority if the target cannot be
reached. JPEG/WebP use browser encoding at quality 0.95 down to 0.8. AVIF and
animations remain unchanged by smart encoding. Original format and dimensions are
retained; smart encoding can change pixels and remove metadata. Review the output.

Lossless mode retains exact PNG image data and metadata, and leaves other formats
unchanged. All successful results remain downloadable individually and as a ZIP,
including those over the size target. Files never leave the browser. PNG palette
encoding runs in a worker; failure or timeout retains the original/lossless result.

The locally bundled dependencies are UPNG.js 2.1.0 and pako 1.0.11 from their npm
packages. Their MIT licenses are included in `vendor`. No TinyPNG API or proprietary
algorithm is used, and matching TinyPNG file sizes is not guaranteed.
