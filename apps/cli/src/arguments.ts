export type CliCommand =
  | {
      readonly kind: "run";
      readonly objective: string;
      readonly model: string;
      readonly tools: string;
      readonly root: string;
      readonly database: string;
      readonly threadId?: string;
      readonly ephemeral: boolean;
      readonly json: boolean;
    }
  | {
      readonly kind: "thread-list";
      readonly database: string;
      readonly json: boolean;
    }
  | {
      readonly kind: "thread-show";
      readonly database: string;
      readonly threadId: string;
      readonly replay: boolean;
      readonly json: boolean;
    }
  | { readonly kind: "help" };

interface ParsedArguments {
  readonly positionals: readonly string[];
  readonly json: boolean;
  readonly ephemeral: boolean;
  readonly model: string;
  readonly tools: string;
  readonly root: string;
  readonly database: string;
  readonly threadId?: string;
  readonly help: boolean;
}

const valueOptions = new Set(["--model", "--tools", "--root", "--db", "--thread-id"]);

function parseFlags(args: readonly string[], cwd: string): ParsedArguments {
  const positionals: string[] = [];
  let json = false;
  let ephemeral = false;
  let help = false;
  let model = "inspection";
  let tools = "repository";
  let root = cwd;
  let database = ".olympus/threads.sqlite";
  let threadId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined || argument === "--") {
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--ephemeral") {
      ephemeral = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (valueOptions.has(argument)) {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      if (argument === "--model") model = value;
      if (argument === "--tools") tools = value;
      if (argument === "--root") root = value;
      if (argument === "--db") database = value;
      if (argument === "--thread-id") threadId = value;
      continue;
    }
    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }
    positionals.push(argument);
  }

  return {
    positionals,
    json,
    ephemeral,
    model,
    tools,
    root,
    database,
    ...(threadId === undefined ? {} : { threadId }),
    help,
  };
}

export function parseCliCommand(args: readonly string[], cwd: string): CliCommand {
  const parsed = parseFlags(args, cwd);
  if (parsed.help) {
    return { kind: "help" };
  }
  const [first, second, third, ...rest] = parsed.positionals;
  if (first === "thread") {
    if (second === "list" && third === undefined) {
      return { kind: "thread-list", database: parsed.database, json: parsed.json };
    }
    if ((second === "show" || second === "replay") && third !== undefined && rest.length === 0) {
      return {
        kind: "thread-show",
        database: parsed.database,
        threadId: third,
        replay: second === "replay",
        json: parsed.json,
      };
    }
    throw new Error("Usage: olympus thread list|show <thread-id>|replay <thread-id> [--db path]");
  }

  const objectiveParts = first === "run" ? parsed.positionals.slice(1) : parsed.positionals;
  const objective = objectiveParts.join(" ").trim();
  if (objective.length === 0) {
    return { kind: "help" };
  }
  return {
    kind: "run",
    objective,
    model: parsed.model,
    tools: parsed.tools,
    root: parsed.root,
    database: parsed.database,
    ...(parsed.threadId === undefined ? {} : { threadId: parsed.threadId }),
    ephemeral: parsed.ephemeral,
    json: parsed.json,
  };
}
