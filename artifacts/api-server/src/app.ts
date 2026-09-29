import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/.well-known/assetlinks.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "pixelstack.app.com",
      sha256_cert_fingerprints: [
        "96:27:C9:91:1A:4B:2B:72:17:18:4E:DD:E8:10:94:03:2F:82:BA:21:28:4F:CB:04:E2:AF:4F:BE:CE:6C:CC:B2",
      ],
    },
  }]);
});

app.use("/api", router);

app.get("/download-aab", (_req, res) => {
  res.download("/app/app-release-bundle.aab");
});

export default app;
