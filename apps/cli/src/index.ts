#!/usr/bin/env node

import process from "node:process";
import { main } from "./app.js";

process.exitCode = await main(process.argv.slice(2), {
  cwd: process.cwd(),
  environment: process.env,
  writeStdout: (text) => process.stdout.write(text),
  writeStderr: (text) => process.stderr.write(text),
});
