import { describe, expect, it } from "vitest";
import { sniffMediaType } from "@/lib/media-prepare";
import { mediaRuleError } from "@/lib/media-rules";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const ftyp = (brand: string) => bytes([0, 0, 0, 24], "ftyp", brand, [0, 0, 0, 0]);

describe("sniffMediaType", () => {
  it("reads the real type from the first bytes", () => {
    expect(sniffMediaType(bytes([0xff, 0xd8, 0xff, 0xe1]))).toBe("image/jpeg");
    expect(sniffMediaType(bytes([0x89], "PNG", [13, 10, 26, 10]))).toBe("image/png");
    expect(sniffMediaType(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image/webp");
  });

  it("treats MP4-family videos (incl. Android 3GP) as MP4 and QuickTime as MOV", () => {
    expect(sniffMediaType(ftyp("isom"))).toBe("video/mp4");
    expect(sniffMediaType(ftyp("3gp4"))).toBe("video/mp4");
    expect(sniffMediaType(ftyp("qt  "))).toBe("video/quicktime");
  });

  it("flags HEIC photos for conversion and ignores unknown files", () => {
    expect(sniffMediaType(ftyp("heic"))).toBe("image");
    expect(sniffMediaType(bytes("GIF89a"))).toBeNull();
  });
});

describe("mediaRuleError", () => {
  it("explains HEIC photos the browser couldn't convert", () => {
    expect(mediaRuleError({ type: "image/heic", size: 1000 })).toMatch(/HEIC/);
    expect(mediaRuleError({ type: "image/jpeg", size: 1000 })).toBeNull();
  });
});
