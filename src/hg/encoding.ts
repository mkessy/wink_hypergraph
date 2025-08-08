// Graphbrain-compatible atom encoding & decoding

const ENCODE_MAP: ReadonlyArray<[RegExp, string]> = [
  [/\%/g, "%25"],
  [/\//g, "%2f"],
  [/\s/g, "%20"],
  [/\(/g, "%28"],
  [/\)/g, "%29"],
  [/\./g, "%2e"],
  [/\*/g, "%2a"],
  [/&/g, "%26"],
  [/@/g, "%40"],
  [/\n/g, "%0a"],
  [/\r/g, "%0d"],
] as const;

const DECODE_MAP: ReadonlyArray<[RegExp, string]> = [
  [/%0d/g, "\r"],
  [/%0a/g, "\n"],
  [/%40/g, "@"],
  [/%26/g, "&"],
  [/%2a/g, "*"],
  [/%2e/g, "."],
  [/%29/g, ")"],
  [/%28/g, "("],
  [/%20/g, " "],
  [/%2f/g, "/"],
  [/%25/g, "%"],
] as const;

export const str2atom = (s: string): string => {
  let out = s;
  for (const [re, rep] of ENCODE_MAP) out = out.replace(re, rep);
  return out;
};

export const atom2str = (s: string): string => {
  let out = s;
  for (const [re, rep] of DECODE_MAP) out = out.replace(re, rep);
  return out;
};
