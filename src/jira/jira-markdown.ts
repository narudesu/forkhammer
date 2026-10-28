import z from "zod";

const nodeSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  attrs: z.record(z.string(), z.unknown()).optional(),
  marks: z
    .array(
      z.object({
        type: z.string(),
        attrs: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  content: z.array(z.unknown()).optional(),
});

/** Jira REST v3 returns Atlassian Document Format, not rendered HTML. */
export function jiraMarkdown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return render(value).trimEnd();
}

function wrap(text: string, marker: string): string {
  return text.replace(
    /^(\s*)([\s\S]*?)(\s*)$/,
    (_match, before, body, after) =>
      body ? `${before}${marker}${body}${marker}${after}` : text,
  );
}

function render(value: unknown): string {
  const node = nodeSchema.parse(value);
  const children = () => (node.content ?? []).map(render).join("");
  const attr = (name: string) => String(node.attrs?.[name] ?? "");
  switch (node.type) {
    case "text": {
      let text = (node.text ?? "").replace(/([\\`*_{}[\]<>])/g, "\\$1");
      for (const mark of node.marks ?? []) {
        switch (mark.type) {
          case "code": {
            const raw = node.text ?? "";
            const fence = "`".repeat(
              Math.max(
                1,
                ...[...raw.matchAll(/`+/g)].map(([s]) => s.length + 1),
              ),
            );
            text = `${fence} ${raw} ${fence}`;
            break;
          }
          case "strong":
            text = wrap(text, "**");
            break;
          case "em":
            text = wrap(text, "*");
            break;
          case "strike":
            text = wrap(text, "~~");
            break;
          case "link":
            text = `[${text}](<${String(mark.attrs?.href ?? "").replace(/>/g, "%3E")}>)`;
            break;
        }
      }
      return text;
    }
    case "doc":
      return children();
    case "paragraph":
      return `${children()}\n\n`;
    case "heading":
      return `${"#".repeat(Math.min(6, Math.max(1, Number(node.attrs?.level) || 1)))} ${children()}\n\n`;
    case "hardBreak":
      return "  \n";
    case "rule":
      return "---\n\n";
    case "codeBlock": {
      const raw = (node.content ?? [])
        .map((child) => nodeSchema.parse(child).text ?? "")
        .join("");
      const fence = "`".repeat(
        Math.max(3, ...[...raw.matchAll(/`+/g)].map(([s]) => s.length + 1)),
      );
      return `${fence}${attr("language")}\n${raw}\n${fence}\n\n`;
    }
    case "bulletList":
    case "orderedList": {
      const start = Number(node.attrs?.order) || 1;
      return `${(node.content ?? [])
        .map((child, i) => {
          const prefix = node.type === "bulletList" ? "- " : `${start + i}. `;
          const body = render(child).trimEnd();
          return (
            prefix +
            body.replace(/\n/g, `\n${" ".repeat(prefix.length)}`) +
            "\n"
          );
        })
        .join("")}\n`;
    }
    case "listItem":
      return children();
    case "blockquote":
      return `${children()
        .trimEnd()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
    case "mention":
      return attr("text") || attr("id");
    case "emoji":
      return attr("text") || attr("shortName");
    case "inlineCard":
      return `<${attr("url")}>`;
    default:
      return children();
  }
}
