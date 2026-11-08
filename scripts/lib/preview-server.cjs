const http = require("node:http");
const next = require("/app/node_modules/next");

const application = next({ dev: false, dir: "/app", hostname: "127.0.0.1", port: 3000 });
application.prepare().then(() => {
	const server = http.createServer(application.getRequestHandler());
	server.on("upgrade", application.getUpgradeHandler());
	server.listen("/transport/app.sock");
}).catch(error => { console.error(error); process.exit(1); });
