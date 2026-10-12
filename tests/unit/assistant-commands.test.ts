import { describe, expect, it } from "vitest";
import { ASSISTANT_COMMANDS, parseCommand, suggestCommands } from "@/lib/assistant/command-list";
import { plainText } from "@/lib/assistant/ai";

const names = (input: string) => suggestCommands(input).map((c) => c.name);

describe("suggestCommands", () => {
  it("lists every command for a bare slash", () => {
    expect(names("/")).toEqual(ASSISTANT_COMMANDS.map((c) => c.name));
  });

  it("narrows by what's typed, ignoring case", () => {
    expect(names("/sl")).toEqual(["slots"]);
    expect(names("/P")).toEqual(["prices", "points"]);
  });

  it("stops suggesting once a word follows, or for normal text", () => {
    expect(names("/prices narra")).toEqual([]);
    expect(names("how do I plant?")).toEqual([]);
    expect(names("/zzz")).toEqual([]);
  });
});

describe("parseCommand", () => {
  it("splits the command from its argument", () => {
    expect(parseCommand("  /Prices   Narra tree ")).toEqual({ name: "prices", arg: "Narra tree" });
    expect(parseCommand("/slots")).toEqual({ name: "slots", arg: "" });
  });

  it("is null for anything that isn't a command", () => {
    expect(parseCommand("what are slots?")).toBeNull();
    expect(parseCommand("/")).toBeNull();
  });
});

describe("plainText", () => {
  it("removes Markdown bold and headings but keeps the words", () => {
    expect(plainText("## Steps\n1. **Pumunta sa Dashboard** → __Planting__\n• 5 × 2 = 10 pts ")).toBe(
      "Steps\n1. Pumunta sa Dashboard → Planting\n• 5 × 2 = 10 pts",
    );
  });
});
