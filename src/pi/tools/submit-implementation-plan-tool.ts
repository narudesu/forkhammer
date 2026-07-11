import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ResolvablePromise } from "src/worker/resolvable-promise";
import { Type } from "typebox";

export const planSchema = Type.Object({
  questions: Type.Array(
    Type.Object({
      text: Type.String(),
      relatedFilePath: Type.String(),
    }),
  ),
  summary: Type.String(),
  todos: Type.Array(Type.String()),
  relatedFiles: Type.Array(
    Type.Object({
      path: Type.String(),
      note: Type.String(),
    }),
  ),
  clarity: Type.Number({ minimum: 0, maximum: 10 }),
});

type PlanSchema = Type.Static<typeof planSchema>;

export abstract class SubmitImplementationPlanTool {
  abstract register(pi: ExtensionAPI): void;
  abstract toolName: string;
  abstract oncePlan(): Promise<PlanSchema>;

  static create(): SubmitImplementationPlanTool {
    const toolName = "submit_implementation_plan";
    const planPromise = ResolvablePromise.create<PlanSchema>();

    return {
      toolName,
      oncePlan: () => Promise.resolve(planPromise.promise),
      register(pi) {
        pi.registerTool({
          name: toolName,
          label: "Submit implementation Plan",
          description: "Submits a implementation plan",
          parameters: planSchema,
          execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
            planPromise.resolve(params);
            return {
              content: [
                {
                  type: "text",
                  text: "Submitted implementation plan successfully.",
                },
              ],
              details: {},
            };
          },
        });
      },
    };
  }
}
