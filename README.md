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
