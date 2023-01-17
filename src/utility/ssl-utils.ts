import fs from "fs";
import { Config } from "../lib/config.js";

export const prepareSslDetails = (config: Config) => {
  let { keyFilePath, certFilePath, pemFilePath } = config.ssl;
  let key = fs.readFileSync(keyFilePath, "utf8");
  let cert = fs.readFileSync(certFilePath, "utf8");
  let caBundle = fs.readFileSync(pemFilePath, "utf8");
  let ca = [];
  let buffer = [];
  for (let line of caBundle.split("\n")) {
    buffer.push(line);
    if (line.indexOf("-END CERTIFICATE-") > -1) {
      ca.push(buffer.join("\n"));
      buffer = [];
    }
  }
  return { key, cert, ca };
};
