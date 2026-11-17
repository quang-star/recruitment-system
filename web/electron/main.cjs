const { app, BrowserWindow, net, protocol, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appOrigin = "app://smart-recruitment";

protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: { standard: true, secure: true, supportFetchAPI: true }
}]);

app.whenReady().then(() => {
  const distDir = path.join(app.getAppPath(), "dist");

  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    if (url.host !== "smart-recruitment" || !["GET", "HEAD"].includes(request.method)) {
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ message: "Configure a public Gateway URL before packaging." }, { status: 503 });
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
