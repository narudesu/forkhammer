import fs from "node:fs/promises";
import toml from "smol-toml";
import type { JiraClient } from "../../jira/jira";
import type {
  Blocker,
  BlockersArtifact,
  RelatedMergeRequest,
  TicketReference,
} from "./operations-artifact-protocol";

export interface ConfiguredTicket {
  team: "fe" | "be";
  url: string;
}

export interface ConfiguredBlocker {
  id: string;
  title: string;
  comments: string[];
  blockedTickets: ConfiguredTicket[];
  blockingTickets: ConfiguredTicket[];
}

export function extractJiraKey(url: string): string {
  const match = url.match(/(?:\/browse\/|\b)([A-Z][A-Z0-9]+-\d+)(?:\b|$)/);
  if (!match?.[1]) throw new Error(`jira-key-missing:${url}`);
  return match[1];
}

export function isBlockerIdentifier(value: string): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value);
}

export function getResolutionSuggestion(opts: {
  allJiraResolved: boolean;
  allMergeRequestsMerged: boolean;
}) {
  const suggestionSources = [
    ...(opts.allJiraResolved ? (["jira"] as const) : []),
    ...(opts.allMergeRequestsMerged ? (["gitlab"] as const) : []),
  ];
  const reasons = [
    ...(opts.allJiraResolved ? ["All linked Jira tickets are resolved."] : []),
    ...(opts.allMergeRequestsMerged
      ? ["All related GitLab merge requests are merged."]
      : []),
  ];
  return {
    suggestedResolved: suggestionSources.length > 0,
    suggestionSources,
    suggestionReason: reasons.join(" ") || "No resolution evidence.",
  };
}

export function parseBlockerConfig(raw: string): ConfiguredBlocker[] {
  const parsed = toml.parse(raw) as Record<string, unknown>;
  const blockers = parsed.blockers;
  if (raw.trim().length === 0) return [];
  if (!isRecord(blockers)) throw new Error("blockers-config-missing");

  return Object.entries(blockers).map(([id, value]) => {
    if (!isBlockerIdentifier(id) || !isRecord(value)) {
      throw new Error(`blocker-identifier-invalid:${id}`);
    }
    return {
      id,
      title: requiredString(value.title, `blocker-title:${id}`),
      comments: stringArray(value.comments ?? [], `blocker-comments:${id}`),
      blockedTickets: ticketArray(
        value.blocked_tickets ?? [],
        `blocked-tickets:${id}`,
      ),
      blockingTickets: ticketArray(
        value.blocking_tickets ?? [],
        `blocking-tickets:${id}`,
      ),
    };
  });
}

export async function buildBlockersArtifact(opts: {
  filePath: string;
  jira: JiraClient;
  searchRelatedMergeRequests: (key: string) => Promise<RelatedMergeRequest[]>;
  readFile?: (path: string) => Promise<string>;
}): Promise<BlockersArtifact> {
  const raw = await (opts.readFile ?? readTextFile)(opts.filePath);
  const configured = parseBlockerConfig(raw);
  return Promise.all(
    configured.map(async (blocker): Promise<Blocker> => {
      const configuredTickets = [
        ...blocker.blockedTickets,
        ...blocker.blockingTickets,
      ];
      const tickets = await Promise.all(
        configuredTickets.map((ticket) => enrichTicket(ticket, opts.jira)),
      );
      const related = deduplicateRelated(
        await Promise.all(
          [...new Set(tickets.map((ticket) => ticket.key))].map((key) =>
            opts.searchRelatedMergeRequests(key),
          ),
        ),
      );
      const allJiraResolved =
        tickets.length > 0 &&
        tickets.every((ticket) => ticket.status === "Done");
      const allMergeRequestsMerged =
        related.length > 0 && related.every((mr) => mr.state === "merged");
      const suggestion = getResolutionSuggestion({
        allJiraResolved,
        allMergeRequestsMerged,
      });
      return {
        id: blocker.id,
        title: blocker.title,
        comments: blocker.comments,
        blockedTickets: tickets.slice(0, blocker.blockedTickets.length),
        blockingTickets: tickets.slice(blocker.blockedTickets.length),
        relatedMergeRequests: related,
        ...suggestion,
      };
    }),
  );
}

async function enrichTicket(
  ticket: ConfiguredTicket,
  jira: JiraClient,
): Promise<TicketReference> {
  const key = extractJiraKey(ticket.url);
  try {
    const issue = await jira.getIssueContext({ issueKey: key });
    return {
      team: ticket.team,
      key,
      title: issue.summary,
      status: normalizeStatus(issue.status),
      url: ticket.url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(":404:")) throw error;
    return {
      team: ticket.team,
      key,
      title: null,
      status: null,
      url: ticket.url,
    };
  }
}

function normalizeStatus(status: string): "In progress" | "Done" | "Blocked" {
  if (status.toLowerCase() === "done") return "Done";
  if (status.toLowerCase() === "blocked") return "Blocked";
  return "In progress";
}

function deduplicateRelated(
  groups: RelatedMergeRequest[][],
): RelatedMergeRequest[] {
  const seen = new Set<string>();
  return groups.flat().filter((mr) => {
    const id = `${mr.project}:${mr.iid}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function ticketArray(value: unknown, error: string): ConfiguredTicket[] {
  if (!Array.isArray(value)) throw new Error(error);
  return value.map((ticket) => {
    if (
      !isRecord(ticket) ||
      (ticket.team !== "fe" && ticket.team !== "be") ||
      typeof ticket.url !== "string"
    ) {
      throw new Error(error);
    }
    return { team: ticket.team, url: ticket.url };
  });
}

function stringArray(value: unknown, error: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new Error(error);
  return value;
}

function requiredString(value: unknown, error: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(error);
  return value;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readTextFile(path: string): Promise<string> {
  return fs.readFile(path, "utf8");
}

export function relatedMergeRequestsForKey(
  mergeRequests: RelatedMergeRequest[],
  key: string,
): RelatedMergeRequest[] {
  return mergeRequests.filter((mr) => mr.title.includes(key));
}
