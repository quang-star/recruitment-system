const { app, BrowserWindow, net, protocol, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appOrigin = "app://smart-recruitment";
const localWebOrigin = "http://127.0.0.1:5173";
const apiHeaders = [
  "accept", "authorization", "content-type", "idempotency-key", "range", "x-correlation-id"
];

protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);

async function forwardApiRequest(request, url) {
  if (request.initiatorOrigin !== appOrigin) {
    return new Response("Forbidden", { status: 403 });
  }

  const upstream = new URL(localWebOrigin);
  upstream.pathname = url.pathname;
  upstream.search = url.search;
  const headers = new Headers({ "accept-encoding": "identity" });
  for (const name of apiHeaders) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  try {
    return await fetch(upstream, {
      method: request.method,
      headers,
      body: request.body,
      duplex: "half",
      redirect: "error",
      signal: request.signal
    });
  } catch {
    return Response.json({ message: "Không thể kết nối tới dịch vụ tuyển dụng." }, { status: 503 });
  }
}

app.whenReady().then(() => {
  const distDir = path.join(app.getAppPath(), "dist");

  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    if (url.host !== "smart-recruitment") {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/api/")) {
      return forwardApiRequest(request, url);
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Not found", { status: 404 });
    }

    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return new Response("Bad path", { status: 400 }); }

    const candidate = path.resolve(distDir, `.${pathname}`);
    const relative = path.relative(distDir, candidate);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return new Response("Bad path", { status: 400 });
    }

    const file = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate
      : path.join(distDir, "index.html");
    return net.fetch(pathToFileURL(file).toString());
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "Smart Recruitment",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const destination = new URL(url);
    if (destination.protocol !== "app:" || destination.host !== "smart-recruitment") event.preventDefault();
  });
  void window.loadURL(`${appOrigin}/`);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
