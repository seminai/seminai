export function renderLoginPage(options: {
  readonly error?: string;
  readonly query: string;
}): string {
  const error = options.error ? `<p class="error">${escapeHtml(options.error)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Sign in to Seminai</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0f1712; color: #e8efe9; margin: 0; }
    main { max-width: 380px; margin: 12vh auto; padding: 24px; background: #18241c; border-radius: 16px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { color: #a9b8ae; }
    label { display: block; margin: 12px 0 4px; font-size: .85rem; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #2c3d32; background: #10180f; color: #e8efe9; }
    button { margin-top: 16px; width: 100%; padding: 12px; border: 0; border-radius: 8px; background: #3d8c5c; color: white; font-weight: 600; cursor: pointer; }
    .error { color: #f3b4b4; }
  </style>
</head>
<body>
  <main>
    <h1>Seminai MCP</h1>
    <p>Sign in to connect Claude or ChatGPT to your Seminai and QDC data.</p>
    ${error}
    <form method="post" action="/oauth/login">
      <input type="hidden" name="return_query" value="${escapeHtml(options.query)}"/>
      <label>Email</label>
      <input type="email" name="email" autocomplete="username" required/>
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password" required/>
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
