// Frontend runtime configuration.
// The Cloudflare Worker serves both the static application and the /api/* API.
// Keep this relative so the same deployment works on workers.dev and a custom domain.
window.JOES_API_BASE = window.location.origin;
