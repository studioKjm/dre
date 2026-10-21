#!/usr/bin/env node
import { runAnalyze, runEval } from "./commands.js";

const io = { out: (l: string) => console.log(l), err: (l: string) => console.error(l) };
const [cmd, ...rest] = process.argv.slice(2);

const code =
  cmd === "eval" ? await runEval(rest, io) : cmd === "analyze" ? runAnalyze(rest, io) : (io.err("usage: dre <analyze|eval> ..."), 1);
process.exit(code);
