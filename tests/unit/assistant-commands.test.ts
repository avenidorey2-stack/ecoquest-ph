import { describe, expect, it } from "vitest";
import { ASSISTANT_COMMANDS, parseCommand, suggestCommands } from "@/lib/assistant/command-list";
import { liveContent } from "@/lib/assistant/ai";
import type Anthropic from "@anthropic-ai/sdk";

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

describe("liveContent", () => {
  const block = (b: Record<string, unknown>) => b as unknown as Anthropic.Beta.BetaContentBlock;

  it("keeps everything when no fallback happened", () => {
    const content = [block({ type: "text", text: "hi" }), block({ type: "tool_use", id: "1", name: "get_rewards", input: {} })];
    expect(liveContent(content)).toEqual({ echo: content, after: content });
  });

  it("drops the declined attempt's thinking and tool calls before a fallback", () => {
    const text = block({ type: "text", text: "partial" });
    const fallback = block({ type: "fallback", from: { model: "a" }, to: { model: "b" } });
    const tool = block({ type: "tool_use", id: "2", name: "get_rewards", input: {} });
    const content = [block({ type: "thinking", thinking: "", signature: "x" }), block({ type: "tool_use", id: "1", name: "x", input: {} }), text, fallback, tool];
    expect(liveContent(content)).toEqual({ echo: [text, fallback, tool], after: [tool] });
  });
});
