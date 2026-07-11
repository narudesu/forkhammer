import Heading from "@theme/Heading";
import clsx from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  image: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Ticket-Driven Workflow",
    image: require("@site/static/img/ticket-workflow.png").default,
    description: (
      <>
        Start from a Jira key and let forkhammer prepare a focused workspace for
        implementation and review.
      </>
    ),
  },
  {
    title: "Isolated Worktrees",
    image: require("@site/static/img/isolated-worktrees.png").default,
    description: (
      <>
        Each task runs in its own git worktree so issue validation and code
        changes stay scoped to the ticket.
      </>
    ),
  },
];

function Feature({ title, image, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <div className="text--center" style={{ marginBottom: 24 }}>
        <img src={image} alt={title} width={128} height={128} />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
